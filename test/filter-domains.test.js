import test from 'node:test';
import assert from 'node:assert/strict';
import { schema } from '../src/schema.js';
import { validateQuery } from '../src/validation.js';
import { PncpClient, operation, normalizeCatalog } from '../src/pncp.js';
import { QueryService } from '../src/query.js';
import { createApplication } from '../src/server.js';
import { demoFetch } from '../src/demo.js';
import { config, query, service, document, json } from './helpers.js';

const demo=()=>{const cfg=config({DEMO_MODE:true});return new QueryService(cfg,new PncpClient(cfg,{fetcher:demoFetch}));};

test('FILTER-01: novos documentais habilitados; contratos e pendências têm estados próprios',()=>{
  const s=schema(config()),caps=s.capabilities;
  assert.equal(caps.filter(c=>!c.reserved&&c.state==='enabled').length,30);
  assert.equal(caps.filter(c=>c.state==='unsupported_document').length,9);
  assert.equal(caps.filter(c=>c.state==='pending_validation').length,41);
  for(const name of ['srp','codigo_ibge','tipos','normativos_base','amparos_legais','fontes_orcamentarias','fontes','modos_disputa','indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional'])assert.equal(caps.find(c=>c.name===name).state,'enabled');
  assert.equal(caps.find(c=>c.name==='paises_fornecedor').state,'pending_validation');
  for(const name of ['tipos_item','tipos_margens_preferencia']){const c=caps.find(c=>c.name===name);assert.equal(c.type,'enum');assert.equal(c.cardinality,'single');assert.equal(c.domain_kind,'closed');}
  assert.equal(caps.find(c=>c.name==='municipios_fornecedor').domain_kind,'suggest');
  assert.equal(caps.find(c=>c.name==='naturezas_juridicas').domain_source,'catalog');
  assert.equal(schema(config({PNCP_VALIDATED_FILTERS:'tipos_contrato'})).capabilities.find(c=>c.name==='tipos_contrato').state,'unsupported_document');
});

test('FILTER-02: SRP booleano, IBGE textual e enumeração singular são validados antes da rede',()=>{
  assert.equal(validateQuery(query({pncp_filters:{srp:false,codigo_ibge:'0300108'}}),config()).pncp_filters.srp,false);
  for(const pncp_filters of [{srp:'false'},{codigo_ibge:5300108},{codigo_ibge:'530010'},{tipos_item:['S']},{tipos:['Edital']}])assert.throws(()=>validateQuery(query({pncp_filters}),config()));
  const cfg=config({PNCP_VALIDATED_FILTERS:'tipos_margens_preferencia'});
  for(const value of [['1'],'1|2','livre',2])assert.throws(()=>validateQuery(query({pncp_filters:{tipos_margens_preferencia:value}}),cfg));
  assert.throws(()=>validateQuery(query({pncp_filters:{tipos_contrato:['1']}}),config()),e=>e.code==='DOCUMENT_FILTER_UNAVAILABLE');
});

test('FILTER-03: consulta, CSV e demonstração exercitam os seis filtros documentais',async()=>{
  const s=demo();
  assert.equal((await s.execute(query())).total,64);
  for(const srp of [true,false]){const r=await s.execute(query({pncp_filters:{srp}}));assert.equal(r.total,32);assert(r.data.every(d=>d._raw.srp===srp));}
  const ibge=await s.execute(query({pncp_filters:{codigo_ibge:'5300108'}}));assert.equal(ibge.total,32);assert(ibge.data.every(d=>d._raw.codigo_ibge==='5300108'));
  for(const [name,raw]of [['tipos','tipo_id'],['normativos_base','normativo_base_id'],['amparos_legais','amparo_legal_id'],['fontes_orcamentarias','fonte_orcamentaria_id']]){
    const values={tipos:['1','3'],normativos_base:['1','5'],amparos_legais:['1','19','98'],fontes_orcamentarias:['2','4']}[name];
    const r=await s.execute(query({pncp_filters:{[name]:values}}));assert.equal(r.total,64);assert(r.data.every(d=>[d._raw[raw]].flat().some(v=>values.includes(v))));
  }
  const pncp_filters={srp:true,codigo_ibge:'5300108',tipos:['1'],normativos_base:['1'],amparos_legais:['1','19'],fontes_orcamentarias:['4']};
  const csv=await s.export(query({pncp_filters}));assert.equal(csv.metadata.data.length,32);assert.equal(csv.csv.toString('utf8').split('\r\n').length,34);assert(csv.metadata.data.every(d=>d._raw.srp===true));
});

test('FILTER-04: IDs fechados e amparo incompatível são recusados antes da busca',async()=>{
  const s=demo();
  for(const pncp_filters of [{tipos:['999']},{fontes_orcamentarias:['999']},{normativos_base:['1'],amparos_legais:['98']}])await assert.rejects(s.execute(query({pncp_filters})),e=>e.code==='INVALID_DOMAIN');
  const valid=await s.execute(query({pncp_filters:{normativos_base:['5'],amparos_legais:['98']}}));assert.equal(valid.total,32);
  const fake=service([document(1)],{handler:u=>u.pathname.endsWith('/filters')?json({filters:{fontes_orcamentarias:[{id:'4',nome:'Fonte'}]}}):null});
  await assert.rejects(fake.service.execute(query({pncp_filters:{fontes_orcamentarias:['999']}})),e=>e.code==='INVALID_DOMAIN');
  assert.equal(fake.requests.length,1);assert(fake.requests[0].pathname.endsWith('/filters'));
});

test('FILTER-05: catálogo preserva IDs alfabéticos, zeros e estado inativo',()=>{
  assert.deepEqual(normalizeCatalog([{id:'0000',nome:'Não informada',statusAtivo:false},{id:'BRA',nome:'Brasil',codigoPaisBcb:1058,statusAtivo:true}]),[{id:'0000',label:'Não informada',active:false},{id:'BRA',label:'Brasil',active:true}]);
  for(const invalid of [{items:[]},[null],[{id:null,nome:'A'}],[{id:'1',nome:'A',statusAtivo:'false'}]])assert.throws(()=>normalizeCatalog(invalid),e=>e.code==='INVALID_UPSTREAM');
});

test('FILTER-06: catálogos usam endpoints específicos e conferem pertencimento',async()=>{
  const extra={PNCP_VALIDATED_FILTERS:'portes_fornecedor,naturezas_juridicas'};
  const s=service([document(1)],{handler:u=>u.pathname.endsWith('/portes-empresa')?json([{id:1,nome:'ME',statusAtivo:true}]):u.pathname.endsWith('/naturezas-juridicas')?json([{id:'0000',nome:'Não informada',statusAtivo:false}]):null},extra);
  const r=await s.service.execute(query({pncp_filters:{portes_fornecedor:['1'],naturezas_juridicas:['0000']}}));assert.equal(r.data.length,1);
  assert(s.requests.some(u=>u.pathname.endsWith('/portes-empresa')));assert(s.requests.some(u=>u.pathname.endsWith('/naturezas-juridicas')));assert(!s.requests.some(u=>u.pathname.endsWith('/filters')));
  assert.equal(s.requests.at(-1).searchParams.get('naturezas_juridicas'),'0000');
  await assert.rejects(s.service.execute(query({pncp_filters:{portes_fornecedor:['999']}})),e=>e.code==='INVALID_DOMAIN');
});

test('FILTER-07: margem de preferência confere a opção única no domínio remoto',async()=>{
  const s=service([document(1)],{handler:u=>u.pathname.endsWith('/filters')?json({filters:{tipos_margens_preferencia:[{id:1,nome:'Resolução'}]}}):null},{PNCP_VALIDATED_FILTERS:'tipos_margens_preferencia'});
  await assert.rejects(s.service.execute(query({pncp_filters:{tipos_margens_preferencia:'2'}})),e=>e.code==='INVALID_DOMAIN');
  await s.service.execute(query({pncp_filters:{tipos_margens_preferencia:'1'}}));assert.equal(s.requests.at(-1).searchParams.get('tipos_margens_preferencia'),'1');
});

test('FILTER-08: API conecta catálogos, distingue sugestões e bloqueia campos arbitrários',async t=>{
  const app=createApplication(config({DEMO_MODE:true,PNCP_VALIDATED_FILTERS:'municipios_fornecedor'}));
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  for(const [field,id]of [['paises_fornecedor','BRA'],['portes_fornecedor','1'],['naturezas_juridicas','0000']]){
    const response=await fetch(`${base}/api/pncp/filters?campo=${field}`);assert.equal(response.status,200);const body=await response.json();assert.equal(body.filters[field][0].id,id);assert.deepEqual(body.partial_domains,[]);
  }
  assert.equal((await fetch(base+'/api/pncp/filters?campo=../../private')).status,400);
  assert.equal((await fetch(base+'/api/pncp/filters?campo=tipos_contrato')).status,400);
  const filters=await (await fetch(base+'/api/pncp/filters')).json();assert(filters.partial_domains.includes('municipios_fornecedor'));
  const enumSuggest=await fetch(base+'/api/pncp/suggest?campo=tipos_item&q=servico');assert.equal(enumSuggest.status,400);
});

test('FILTER-09: falha de proxy com código numérico mantém erro de transporte',async()=>{
  const cfg=config(),client=new PncpClient(cfg,{fetcher:async()=>{throw new TypeError('fetch failed',{cause:{code:403}});}}),op=operation(cfg);
  try{await assert.rejects(client.get('https://pncp.gov.br/api/search/',op),e=>e.code==='PNCP_TRANSPORT_ERROR' && e.status===503);}finally{op.finish();}
});

test('FILTER-10: sugestões parciais encaminham município do fornecedor e preservam unidade textual',async t=>{
  const seen=[];
  const app=createApplication(config({PNCP_VALIDATED_FILTERS:'municipios_fornecedor,unidades_medida'}),{fetcher:async url=>{
    const u=new URL(url);seen.push(u);
    if(u.pathname.endsWith('/suggest'))return json({items:u.searchParams.get('campo')==='unidades_medida'?[{id:'Unidade ',nome:'Unidade '},{id:'UNIDADE',nome:'UNIDADE'}]:[{id:'999999',nome:'São Paulo'}]});
    if(u.pathname.endsWith('/filters'))return json({filters:{item_unidades_medida:[{id:'UNIDADE'}]}});
    return json({items:[document(1)],total:1});
  }});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  for(const campo of ['municipios_fornecedor','unidades_medida']){
    const r=await fetch(base+`/api/pncp/suggest?campo=${campo}&q=Unidade&tam_pagina=20`);assert.equal(r.status,200);const body=await r.json();
    if(campo==='unidades_medida')assert.deepEqual(body.items.map(o=>o.id),['Unidade ','UNIDADE']);else assert.equal(body.items[0].id,'999999');
    assert.equal(seen.at(-1).searchParams.get('campo'),campo);
  }
  const r=await fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query({pncp_filters:{municipios_fornecedor:['999999'],unidades_medida:['Unidade ']}}))});
  assert.equal(r.status,200);assert.equal(seen.at(-1).searchParams.get('unidades_medida'),'Unidade ');assert(!seen.some(u=>u.pathname.endsWith('/filters')));
});
