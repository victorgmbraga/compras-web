import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from '../src/schema.js';
import { validateQuery } from '../src/validation.js';
import { serializeSearch, operation } from '../src/pncp.js';
import { project, safeLink } from '../src/adapter.js';
import { parse } from 'lossless-json';
import { config,document,service,query,json } from './helpers.js';

test('LIVE-01/OLD-01: esquema completo sem banco, importação ou rede',()=>{
  const s=schema(config());assert.equal(s.capabilities.length,87);assert.equal(s.categories.length,18);assert.equal(s.presets.length,11);assert.equal(s.source,'pncp');assert.equal(s.live,true);assert(!('database' in s));
  assert.equal(s.presets.find(p=>p.id==='desenvolvimento').available,false);
});
test('HTTP-01: pipe codificado uma vez; false e zero preservados',()=>{
  const cfg=config({PNCP_VALIDATED_FILTERS:'srp,item_quantidade_min,ordem_classificacao_min'});
  const q=validateQuery(query({pncp_filters:{ufs:['DF','GO'],srp:false,item_quantidade_min:'0.00',ordem_classificacao_min:0}}),cfg);
  const params=serializeSearch(q,1,10);assert.equal(params.get('ufs'),'DF|GO');assert(params.toString().includes('DF%7CGO'));assert(!params.toString().includes('%257C'));assert.equal(params.get('srp'),'false');assert.equal(params.get('item_quantidade_min'),'0.00');assert.equal(params.get('ordem_classificacao_min'),'0');assert(!params.has('total'));
});
test('HTTP-03: desconhecidos, reservados, pendentes e status rejeitados antes da rede',async()=>{
  const s=service([]);
  for(const input of [query({extra:true}),query({status:'vigente'}),query({pncp_filters:{foo:1}}),query({pncp_filters:{total:true}}),query({pncp_filters:{srp:true}}),query({document_type:'contrato'})])await assert.rejects(s.service.execute(input),error=>error.status===400 || error.status===409);
  assert.equal(s.requests.length,0);
});
test('HTTP-02: nomes não são aceitos como IDs e datas reais são verificadas',()=>{
  for(const pncp_filters of [{orgaos:['Ministério']},{ufs:['XX']},{data_publicacao_inicio:'2026-02-30'},{valor_total_estimado_min:100},{data_publicacao_inicio:'2026-10-01',data_publicacao_fim:'2026-09-01'},{valor_total_estimado_min:'10',valor_total_estimado_max:'2'}])assert.throws(()=>validateQuery(query({pncp_filters}),config()));
  assert.throws(()=>validateQuery(query({page:true}),config()));assert.throws(()=>validateQuery(query({size:30}),config()));
});
test('HTTP-03: domínios pequenos são conferidos na fonte',async()=>{
  const s=service([document(1)]);await assert.rejects(s.service.execute(query({pncp_filters:{modalidades:['999']}})),e=>e.code==='INVALID_DOMAIN');assert.equal(s.requests.length,1);assert(s.requests[0].pathname.endsWith('/filters'));
});
test('DATA-01: precisão decimal, identificadores e ausência preservados',()=>{
  const raw=parse('{"id":123,"doc_type":"_doc","document_type":"edital","description":"NULL","valor_total_estimado":9007199254740993.25,"valor_total_homologado":0,"tem_resultado":false}');
  const d=project(raw);assert.equal(d.id,'123');assert.equal(d.objeto_compra,'NULL');assert.equal(d.valor_total_estimado,'9007199254740993.25');assert.equal(d.valor_total_homologado,'0');assert.equal(d.tem_resultado,false);assert.equal(d.orgao_nome,null);
});
test('UI-03: caminho PNCP preserva /app e links executáveis são rejeitados',()=>{
  assert.equal(safeLink('/editais/123/2026/1',true),'https://pncp.gov.br/app/editais/123/2026/1');assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('https://evil.example/editais/123',true),'https://pncp.gov.br/app');assert.equal(safeLink('https://user:password@example.com'),null);
});
test('DATA-02: arrays, objetos e booleanos incompatíveis não viram ausência',()=>{
  for(const extra of [{description:false},{description:[]},{valor_total_estimado:false},{tem_resultado:'false'}])assert.throws(()=>project(document(1,extra)),e=>e.code==='INVALID_UPSTREAM');
});
test('LIVE-02/MEM-01: consultas iguais fazem novas chamadas e recebem novas respostas',async()=>{
  let i=0;const s=service([],{handler:()=>json({items:[document(1,{description:`Versão ${++i}`})],total:1})});
  assert.equal((await s.service.execute(query())).data[0].objeto_compra,'Versão 1');assert.equal((await s.service.execute(query())).data[0].objeto_compra,'Versão 2');assert.equal(s.requests.length,2);
});
test('PAGE-01: janela de 10000 separada do total PNCP',async()=>{
  const s=service([],{handler:()=>json({items:Array.from({length:10},(_,i)=>document(i+1)),total:12500})});
  const r=await s.service.execute(query());assert.equal(r.total,12500);assert.equal(r.accessible_total,10000);assert.equal(r.last_page,1000);assert.equal(r.last_row,10000);assert(r.window_limited);assert.equal(r.collection_complete,false);
  await assert.rejects(s.service.export(query(),'all'),e=>e.code==='EXPORT_TOO_BROAD');
});
test('PAGE-02/PAGE-03: zero e página fora do intervalo',async()=>{
  const s=service([]),r=await s.service.execute(query());assert.equal(r.last_page,1);assert.equal(r.last_row,0);assert.equal(r.total,0);
  await assert.rejects(s.service.execute(query({page:2})),e=>e.code==='PAGE_OUT_OF_RANGE' && e.details.last_page===1);
});
test('HTTP-04/LIVE-03: 204, HTML e protocolo inválido não viram zero resultados',async()=>{
  for(const response of [new Response(null,{status:204}),new Response('<html>erro</html>',{headers:{'Content-Type':'text/html'}}),json({items:[],total:'abc'}),json({items:[{doc_type:'_doc',document_type:'contrato'}],total:1})]) {
    const s=service([],{handler:()=>response});await assert.rejects(s.service.execute(query()),e=>e.status===502);
  }
});
test('HTTP-04: falha transitória respeita tentativa limitada',async()=>{
  const s=service([],{handler:(url,n)=>n===1?new Response(null,{status:503,headers:{'Retry-After':'0'}}):json({items:[],total:0})},{PNCP_MAX_RETRIES:1});
  const r=await s.service.execute(query());assert.equal(s.requests.length,2);assert.equal(r.upstream_requests,2);
});
test('HTTP-04: redirecionamento para outra origem rejeitado',async()=>{
  const s=service([],{handler:()=>new Response(null,{status:302,headers:{Location:'https://example.com/private'}})});await assert.rejects(s.service.execute(query()),e=>e.code==='UNSAFE_REDIRECT');assert.equal(s.requests.length,1);
});
test('UI-01/MEM-01: cancelamento impede chamadas futuras',async()=>{
  const s=service(Array.from({length:20},(_,i)=>document(i+1)),{}, {PNCP_REQUESTS_PER_SECOND:2});const controller=new AbortController();
  const promise=s.service.execute(query({mode:'refined'}),controller.signal);setTimeout(()=>controller.abort(new Error('cancelado')),30);await assert.rejects(promise,/cancelado/);assert.equal(s.requests.length,1);assert.equal(s.client.active,0);
});
test('HTTP-04: orçamento global interrompe espera',async()=>{
  const s=service([],{handler:async(url,n,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}))},{PNCP_OPERATION_TIMEOUT_SECONDS:0.1});await assert.rejects(s.service.execute(query()),e=>e.code==='OPERATION_TIMEOUT');
});
