import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
import { schema, capabilities } from './schema.js';
import { AppError, assert, checkKeys, fail } from './errors.js';
import { PncpClient } from './pncp.js';
import { QueryService } from './query.js';
import { demoFetch } from './demo.js';
import { createDevReload } from './dev-reload.js';

async function readJson(req) {
  assert((req.headers['content-type'] || '').split(';')[0]==='application/json','CONTENT_TYPE_REQUIRED','Envie Content-Type: application/json.');
  if(Number(req.headers['content-length'])>256*1024)fail('BODY_TOO_LARGE','Corpo acima de 256 KiB.',413);
  const chunks=[];let bytes=0;
  for await (const chunk of req) {bytes+=chunk.length;assert(bytes<=256*1024,'BODY_TOO_LARGE','Corpo acima de 256 KiB.',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_JSON','Corpo JSON inválido.');}
}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
function getParams(url, allowed) {
  for(const key of url.searchParams.keys())assert(allowed.includes(key) && url.searchParams.getAll(key).length===1,'UNKNOWN_PARAMETER',`Parâmetro inválido ou repetido: ${key}.`);
}
function documentType(url) {const type=url.searchParams.get('tipos_documento') ?? 'edital';assert(['edital','contrato'].includes(type),'DOCUMENT_TYPE_UNAVAILABLE','Escolha edital ou contrato.',409);return type;}
export function createApplication(config,{fetcher,logger=()=>{},liveReload=false}={}) {
  const devReload=liveReload?createDevReload():null;
  const client=new PncpClient(config,{fetcher:fetcher || (config.DEMO_MODE?demoFetch:undefined),logger});
  const service=new QueryService(config,client);let activeOperations=0;
  const server=http.createServer(async(req,res)=>{
    const id=randomUUID(),start=Date.now(),controller=new AbortController();let counted=false;
    req.on('aborted',()=>controller.abort(new AppError('CANCELLED','Cliente cancelou a operação.',499)));
    res.on('close',()=>{if(!res.writableEnded)controller.abort(new AppError('CANCELLED','Cliente desconectou.',499));});
    let url;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Request-ID',id);
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
    try {
      try{url=new URL(req.url,'http://localhost');}catch{fail('INVALID_URL','Endereço de requisição inválido.',400);}
      if(devReload && await devReload.handle(req,res,url))return;
      if(url.pathname==='/api/schema' && req.method==='GET'){getParams(url,[]);return json(res,200,schema(config));}
      if(url.pathname==='/api/health' && req.method==='GET'){getParams(url,[]);return json(res,200,{status:'ok',api_version:'2.0',source:config.DEMO_MODE?'demo':'pncp',live:!config.DEMO_MODE,active_operations:activeOperations,last_pncp_call:config.DEMO_MODE?null:client.lastCall,now:new Date().toISOString()});}
      if(url.pathname==='/imports' || url.pathname.startsWith('/api/imports'))fail('IMPORTS_REMOVED','Importação descontinuada. Os dados são consultados diretamente no PNCP.',410);
      if(url.pathname.startsWith('/api/')) {
        assert(activeOperations<config.PNCP_MAX_CONCURRENT_OPERATIONS,'CONCURRENCY_LIMIT','Há operações demais em andamento. Tente novamente em instantes.',429,{retry_after_seconds:2});
        activeOperations++;counted=true;
        if(url.pathname==='/api/query' && req.method==='POST'){getParams(url,[]);return json(res,200,await service.execute(await readJson(req),controller.signal,id));}
        if(url.pathname==='/api/export' && req.method==='POST') {
          getParams(url,[]);const body=await readJson(req);checkKeys(body,['query'],'export');assert(body.query && typeof body.query==='object' && !Array.isArray(body.query),'INVALID_TYPE','query deve ser um objeto.');
          const {csv,metadata}=await service.export(body.query,controller.signal,id);
          const stamp=metadata.finished_at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
          res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="compras-${config.DEMO_MODE?'demo':'pncp'}-${stamp}.csv"`,'X-PNCP-Started-At':metadata.started_at,'X-PNCP-Finished-At':metadata.finished_at,'X-PNCP-Source-Total':String(metadata.source_total),'X-Exported-Rows':String(metadata.data.length),'X-Snapshot-Guaranteed':'false','Content-Length':csv.byteLength});return res.end(csv);
        }
        if(url.pathname==='/api/pncp/filters' && req.method==='GET') {
          getParams(url,['tipos_documento','normativos_base','campo']);const norm=url.searchParams.get('normativos_base'),field=url.searchParams.get('campo');
          const type=documentType(url);
          assert(!field || capabilities(config).some(c=>!c.reserved && c.name===field && c.domain && c.documents.includes(type)),'INVALID_DOMAIN_FIELD','Campo de domínio não disponível para o tipo documental.');
          assert(!norm || /^\d+(?:\|\d+)*$/.test(norm),'INVALID_DOMAIN','Normativos devem ser IDs separados por pipe.');
          return json(res,200,await service.domains(type,norm?.split('|'),controller.signal,id,field));
        }
        if(url.pathname==='/api/pncp/suggest' && req.method==='GET') {
          getParams(url,['tipos_documento','campo','q','tam_pagina']);const field=url.searchParams.get('campo'),q=url.searchParams.get('q'),size=Number(url.searchParams.get('tam_pagina') ?? 20);
          const type=documentType(url);
          assert(capabilities(config).some(c=>!c.reserved && c.name===field && c.state==='enabled' && c.domain_kind==='suggest' && c.documents.includes(type)),'INVALID_SUGGEST_FIELD','Campo de sugestão não habilitado para o tipo documental.');
          assert(typeof q==='string' && q.length>=3 && q.length<=128 && Number.isSafeInteger(size) && size>=1 && size<=20,'INVALID_SUGGEST','Sugestões exigem 3–128 caracteres e tamanho de 1–20.');
          return json(res,200,await service.suggest(type,field,q,size,controller.signal,id));
        }
        const detail=url.pathname.match(/^\/api\/contratacoes\/(\d{14})\/(\d{4})\/(\d+)\/(itens|arquivos|atas|contratos|historico)$/);
        if(detail && req.method==='GET') {
          getParams(url,['pagina','tamanhoPagina']);const page=Number(url.searchParams.get('pagina') ?? 1),size=Number(url.searchParams.get('tamanhoPagina') ?? 100);
          assert(Number.isSafeInteger(page) && page>0 && [10,25,50,100].includes(size) && BigInt(detail[3])>0n,'INVALID_PAGINATION','Paginação de detalhes inválida.');
          const purchase={cnpj:detail[1],ano:detail[2],sequencial:detail[3]};
          return json(res,200,await (detail[4]==='itens' ? service.details(purchase,page,size,controller.signal,id) : service.related(purchase,detail[4],page,size,controller.signal,id)));
        }
        fail('NOT_FOUND','Rota ou método não encontrado.',404);
      }
      assert(req.method==='GET' || req.method==='HEAD','METHOD_NOT_ALLOWED','Método não permitido.',405);
      const routes={
        '/':['../public/index.html','text/html; charset=utf-8'],
        '/app.js':['../public/app.js','text/javascript; charset=utf-8'],
        '/styles.css':['../public/styles.css','text/css; charset=utf-8'],
        '/favicon.svg':['../public/favicon.svg','image/svg+xml'],
        '/vendor/tabulator.min.js':['../node_modules/tabulator-tables/dist/js/tabulator.min.js','text/javascript; charset=utf-8'],
        '/vendor/tabulator.min.css':['../node_modules/tabulator-tables/dist/css/tabulator.min.css','text/css; charset=utf-8'],
      };
      const asset=routes[url.pathname];assert(asset,'NOT_FOUND','Página não encontrada.',404);
      let bytes=await readFile(new URL(asset[0],import.meta.url));if(devReload && url.pathname==='/')bytes=devReload.inject(bytes);res.writeHead(200,{'Content-Type':asset[1],'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error) {
      const appError=error instanceof AppError?error:new AppError('INTERNAL_ERROR','Erro interno ao concluir a operação.',500);
      if(!res.destroyed && !res.headersSent) {
        if(appError.details.retry_after_seconds)res.setHeader('Retry-After',String(appError.details.retry_after_seconds));
        json(res,appError.status,{error:{code:appError.code,message:appError.message,request_id:id,retryable:appError.retryable,details:appError.details}});
      }
      logger({event:'operation_error',request_id:id,code:appError.code,...(appError.code==='INTERNAL_ERROR'?{diagnostic:error.message}:{}),elapsed_ms:Date.now()-start});
    }finally {if(counted)activeOperations--;logger({event:'operation',request_id:id,method:req.method,route:url?.pathname ?? null,status:res.statusCode,elapsed_ms:Date.now()-start});}
  });
  server.requestTimeout=Math.max(30000,config.PNCP_OPERATION_TIMEOUT_SECONDS*1000+10000);server.headersTimeout=10000;
  return {server,service,client,close:async()=>{devReload?.close();await new Promise(resolve=>server.close(resolve));await client.close();}};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const env={...process.env};
  for(const [flag,key]of [['--host','HOST'],['--port','PORT']]) {
    const at=process.argv.indexOf(flag);if(at>=0)env[key]=process.argv[at+1] || '';
  }
  const config=loadConfig(env);if(process.argv.includes('--demo'))config.DEMO_MODE=true;
  const app=createApplication(config,{liveReload:process.argv.includes('--dev'),logger:metadata=>process.stdout.write(JSON.stringify(metadata)+'\n')});
  app.server.listen(config.PORT,config.HOST,()=>console.log(`Compras Web: http://${config.HOST}:${config.PORT} (${config.DEMO_MODE?'DEMONSTRAÇÃO — dados sintéticos':'PNCP ao vivo'})`));
  const shutdown=()=>{app.close().then(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();};
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
