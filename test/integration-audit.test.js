import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'lossless-json';
import { project, safeLink, itemSituation } from '../src/adapter.js';
import { validateQuery } from '../src/validation.js';
import { config, document, query, service, json } from './helpers.js';

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

test('AUDIT-03: situação real situacaoCompraItem é preservada nos detalhes', async () => {
  const items=parse('[{"numeroItem":1,"materialOuServico":"S","situacaoCompraItem":2,"situacaoCompraItemNome":"Homologado"}]');
  assert.equal(itemSituation(items[0]),'2');
  const real=service([],{items:()=>[{numeroItem:1,materialOuServico:'S',situacaoCompraItem:2}]});
  const result=await real.service.details({cnpj:'00000000000000',ano:'2026',sequencial:'1'},1,100);
  assert.equal(result.total_items,1);assert.equal(String(result.data[0].situacaoCompraItem),'2');
});

test('AUDIT-04: alias de situação permanece aceito; conflitos e tipos inválidos são erros', () => {
  assert.equal(itemSituation({situacaoCompraItemId:1}),'1');
  assert.equal(itemSituation({situacaoCompraItem:1,situacaoCompraItemId:'1'}),'1');
  assert.throws(()=>itemSituation({situacaoCompraItem:1,situacaoCompraItemId:2}),e=>e.code==='INVALID_UPSTREAM');
  assert.throws(()=>itemSituation({situacaoCompraItem:{id:1},situacaoCompraItemId:1}),e=>e.code==='INVALID_UPSTREAM');
});

test('AUDIT-05: ausência de identificação para itens não exclui a contratação da pesquisa ou CSV', async () => {
  const s=service([document(1,{orgao_cnpj:null})]);
  const result=await s.service.execute(query());
  assert.equal(result.total,1);assert.equal(result.data.length,1);assert.equal(result.data[0]._purchase,null);
  assert(!s.requests.some(u=>u.pathname.includes('/itens')));
  const exported=await s.service.export(query());assert.equal(exported.metadata.exported_rows,1);
});

test('AUDIT-07: detalhes rejeitam situações conflitantes, catálogo ou descrição incompatível', async () => {
  for(const extra of [{situacaoCompraItem:1,situacaoCompraItemId:2},{catalogo:[]},{descricao:false}]) {
    const s=service([],{items:()=>[{numeroItem:1,materialOuServico:'S',...extra}]});
    await assert.rejects(s.service.details({cnpj:'00000000000000',ano:'2026',sequencial:'1'},1,100),e=>e.code==='INVALID_UPSTREAM');
  }
});



test('AUDIT-10: anos inválidos da fonte não viram opções que o próprio serviço rejeita', async () => {
  const s=service([],{handler:u=>u.pathname.endsWith('/filters')?json({filters:{anos:[{ano:'2026'},{ano:'20'},{ano:'20260'},{ano:null}]}}):null});
  const result=await s.service.domains('edital',null);
  assert.deepEqual(result.filters.anos,[{id:'2026',label:'2026'}]);
  assert.equal(result.warnings[0].omitted_options,3);assert.equal(result.warnings[0].domain,'anos');
  assert.equal(result.raw.anos.length,4);
  assert.doesNotThrow(()=>validateQuery(query({pncp_filters:{anos:result.filters.anos.map(o=>o.id)}}),config()));
});
