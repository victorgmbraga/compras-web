import test from 'node:test';
import assert from 'node:assert/strict';
import { service, document, query, json } from './helpers.js';

test('PNCP-ONLY-01: cada página consulta somente a página solicitada e preserva a ordem da fonte',async()=>{
  const docs=Array.from({length:2500},(_,i)=>document(2500-i,{description:'Mesmo objeto'}));
  const s=service(docs);
  for(const page of [1,2,25]) {
    const before=s.requests.length,result=await s.service.execute(query({page,size:100,order:'data'}));
    assert.equal(s.requests.length-before,1);
    const upstream=s.requests.at(-1);assert.equal(upstream.searchParams.get('pagina'),String(page));
    assert.equal(upstream.searchParams.get('tam_pagina'),'100');assert.equal(upstream.searchParams.get('ordenacao'),'data');
    assert.equal(result.total,2500);assert.equal(result.data.length,100);
    assert.deepEqual(result.data.map(d=>d.id),docs.slice((page-1)*100,page*100).map(d=>d.id));
    assert.equal(result.collection_complete,false);
  }
  assert(!s.requests.some(u=>u.pathname.includes('/itens')));
});

test('PNCP-ONLY-02: texto, status e filtros são enviados à API sem uma segunda filtragem local',async()=>{
  const raw=document(1,{description:'Texto recebido da API, sem os termos da pesquisa'});
  const s=service([],{handler:u=>u.pathname.endsWith('/filters')?null:json({items:[raw],total:1})});
  const pncp_filters={ufs:['DF','GO'],situacoes:['1'],tipos_item:'S',situacoes_item:['1','2'],data_publicacao_inicio:'2026-09-01',data_publicacao_fim:'2026-09-30'};
  const result=await s.service.execute(query({q:'Microsoft OR Oracle',status:'recebendo_proposta',order:'relevancia',pncp_filters}));
  const params=s.requests.at(-1).searchParams;
  assert.equal(params.get('q'),'Microsoft OR Oracle');assert.equal(params.get('status'),'recebendo_proposta');
  assert.equal(params.get('ordenacao'),'relevancia');assert.equal(params.get('ufs'),'DF|GO');assert.equal(params.get('tipos_item'),'S');
  assert.equal(params.get('situacoes_item'),'1|2');assert.equal(params.get('situacoes'),'1');
  assert.equal(params.get('data_publicacao_inicio'),'2026-09-01');assert.equal(params.get('data_publicacao_fim'),'2026-09-30');
  assert.equal(result.data.length,1);assert.equal(result.data[0].objeto_compra,raw.description);
  assert.equal(s.requests.filter(u=>u.pathname.includes('/itens')).length,0);
});

test('PNCP-ONLY-03: antigos parâmetros de consulta local são rejeitados antes de chamar o PNCP',async()=>{
  const s=service([]);
  const legacy={mode:'refined',preset:'microsoft',filters:[],header_filters:[],filter_join:'or',deduplicate:'objeto_exato',sorters:[]};
  for(const [key,value]of Object.entries(legacy)) {
    for(const method of ['execute','export'])await assert.rejects(s.service[method](query({[key]:value})),e=>e.code==='UNKNOWN_FIELD' && e.details.field===key);
  }
  assert.equal(s.requests.length,0);
});
