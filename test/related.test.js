import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/server.js';
import { PncpClient } from '../src/pncp.js';
import { QueryService } from '../src/query.js';
import { demoFetch, demoRelated } from '../src/demo.js';
import { config } from './helpers.js';

const purchase={cnpj:'00000000000000',ano:'2026',sequencial:'1'};
function fixture(handler=demoFetch) {
  const requests=[],cfg=config({DEMO_MODE:true});
  const client=new PncpClient(cfg,{fetcher:(url,init)=>{requests.push(new URL(url));return handler(url,init);}});
  return {requests,client,service:new QueryService(cfg,client)};
}
test('RELATED-01: as quatro listagens usam os serviços oficiais e mantêm paginação independente',async()=>{
  const f=fixture();
  for(const resource of ['arquivos','atas','contratos','historico']){
    const result=await f.service.related(purchase,resource,1,10);
    assert.equal(result.resource,resource);assert.equal(result.total,demoRelated(purchase,resource).length);assert.equal(result.data.length,Math.min(10,result.total));
    assert.equal(result.snapshot_guaranteed,false);assert.equal(result.source,'demo');
    if(result.has_more){const last=await f.service.related(purchase,resource,2,10);assert.equal(last.data.length,2);assert.equal(last.has_more,false);assert.equal(last.complete,true);}
  }
  const contracts=f.requests.find(u=>u.pathname.includes('/contratos/contratacao/'));
  assert.equal(contracts.pathname,'/api/pncp/v1/orgaos/00000000000000/contratos/contratacao/2026/1');assert.equal(contracts.searchParams.get('tamanhoPagina'),'10');
  assert(f.requests.some(u=>u.pathname.endsWith('/arquivos/quantidade')));assert(f.requests.some(u=>u.pathname.endsWith('/historico/quantidade')));
  assert(!f.requests.some(u=>u.pathname.includes('/itens') || u.pathname.includes('/api/search')));
});
test('RELATED-02: documentos, links de atas/contratos, cancelamento e histórico são projetados sem perder precisão',async()=>{
  const f=fixture();
  const files=await f.service.related(purchase,'arquivos',1,10);assert.match(files.data[0].titulo,/Edital/);assert.equal(files.data[0].tipo,'Edital');assert.match(files.data[0].url,/\/compras\/2026\/1\/arquivos\/1$/);
  const atas=await f.service.related(purchase,'atas',1,10);assert.equal(atas.data[0].url,'https://pncp.gov.br/app/atas/00000000000000/2026/1/1');assert.equal(atas.data[2].data_cancelamento,'2026-10-01T12:00:00');
  const contracts=await f.service.related(purchase,'contratos',1,10);assert.equal(contracts.data[0].url,'https://pncp.gov.br/app/contratos/00000000000000/2026/1');assert.equal(contracts.data[1].valor_global,'9007199254740993.12345');
  const history=await f.service.related(purchase,'historico',1,10);assert.equal(history.data[0].evento,'Inclusão - Contratação');assert.equal(history.data[1].nome,'Anexo 2');assert.equal(history.data[1].justificativa,'Exigência Legal');
});
test('RELATED-03: zero, HTTP 204 e HTTP 404 de contratos geram listas vazias; outras falhas permanecem erros',async()=>{
  for(const resource of ['arquivos','atas','contratos','historico']){
    const f=fixture(url=>url.endsWith('/quantidade')?Response.json(0):new Response(null,{status:204}));
    const result=await f.service.related(purchase,resource,1,10);assert.equal(result.total,0);assert.deepEqual(result.data,[]);assert.equal(result.has_more,false);assert.equal(f.requests.length,1);
  }
  const missing=fixture(()=>new Response(null,{status:404})),empty=await missing.service.related(purchase,'contratos',1,10);
  assert.equal(empty.total,0);assert.deepEqual(empty.data,[]);assert.equal(empty.total_pages,1);assert.equal(empty.has_more,false);assert.equal(empty.complete,true);
  await assert.rejects(missing.service.related(purchase,'contratos',2,10),e=>e.code==='PAGE_OUT_OF_RANGE' && e.details.last_page===1);
  for(const resource of ['arquivos','atas','historico']){const f=fixture(()=>new Response(null,{status:404}));await assert.rejects(f.service.related(purchase,resource,1,10),e=>e.code==='PNCP_HTTP_ERROR');}
  for(const status of [500,503]){const f=fixture(()=>new Response(null,{status}));await assert.rejects(f.service.related(purchase,'contratos',1,10),e=>e.code===(status===503?'PNCP_UNAVAILABLE':'PNCP_HTTP_ERROR'));}
});
test('RELATED-04: contagem divergente, formato inválido e página fora do total não passam como sucesso',async()=>{
  const responses=[{data:[],totalRegistros:1},{data:[null],totalRegistros:1},{data:{},totalRegistros:0},{data:[],totalRegistros:-1},{data:[{}],totalRegistros:1,numeroPagina:2}];
  for(const value of responses){const f=fixture(()=>Response.json(value));await assert.rejects(f.service.related(purchase,'atas',1,10),e=>['INVALID_UPSTREAM','SOURCE_CHANGED'].includes(e.code));}
  const f=fixture();await assert.rejects(f.service.related(purchase,'arquivos',3,10),e=>e.code==='PAGE_OUT_OF_RANGE' && e.details.last_page===2);assert.equal(f.requests.length,1);
  const changed=fixture(url=>Response.json(url.endsWith('/quantidade')?2:[{titulo:'Um arquivo'}]));await assert.rejects(changed.service.related(purchase,'arquivos',1,10),e=>e.code==='SOURCE_CHANGED');
});
test('RELATED-05: números JSON monetários são exatos e links inseguros ou sem identidade são omitidos',async()=>{
  const contracts=fixture(()=>new Response('{"data":[{"valorGlobal":9007199254740993.12345,"orgaoEntidade":{"cnpj":"01234567000189"},"anoContrato":2025,"sequencialContrato":7}],"totalRegistros":1}',{headers:{'Content-Type':'application/json'}}));
  const result=await contracts.service.related(purchase,'contratos',1,10);assert.equal(result.data[0].valor_global,'9007199254740993.12345');assert.equal(result.data[0].url,'https://pncp.gov.br/app/contratos/01234567000189/2025/7');
  const files=fixture(url=>Response.json(url.endsWith('/quantidade')?1:[{titulo:'<script>alert(1)</script>',url:'javascript:alert(1)'}]));assert.equal((await files.service.related(purchase,'arquivos',1,10)).data[0].url,null);
  const missing=fixture(()=>Response.json({data:[{anoContrato:2026,sequencialContrato:1}],totalRegistros:1}));assert.equal((await missing.service.related(purchase,'contratos',1,10)).data[0].url,null);
});
test('RELATED-06: HTTP expõe quatro rotas e rejeita parâmetros inválidos antes da rede',async()=>{
  const requests=[],app=createApplication(config({DEMO_MODE:true}),{fetcher:(url,init)=>{requests.push(url);return demoFetch(url,init);}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}/api/contratacoes/00000000000000/2026/1`;
  try{
    for(const resource of ['arquivos','atas','contratos','historico']){const response=await fetch(`${base}/${resource}?pagina=1&tamanhoPagina=10`);assert.equal(response.status,200);assert.equal((await response.json()).resource,resource);}
    const count=requests.length;
    for(const suffix of ['/arquivos?pagina=0','/atas?tamanhoPagina=3','/contratos?pagina=1&pagina=2','/historico?extra=true','/inexistente','/../0/arquivos'])assert((await fetch(base+suffix)).status>=400);
    assert.equal(requests.length,count);
    const last=await fetch(`${base}/arquivos?pagina=2&tamanhoPagina=10`);assert.equal((await last.json()).data.length,2);
  }finally{await app.close();}
});
test('RELATED-07: número de controle real de ata usa o ano da compra e preserva o sequencial da ata',async()=>{
  const f=fixture(url=>Response.json({data:[{numeroAtaRegistroPreco:'100',anoAta:2026,numeroControlePNCP:'00000000000000-1-000001/2025-000010',sequencialAta:10}],totalRegistros:11,numeroPagina:2}));
  const result=await f.service.related(purchase,'atas',2,10);assert.equal(result.data.length,1);assert.equal(result.has_more,false);assert.equal(result.data[0].url,'https://pncp.gov.br/app/atas/00000000000000/2025/1/10');
});
