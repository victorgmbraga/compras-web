import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from '../src/schema.js';
import { validateQuery } from '../src/validation.js';
import { config, document, json, query, service } from './helpers.js';

const common={situacoes:['1'],tipos_item:'S',situacoes_item:['1','2']};

test('PRESET-OPT-01: as nove consultas especializadas enviam os filtros candidatos ao PNCP',async()=>{
  const cfg=config({PNCP_PRESET_CATALOG_ID:'1'});
  const special=schema(cfg).presets.filter(p=>p.mode==='refined');assert.equal(special.length,9);
  for(const preset of special) {
    const s=service([],{}, {PNCP_PRESET_CATALOG_ID:'1'});
    const result=await s.service.execute(query({mode:'refined',preset:preset.id}));
    const search=s.requests.find(u=>u.searchParams.has('tam_pagina'));assert(search,preset.id);
    const expected={...common,...(['desenvolvimento','infraestrutura'].includes(preset.id)?{esferas:['F'],modalidades:['6']}:{})};
    for(const [key,value]of Object.entries(expected)) {
      assert.equal(search.searchParams.get(key),Array.isArray(value)?value.join('|'):value,preset.id);
      assert.deepEqual(result.effective_filters[key],value,preset.id);
    }
    assert(!search.searchParams.has('q'),preset.id);
    assert.equal(search.searchParams.has('esferas'),preset.id==='desenvolvimento' || preset.id==='infraestrutura');
    assert.equal(result.total,0);
  }
});

test('PRESET-OPT-02: filtros nativos reduzem candidatos antes do limite e a confirmação do mesmo item permanece',async()=>{
  const docs=Array.from({length:12},(_,i)=>document(i+1,{description:i===11?'Objeto irrelevante':'Microsoft Windows',situacao_id:i<9?'2':'1'}));
  const items=sequence=>sequence==='11'
    ?[{numeroItem:1,materialOuServico:'M',situacaoCompraItem:2},{numeroItem:2,materialOuServico:'S',situacaoCompraItem:3}]
    :[{numeroItem:1,materialOuServico:'S',situacaoCompraItem:2}];
  const s=service(docs,{
    items:(sequence,page)=>page===1?items(sequence):[],
    handler:u=>{
      if(!u.searchParams.has('tam_pagina'))return;
      const p=u.searchParams;
      const filtered=docs.filter(d=>(!p.has('situacoes') || p.get('situacoes').split('|').includes(d.situacao_id))
        && (!p.has('tipos_item') || items(d.numero_sequencial).some(i=>i.materialOuServico===p.get('tipos_item')))
        && (!p.has('situacoes_item') || items(d.numero_sequencial).some(i=>p.get('situacoes_item').split('|').includes(String(i.situacaoCompraItem)))));
      const page=Number(p.get('pagina')),size=Number(p.get('tam_pagina'));
      return json({items:filtered.slice((page-1)*size,page*size),total:filtered.length});
    },
  },{PNCP_MAX_REFINEMENT_CANDIDATES:4});
  const input=query({mode:'refined',preset:'microsoft'}),result=await s.service.execute(input);
  assert.equal(result.source_total,3);assert.equal(result.total,1);assert.equal(result.data[0].id,'10');
  assert.deepEqual(result.data[0].matching_item_numbers,['1']);
  assert.equal(s.requests.filter(u=>u.pathname.endsWith('/itens')).length,4);
  const exported=await s.service.export(input,'all');assert.equal(exported.metadata.data.length,1);
  assert.deepEqual(exported.metadata.effective_filters.situacoes_item,['1','2']);
  const disabled=service(docs,{}, {PNCP_MAX_REFINEMENT_CANDIDATES:4,PNCP_VALIDATED_PRESET_OPTIMIZATIONS:''});
  await assert.rejects(disabled.service.execute(input),error=>error.code==='QUERY_TOO_BROAD' && error.details.source_total===12);
});

test('PRESET-OPT-03: texto e critérios do usuário são preservados; restrições incompatíveis são rejeitadas',async()=>{
  const pncp_filters={ufs:['DF'],data_publicacao_inicio:'2026-09-01',situacoes:['1','2'],situacoes_item:['2','3']};
  const s=service([]);
  const result=await s.service.execute(query({mode:'refined',preset:'microsoft',q:'Microsoft OR Azure',pncp_filters}));
  const search=s.requests.find(u=>u.searchParams.has('tam_pagina'));
  assert.equal(search.searchParams.get('q'),'Microsoft OR Azure');assert.equal(search.searchParams.get('ufs'),'DF');
  assert.equal(search.searchParams.get('data_publicacao_inicio'),'2026-09-01');
  assert.equal(search.searchParams.get('situacoes'),'1');assert.equal(search.searchParams.get('situacoes_item'),'2');
  assert.deepEqual(result.effective_filters.situacoes_item,['2']);
  assert.deepEqual(pncp_filters.situacoes,['1','2']);assert.deepEqual(pncp_filters.situacoes_item,['2','3']);
  for(const filter of [{situacoes:['2']},{tipos_item:'M'},{situacoes_item:['3']}]) {
    const source=service([]);
    await assert.rejects(source.service.execute(query({mode:'refined',preset:'microsoft',pncp_filters:filter})),error=>error.code==='PRESET_FILTER_CONFLICT');
    assert.equal(source.requests.length,0);
  }
});

test('PRESET-OPT-04: consultas gerais e refinamento personalizado não recebem restrições automáticas',()=>{
  for(const preset of ['all','personalizado'])for(const mode of ['native','refined']) {
    assert.deepEqual(validateQuery(query({preset,mode}),config()).pncp_filters,{});
  }
  const disabled=validateQuery(query({mode:'refined',preset:'oracle'}),config({PNCP_VALIDATED_PRESET_OPTIMIZATIONS:''}));
  assert.deepEqual(disabled.pncp_filters,{});
  const capabilities=schema(config()).capabilities;
  for(const name of ['tipos_item','situacoes_item'])assert.equal(capabilities.find(c=>c.name===name).state,'enabled');
});
