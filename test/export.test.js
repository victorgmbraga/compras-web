import test from 'node:test';
import assert from 'node:assert/strict';
import { service,document,query,csvBytes } from './helpers.js';

test('EXP-01: nova coleta completa sem recorte da página visível',async()=>{
  const s=service(Array.from({length:12},(_,i)=>document(i+1)));await s.service.execute(query({page:2}));const previous=s.requests.length;const r=await s.service.export(query({page:2}));assert.equal(r.metadata.exported_rows,12);assert.equal(s.requests.length-previous,2);assert.equal(csvBytes(r).subarray(0,3).toString('hex'),'efbbbf');assert.equal(csvBytes(r).toString().split('\r\n').length,14);assert(!csvBytes(r).toString().includes('"categorizacao"'));
});
test('EXP-02: última página falha ou buffer excede não devolve CSV parcial',async()=>{
  const docs=Array.from({length:12},(_,i)=>document(i+1));
  const s=service(docs,{handler:u=>u.searchParams.get('pagina')==='2'?new Response('<html>erro</html>',{headers:{'Content-Type':'text/html'}}):null});await assert.rejects(s.service.export(query()),e=>e.code==='INVALID_UPSTREAM');
  const small=service(docs,{}, {PNCP_MAX_EXPORT_BYTES:10});await assert.rejects(small.service.export(query()),e=>e.code==='EXPORT_BYTES_LIMIT');
  const empty=service([],{}, {PNCP_MAX_EXPORT_BYTES:10});await assert.rejects(empty.service.export(query()),e=>e.code==='EXPORT_BYTES_LIMIT');
});
test('EXP-03: mudanças, duplicatas e páginas incompletas abortam a exportação',async()=>{
  const docs=Array.from({length:12},(_,i)=>document(i+1));
  for(const second of [{items:docs.slice(10),total:13},{items:docs.slice(0,2),total:12},{items:[],total:12}]) {
    const s=service(docs,{handler:u=>u.searchParams.get('pagina')==='2'?Response.json(second):null});
    await assert.rejects(s.service.export(query()),e=>e.code==='SOURCE_CHANGED');
  }
});
test('EXP-04: aspas e quebras escapadas; decimal sem moeda',async()=>{
  const s=service([document(1,{description:'Texto "com aspas"\nLinha 2',valor_total_estimado:'2.25'})]);const r=await s.service.export(query());const csv=csvBytes(r).toString();assert(csv.includes('"Texto ""com aspas""\nLinha 2"'));assert(csv.includes('"2.25"'));assert(!csv.includes('R$'));
});
