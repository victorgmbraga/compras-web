import { csvBytes } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'lossless-json';
import {schema,capabilities,columnsFor} from '../src/schema.js';
import {validateQuery} from '../src/validation.js';
import {PncpClient} from '../src/pncp-core.js';
import {QueryService} from '../src/query-core.js';
import {project} from '../src/adapter.js';
import {demoFetch} from '../src/demo.js';
import {config,document,service,query,json} from './helpers.js';

const demo=()=>{const cfg=config({DEMO_MODE:true});return new QueryService(cfg,new PncpClient(cfg,{fetcher:demoFetch}));};
const sample=c=>c.type==='boolean'?false:c.type==='date'?'2026-09-01':c.type==='integer'?0:c.type==='decimal'?'0.00':c.type==='enum'?c.name==='tipos_item'?'S':'1':c.name==='codigo_ibge'?'5300108':c.name==='ufs'?['DF']:c.name==='esferas'?['F']:c.name==='poderes'?['E']:c.name==='anos'?['2026']:c.name==='unidades_medida'?['Unidade ']:c.name==='paises_fornecedor'?['BRA']:['1'];

test('COMPLETE-01: todos os 80 filtros chegam à pesquisa e ao CSV com seu nome e valor nativos',async()=>{
  const caps=capabilities(config()).filter(c=>!c.reserved),domains=Object.fromEntries(caps.filter(c=>c.domain_source==='search').map(c=>[c.domain,[{id:c.name==='tipos_item'?'S':'1'}]]));
  for(const cap of caps){
    const type=cap.documents.includes('edital')?'edital':'contrato',value=sample(cap),raw=document(1,{document_type:type,valor_global:'0.00'});
    const s=service([raw],{handler:u=>u.pathname.endsWith('/filters')?json({filters:domains}):u.pathname.endsWith('/paises')?json([{id:'BRA',nome:'Brasil'}]):u.pathname.endsWith('/portes-empresa') || u.pathname.endsWith('/naturezas-juridicas') || u.pathname.endsWith('/situacoes-compra-item-resultado')?json([{id:'1',nome:'Opção'}]):null});
    const input=query({document_type:type,pncp_filters:{[cap.name]:value}});
    for(const run of [x=>s.service.execute(x),x=>s.service.export(x)]){
      const result=await run(input),meta=result.metadata || result;assert.equal(meta.exported_rows ?? meta.data.length,1,cap.name);
      assert.deepEqual(meta.effective_filters[cap.name],value,cap.name);
      const params=s.requests.at(-1).searchParams;assert.equal(params.get('tipos_documento'),type);
      assert.equal(params.get(cap.name),Array.isArray(value)?value.join('|'):String(value),cap.name);
    }
    assert(!s.requests.some(u=>u.pathname.includes('/itens')),cap.name);
  }
  assert.equal(caps.length,80);
});

test('COMPLETE-02: formatos, percentuais e todos os intervalos são verificados antes de acessar a fonte',async()=>{
  const s=service([]),caps=capabilities(config()).filter(c=>!c.reserved);
  for(const cap of caps){
    const type=cap.documents.includes('edital')?'edital':'contrato';
    await assert.rejects(s.service.execute(query({document_type:type,pncp_filters:{[cap.name]:null}})),e=>e.status===400,cap.name);
    if(cap.name.endsWith('_min') || cap.name.endsWith('_inicio')){
      const end=cap.name.endsWith('_min')?cap.name.slice(0,-4)+'_max':cap.name.slice(0,-7)+'_fim';
      const values=cap.type==='date'?['2026-10-01','2026-09-01']:cap.type==='integer'?[2,1]:['2.000000000000000001','2.000000000000000000'];
      await assert.rejects(s.service.execute(query({document_type:type,pncp_filters:{[cap.name]:values[0],[end]:values[1]}})),e=>e.code==='INVERTED_RANGE',cap.name);
    }
  }
  for(const value of ['100.000000000000000001','1e2','-1','5%'])await assert.rejects(s.service.execute(query({pncp_filters:{resultado_percentual_desconto_min:value}})));
  for(const value of [0,1.5,-1,Number.MAX_SAFE_INTEGER+1,'1']){
    if(value===0)assert.equal(validateQuery(query({pncp_filters:{ordem_classificacao_min:value}}),config()).pncp_filters.ordem_classificacao_min,0);
    else await assert.rejects(s.service.execute(query({pncp_filters:{ordem_classificacao_min:value}})),e=>e.code==='INVALID_TYPE');
  }
  for(const value of [['Brasil'],['1058'],['bra'],['BRA|ABW']])await assert.rejects(s.service.execute(query({pncp_filters:{paises_fornecedor:value}})));
  for(const document_type of [['edital'],['contrato'],null,1,{}])await assert.rejects(s.service.execute(query({document_type})),e=>e.code==='DOCUMENT_TYPE_UNAVAILABLE');
  assert.equal(s.requests.length,0);
});

test('COMPLETE-03: países preservam IDs alfabéticos e reservas usam a enumeração fechada do portal',async()=>{
  const s=demo();
  for(const pais of ['BRA','ABW']){const input=query({pncp_filters:{paises_fornecedor:[pais]}}),r=await s.execute(input),csv=await s.export(input);assert.equal(r.total,32);assert.equal(csv.metadata.exported_rows,32);assert.equal(csv.metadata.effective_filters.paises_fornecedor[0],pais);}
  await assert.rejects(s.execute(query({pncp_filters:{paises_fornecedor:['ZZZ']}})),e=>e.code==='INVALID_DOMAIN');
  const before=s.client.lastCall,domain=await s.domains('edital',null,null,null,'reservas_remanescentes');assert.equal(domain.domain_source,'reference');assert.equal(s.client.lastCall,before);assert.deepEqual(domain.filters.reservas_remanescentes.map(o=>o.id),['1','2','3']);
  assert.equal((await s.execute(query({pncp_filters:{reservas_remanescentes:['2']}}))).total,21);
  await assert.rejects(s.execute(query({pncp_filters:{reservas_remanescentes:['4']}})),e=>e.code==='INVALID_DOMAIN');
});

test('COMPLETE-04: sub-rogação, fornecedores e unidades de medida têm seleção e união sem normalizar códigos',async()=>{
  const s=demo();
  for(const [name,values,total]of [['orgaos_subrogados',['5007'],32],['unidades_subrogadas',['24550'],32],['fornecedores',['40491'],32],['municipios_fornecedor',['5300108'],32],['portes_fornecedor',['1'],32],['naturezas_juridicas',['0000'],32],['unidades_medida',['Unidade '],21]]){
    const input=query({pncp_filters:{[name]:values}});assert.equal((await s.execute(input)).total,total,name);assert.equal((await s.export(input)).metadata.exported_rows,total,name);
  }
  assert.equal((await s.execute(query({pncp_filters:{unidades_medida:['UNIDADE','Unidade ']}}))).total,43);
  assert.equal((await s.execute(query({pncp_filters:{unidades_medida:['Unidade']}}))).total,0);
  assert.equal((await s.execute(query({pncp_filters:{fornecedores:['15566','40491']}}))).total,64);
  const options=await s.suggest('edital','unidades_medida','Unidade',20);assert.deepEqual(options.items.map(o=>o.id),['UNIDADE','Unidade ']);
});

test('COMPLETE-05: os cinco novos booleanos distinguem ausência, true e false na pesquisa e no CSV',async()=>{
  const s=demo(),names=['permite_adesao','indicador_subcontratacao','indicador_aplicacao_margem_preferencia','indicador_aplicacao_beneficio_me_epp','indicador_aplicacao_criterio_desempate'];
  for(const name of names)for(const value of [true,false]){
    const input=query({pncp_filters:{[name]:value}}),r=await s.execute(input),csv=await s.export(input);assert.equal(r.total,16,name);assert.equal(csv.metadata.exported_rows,16,name);assert.equal(csv.metadata.effective_filters[name],value);
  }
  assert.equal((await s.execute(query())).total,64);
});

test('COMPLETE-06: limites de itens são inclusivos e não retiram outros itens dos detalhes',async()=>{
  const s=demo();
  const cases=[['item_quantidade','4'],['item_valor_unitario_estimado','10.50'],['item_valor_total_estimado','21.00']];
  for(const [name,boundary]of cases){
    const input=query({pncp_filters:{[name+'_min']:boundary,[name+'_max']:boundary}}),csv=await s.export(input);assert(csv.metadata.exported_rows>0 && csv.metadata.exported_rows<64,name);
    assert.equal(csv.metadata.effective_filters[name+'_min'],boundary);assert.equal(csv.metadata.effective_filters[name+'_max'],boundary);
    const details=await s.details((await s.execute(input)).data[0]._purchase,1,100);assert.equal(details.data.length,2);assert.equal(details.data[0].numeroItem,1);
  }
  assert.equal((await s.execute(query({pncp_filters:{item_valor_unitario_estimado_max:'0'}}))).total,0);
});

test('COMPLETE-07: classificação, situação, homologação e todos os intervalos de resultados filtram os pais',async()=>{
  const s=demo();
  for(const [name,boundary,total]of [['resultado_quantidade_homologado','1',8],['resultado_valor_unitario_homologado','0.50',1],['resultado_valor_total_homologado','0.00',1],['resultado_percentual_desconto','100',16]]){
    const csv=await s.export(query({pncp_filters:{[name+'_min']:boundary,[name+'_max']:boundary}}));assert.equal(csv.metadata.exported_rows,total,name);
  }
  assert.equal((await s.execute(query({pncp_filters:{ordem_classificacao_min:3,ordem_classificacao_max:3}}))).total,21);
  assert.equal((await s.execute(query({pncp_filters:{ordem_classificacao_min:0,ordem_classificacao_max:0}}))).total,64);
  assert.equal((await s.execute(query({pncp_filters:{situacoes_resultado:['4']}}))).total,16);
  const csv=await s.export(query({pncp_filters:{data_homologacao_inicio:'2026-09-01',data_homologacao_fim:'2026-09-01'}}));assert.equal(csv.metadata.exported_rows,3);
  assert.equal((await s.execute(query({pncp_filters:{tipos_margens_preferencia:'1'}}))).total,32);
});

test('COMPLETE-08: contratos projetam seus valores, datas, fornecedores e links sem confundir o sequencial da compra',async()=>{
  const s=demo(),result=await s.execute(query({document_type:'contrato'}));assert.equal(result.total,32);assert.equal(result.document_type,'contrato');
  const row=result.data[0];assert.equal(row.tipo_documento,'contrato');assert.equal(row._purchase,null);assert.match(row.url_pncp,/\/app\/contratos\//);assert(row.valor_global && row.fornecedor_nome && row.data_assinatura);
  const csv=await s.export(query({document_type:'contrato'})),header=csvBytes(csv).toString().split('\r\n')[0];assert.equal(csv.metadata.exported_rows,32);assert(header.includes('"valor_global"'));assert(!header.includes('"valor_total_estimado"'));
  assert.deepEqual(columnsFor('contrato').map(c=>c.field),schema(config()).columns_by_document.contrato.map(c=>c.field));
  const precise=project(parse('{"document_type":"contrato","id":"c1","description":"Contrato","fornecedor_ni":"01234567000189","valor_global":9007199254740993.12345,"possui_nfe":false}'));assert.equal(precise.valor_global,'9007199254740993.12345');assert.equal(precise.fornecedor_ni,'01234567000189');assert.equal(precise.possui_nfe,false);
  for(const extra of [{possui_nfe:'false'},{valor_global:false},{fornecedor_nome:[]}])assert.throws(()=>project(document(1,{document_type:'contrato',...extra})),e=>e.code==='INVALID_UPSTREAM');
});

test('COMPLETE-09: os nove filtros exclusivos de contratos funcionam com limites exatos e valores ausentes',async()=>{
  const s=demo(),cases=[['tipos_contrato',['1'],16],['fornecedores_subcontratados',['200'],24],['possui_nfe',true,8],['possui_nfe',false,8],['data_assinatura_inicio','2026-08-28',1],['data_assinatura_fim','2026-08-01',2],['data_inicio_vigencia_inicio','2026-09-28',1],['data_inicio_vigencia_fim','2026-09-01',2],['valor_global_min','9007199254740993.12345',1],['valor_global_max','10000.50',1]];
  for(const [name,value,total]of cases){const input=query({document_type:'contrato',pncp_filters:{[name]:value}});assert.equal((await s.execute(input)).total,total,name);assert.equal((await s.export(input)).metadata.exported_rows,total,name);}
  assert.equal((await s.execute(query({document_type:'contrato',pncp_filters:{valor_global_min:'9007199254740993.12346'}}))).total,0);
  const absent=await s.export(query({document_type:'contrato',pncp_filters:{valor_global_max:'999999999999999999999999.99'}}));assert.equal(absent.metadata.exported_rows,31);
  for(const status of ['vigente','nao_vigente']){const result=await s.export(query({document_type:'contrato',status}));assert.equal(result.metadata.exported_rows,16);assert.equal(result.metadata.effective_filters.status,status);}
});
