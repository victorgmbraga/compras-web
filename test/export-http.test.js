import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/server.js';
import { service,document,query,fixture,config } from './helpers.js';

test('EXP-01: nova coleta completa sem recorte da página visível',async()=>{
  const s=service(Array.from({length:12},(_,i)=>document(i+1)));await s.service.execute(query({page:2}));const previous=s.requests.length;const r=await s.service.export(query({page:2}),'all');assert.equal(r.metadata.data.length,12);assert.equal(s.requests.length-previous,2);assert.equal(r.csv.subarray(0,3).toString('hex'),'efbbbf');assert.equal(r.csv.toString().split('\r\n').length,14);assert(r.csv.toString().includes('"categorizacao"'));
});
test('EXP-02: última página falha ou buffer excede não devolve CSV parcial',async()=>{
  const docs=Array.from({length:12},(_,i)=>document(i+1));
  const s=service(docs,{handler:u=>u.searchParams.get('pagina')==='2'?new Response('<html>erro</html>',{headers:{'Content-Type':'text/html'}}):null});await assert.rejects(s.service.export(query(),'all'),e=>e.code==='INVALID_UPSTREAM');
  const small=service(docs,{}, {PNCP_MAX_EXPORT_BYTES:10});await assert.rejects(small.service.export(query(),'all'),e=>e.code==='EXPORT_BYTES_LIMIT');
  const empty=service([],{}, {PNCP_MAX_EXPORT_BYTES:10});await assert.rejects(empty.service.export(query(),'all'),e=>e.code==='EXPORT_BYTES_LIMIT');
});
test('EXP-03: unknown exige confirmed_only explícito',async()=>{
  const s=service([document(1,{description:'Oracle'}),document(2,{description:'Oracle'})],{items:(seq,page)=>page===1?[{numeroItem:1,materialOuServico:'S',...(seq==='1'?{situacaoCompraItemId:2}:{})}]:[]});
  await assert.rejects(s.service.export(query({mode:'refined',preset:'oracle'}),'all'),e=>e.code==='INCOMPLETE_RULE_COVERAGE');const r=await s.service.export(query({mode:'refined',preset:'oracle'}),'confirmed_only');assert.equal(r.metadata.data.length,1);assert.equal(r.metadata.unverifiable_documents,1);
});
test('EXP-04: aspas e quebras escapadas; decimal sem moeda',async()=>{
  const s=service([document(1,{description:'Texto "com aspas"\nLinha 2',valor_total_estimado:'2.25'})]);const r=await s.service.export(query(),'all');const csv=r.csv.toString();assert(csv.includes('"Texto ""com aspas""\nLinha 2"'));assert(csv.includes('"2.25"'));assert(!csv.includes('R$'));
});
test('LIVE-01/HTTP/UI: interface, esquema, rotas, limites e headers',async t=>{
  const fake=fixture([document(1)]),app=createApplication(config(),{fetcher:fake.fetcher});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}`;
  for(const route of ['/','/app.js','/styles.css','/vendor/tabulator.min.js','/api/schema','/api/health']){const response=await fetch(base+route);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');await response.arrayBuffer();}
  assert.equal(fake.requests.length,0);
  const old=await fetch(base+'/api/imports/start',{method:'POST'});assert.equal(old.status,410);await old.arrayBuffer();
  const body=await fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:'x'.repeat(270000)})});assert.equal(body.status,413);await body.arrayBuffer();
  const exported=await fetch(base+'/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query()})});assert.equal(exported.status,200);assert.equal(exported.headers.get('x-exported-rows'),'1');assert.equal(exported.headers.get('x-snapshot-guaranteed'),'false');assert(exported.headers.get('content-disposition').includes('compras-pncp-'));await exported.arrayBuffer();
});
test('DEMO-01: demonstração explicitamente marcada e health não alega chamada real',async t=>{
  const app=createApplication(config({DEMO_MODE:true}));await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}`;
  const response=await fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query({q:'firewall'}))});assert.equal(response.status,200);const data=await response.json();assert.equal(data.source,'demo');assert.equal(data.demo,true);
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.live,false);assert.equal(health.last_pncp_call,null);
});
