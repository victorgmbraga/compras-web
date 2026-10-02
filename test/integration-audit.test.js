import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'lossless-json';
import { project, safeLink } from '../src/adapter.js';
import { applyRules, itemPresetState } from '../src/rules.js';
import { validateQuery } from '../src/validation.js';
import { config, document, query, service, json } from './helpers.js';
import http from 'node:http';
import {createApplication} from '../src/server.js';

test('AUDIT-01: anos de /filters usam ano, sem id, e preservam o valor de busca', async () => {
  const s=service([], {handler:u=>u.pathname.endsWith('/filters')?json({filters:{anos:[{ano:'2026',total:100},{ano:2025,total:20}],ufs:[{id:'DF',total:10}]}}):null});
  const domains=await s.service.domains('edital',null);
  assert.deepEqual(domains.filters.anos,[{id:'2026',label:'2026'},{id:'2025',label:'2025'}]);
  assert.deepEqual(domains.filters.ufs,[{id:'DF',label:'DF'}]);
});

test('AUDIT-02: caminho da busca /compras abre /app/editais e mantém validação de origem', () => {
  const path='/compras/76208867000107/2026/534';
  for(const input of [path,'/app'+path,'https://pncp.gov.br'+path,'https://pncp.gov.br/app'+path])assert.equal(safeLink(input,true),'https://pncp.gov.br/app/editais/76208867000107/2026/534');
  assert.equal(project(document(1,{item_url:path})).url_pncp,'https://pncp.gov.br/app/editais/76208867000107/2026/534');
  assert.equal(safeLink('/app/editais/76208867000107/2026/534',true),'https://pncp.gov.br/app/editais/76208867000107/2026/534');
  for(const value of ['//evil.example/compras/1','/compras/../../../../evil','javascript:alert(1)','https://evil.example/compras/1']) {
    assert.equal(safeLink(value,true),'https://pncp.gov.br/app');
  }
});

test('AUDIT-03: situação real situacaoCompraItem confirma serviço no mesmo item', async () => {
  const items=parse('[{"numeroItem":1,"materialOuServico":"S","situacaoCompraItem":2,"situacaoCompraItemNome":"Homologado"}]');
  assert.equal(itemPresetState(items,'oracle','').state,'match');
  const real=service([document(1,{description:'Oracle'})],{items:(_,page)=>page===1?[{numeroItem:1,materialOuServico:'S',situacaoCompraItem:2}]:[]});
  const result=await real.service.execute(query({mode:'refined',preset:'oracle'}));
  assert.equal(result.total,1);assert.equal(result.unverifiable_documents,0);
  assert.deepEqual(result.data[0].matching_item_numbers,['1']);
});

test('AUDIT-04: alias documentado permanece aceito; conflitos e tipos inválidos são erros', () => {
  const base={numeroItem:1,materialOuServico:'S'};
  assert.equal(itemPresetState([{...base,situacaoCompraItemId:1}],'oracle','').state,'match');
  assert.equal(itemPresetState([{...base,situacaoCompraItem:1,situacaoCompraItemId:'1'}],'oracle','').state,'match');
  assert.throws(()=>itemPresetState([{...base,situacaoCompraItem:1,situacaoCompraItemId:2}],'oracle',''),e=>e.code==='INVALID_UPSTREAM');
  assert.throws(()=>itemPresetState([{...base,situacaoCompraItem:{id:1},situacaoCompraItemId:1}],'oracle',''),e=>e.code==='INVALID_UPSTREAM');
});

test('AUDIT-05: identidade de itens ausente conta como não verificável, sem chamada inventada', async () => {
  const s=service([document(1,{description:'Oracle',orgao_cnpj:null})]);
  const q=query({mode:'refined',preset:'oracle'});
  const result=await s.service.execute(q);
  assert.equal(result.total,0);assert.equal(result.unverifiable_documents,1);assert.equal(result.complete_for_rule,false);
  assert.equal(s.requests.filter(u=>u.pathname.endsWith('/itens')).length,0);
  await assert.rejects(s.service.export(q,'all'),e=>e.code==='INCOMPLETE_RULE_COVERAGE');
  const exported=await s.service.export(q,'confirmed_only');
  assert.equal(exported.metadata.unverifiable_documents,1);assert.equal(exported.metadata.data.length,0);
});

test('AUDIT-06: ordenação de datas conserva nanossegundos e equivalência de formatos', () => {
  const sort=values=>applyRules(values.map((date,i)=>project(document(i+1,{data_publicacao_pncp:date}))),validateQuery(query({mode:'refined',sorters:[{field:'data_publicacao_pncp',dir:'asc'}]}),config())).documents.map(d=>d.id);
  assert.deepEqual(sort(['2026-10-02T09:08:26.123000002Z','2026-10-02T06:08:26.123000001-03:00']),['2','1']);
  assert.deepEqual(sort(['2026-10-02T09:08:26.10','2026-10-02T09:08:26.1']),['1','2']);
  assert.deepEqual(sort(['2026-10-02T00:00:00','2026-10-02']),['1','2']);
});

test('AUDIT-07: detalhes rejeitam situações conflitantes, catálogo ou descrição incompatível', async () => {
  for(const extra of [{situacaoCompraItem:1,situacaoCompraItemId:2},{catalogo:[]},{descricao:false}]) {
    const s=service([],{items:()=>[{numeroItem:1,materialOuServico:'S',...extra}]});
    await assert.rejects(s.service.details({cnpj:'00000000000000',ano:'2026',sequencial:'1'},1,100),e=>e.code==='INVALID_UPSTREAM');
  }
});

test('AUDIT-08: URL HTTP malformada devolve erro e o servidor continua disponível', async t => {
  const app=createApplication(config({DEMO_MODE:true}));
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const port=app.server.address().port;
  const result=await new Promise((resolve,reject)=>{
    const request=http.get({hostname:'127.0.0.1',port,path:'http://['},response=>{
      let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(body)}));
    });request.on('error',reject);
  });
  assert.equal(result.status,400);assert.equal(result.body.error.code,'INVALID_URL');
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status,200);
});

test('AUDIT-09: resposta, header HTTP e logs da chamada PNCP usam o mesmo request_id', async t => {
  const entries=[],fake=service([document(1)]);
  const app=createApplication(config(),{fetcher:fake.fetcher,logger:entry=>entries.push(entry)});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const response=await fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query())});
  const body=await response.json(),id=response.headers.get('x-request-id');
  assert.equal(body.request_id,id);assert.equal(entries.length,2);assert(entries.every(entry=>entry.request_id===id));
  const invalid=await fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"size":30}'});
  assert.equal((await invalid.json()).error.request_id,invalid.headers.get('x-request-id'));
});

test('AUDIT-10: anos inválidos da fonte não viram opções que o próprio backend rejeita', async () => {
  const s=service([],{handler:u=>u.pathname.endsWith('/filters')?json({filters:{anos:[{ano:'2026'},{ano:'20'},{ano:'20260'},{ano:null}]}}):null});
  const result=await s.service.domains('edital',null);
  assert.deepEqual(result.filters.anos,[{id:'2026',label:'2026'}]);
  assert.equal(result.warnings[0].omitted_options,3);assert.equal(result.warnings[0].domain,'anos');
  assert.equal(result.raw.anos.length,4);
  assert.doesNotThrow(()=>validateQuery(query({pncp_filters:{anos:result.filters.anos.map(o=>o.id)}}),config()));
});
