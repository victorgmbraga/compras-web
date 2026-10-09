import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from '../src/schema.js';
import { validateQuery, compareDecimal } from '../src/validation.js';
import { readQueryUrl, writeQueryUrl } from '../src/browser/query-url.js';
import { demoFetch } from '../src/demo.js';
import { PncpClient } from '../src/pncp-core.js';
import { QueryService } from '../src/query-core.js';
import { config, document, service, query, csvBytes } from './helpers.js';

// Opções oferecidas por ResultPanel.setOrder no portal oficial do PNCP.
const expected={
  edital:['-data','data','relevancia','numero_controle_pncp','-valor_total_estimado'],
  ata:['-data','data','relevancia','valor','-valor'],
  contrato:['-data','data','relevancia','numero_contratacao','numero_controle_pncp','data_inicio_vigencia','valor_global'],
};
const catalog=schema(config()),base='https://example.test/contratos-web/';

test('ORDER-01: catálogo publica as opções oficiais por documento e seus rótulos',()=>{
  assert.deepEqual(catalog.orders_by_document,expected);assert.deepEqual(catalog.orders,expected.edital);
  for(const order of new Set(Object.values(expected).flat()))assert.equal(typeof catalog.order_labels[order],'string');
});

test('ORDER-02: critérios válidos preservam o código nativo em consultas e URLs',()=>{
  for(const [document_type,orders] of Object.entries(expected))for(const order of orders) {
    const input=validateQuery(query({document_type,order,q:order==='relevancia'?'software':''}),config());
    assert.equal(input.order,order);
    const href=writeQueryUrl(base,input,catalog);
    assert.equal(new URL(href).searchParams.get('ordenacao'),order);
    assert.deepEqual(readQueryUrl(href,catalog,10),input);
  }
  for(const document_type of Object.keys(expected))for(const q of ['', '   '])assert.throws(()=>validateQuery(query({document_type,order:'relevancia',q}),config()),error=>error.code==='INVALID_ORDER');
});

test('ORDER-03: ordenação incompatível é rejeitada antes da rede, inclusive no CSV e nos links',async()=>{
  const s=service([]),orders=new Set(Object.values(expected).flat());
  for(const [document_type,allowed] of Object.entries(expected))for(const order of orders) {
    if(allowed.includes(order))continue;
    for(const method of ['execute','export'])await assert.rejects(s.service[method](query({document_type,order})),error=>error.code==='INVALID_ORDER');
    assert.throws(()=>readQueryUrl(`${base}?tipos_documento=${document_type}&ordenacao=${order}`,catalog),error=>error.code==='INVALID_ORDER');
  }
  assert.equal(s.requests.length,0);
});

test('ORDER-04: novas ordenações chegam ao PNCP sem reordenar a página ou o CSV localmente',async()=>{
  for(const [document_type,orders] of Object.entries(expected))for(const order of orders.slice(3)) {
    const docs=[3,1,2].map(index=>document(index,{document_type,title:`Registro ${index}`})),s=service(docs);
    const result=await s.service.execute(query({document_type,order}));
    assert.deepEqual(result.data.map(row=>row.titulo),['Registro 3','Registro 1','Registro 2']);
    assert.equal(result.effective_filters.ordenacao,order);
    const exported=await s.service.export(query({document_type,order})),csv=csvBytes(exported).toString('utf8');
    assert(csv.indexOf('Registro 3')<csv.indexOf('Registro 1') && csv.indexOf('Registro 1')<csv.indexOf('Registro 2'));
    for(const request of s.requests){assert.equal(request.searchParams.get('tipos_documento'),document_type);assert.equal(request.searchParams.get('ordenacao'),order);}
  }
});

test('ORDER-05: demonstração ordena valores com precisão decimal e mantém ausências no fim',async()=>{
  const cfg=config({DEMO_MODE:true}),s=new QueryService(cfg,new PncpClient(cfg,{fetcher:demoFetch}));
  for(const [document_type,order,field,direction] of [
    ['edital','-valor_total_estimado','valor_total_estimado',-1],['ata','valor','valor_total_estimado',-1],
    ['ata','-valor','valor_total_estimado',1],['contrato','valor_global','valor_global',1],
  ]) {
    const response=await demoFetch(`https://pncp.gov.br/api/search/?tipos_documento=${document_type}&ordenacao=${order}&pagina=1&tam_pagina=100`),items=(await response.json()).items;
    let missing=false;
    for(const [index,row] of items.entries()) {
      if(row[field]==null){missing=true;continue;}
      assert.equal(missing,false);
      if(index>0)assert(compareDecimal(String(items[index-1][field]),String(row[field]))*direction<=0);
    }
    assert.equal((await s.execute(query({document_type,order,size:100}))).total,items.length);
  }
  const contracts=await s.execute(query({document_type:'contrato',order:'valor_global',size:100}));
  assert.equal(contracts.data.at(-2).valor_global,'9007199254740993.12345');assert.equal(contracts.data.at(-1).valor_global,null);
});
