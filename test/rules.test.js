import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { applyRules,casefold,categorize,itemPresetState,documentPresetState } from '../src/rules.js';
import { project } from '../src/adapter.js';
import { validateQuery } from '../src/validation.js';
import { service,document,query,config,json } from './helpers.js';
const fullQuery = input=>validateQuery(query({mode:'refined',...input}),config());

test('RULE-01: correspondência fora da primeira página é encontrada',async()=>{
  const docs=Array.from({length:13},(_,i)=>document(i+1,{description:i===12?'Firewall':'Outro'})),s=service(docs);
  const r=await s.service.execute(query({mode:'refined',filters:[{field:'objeto_compra',type:'like',value:'firewall'}]}));assert.equal(r.data.length,1);assert.equal(r.data[0].id,'13');assert.equal(r.source_total,13);assert.equal(r.matched_documents,1);assert.equal(r.collection_complete,true);assert.equal(r.complete_for_rule,true);assert.equal(r.snapshot_guaranteed,false);assert.equal(s.requests.length,2);
  assert(s.requests.every(u=>!u.searchParams.has('q')));
});
test('RULE-02: refinamento amplo rejeitado sem truncar',async()=>{
  const s=service(Array.from({length:11},(_,i)=>document(i+1)),{}, {PNCP_MAX_REFINEMENT_CANDIDATES:10});await assert.rejects(s.service.execute(query({mode:'refined'})),e=>e.code==='QUERY_TOO_BROAD');assert.equal(s.requests.length,1);
});
test('PAGE-03: alteração de total, duplicação e página vazia abortam coleta',async()=>{
  const docs=Array.from({length:12},(_,i)=>document(i+1));
  for(const page of [{items:[document(11),document(12)],total:13},{items:[document(1),document(12)],total:12},{items:[],total:12}]) {
    const s=service(docs,{handler:u=>u.searchParams.get('pagina')==='2'?json(page):null});await assert.rejects(s.service.execute(query({mode:'refined'})),e=>e.code==='SOURCE_CHANGED');
  }
});
test('RULE-03: serviço e situação devem pertencer ao mesmo item',async()=>{
  const s=service([document(1,{description:'Oracle'})],{items:(seq,page)=>page===1?[{numeroItem:1,materialOuServico:'M',situacaoCompraItemId:2},{numeroItem:2,materialOuServico:'S',situacaoCompraItemId:3}]:[]});
  const r=await s.service.execute(query({mode:'refined',preset:'oracle'}));assert.equal(r.total,0);assert.equal(r.unverifiable_documents,0);
});
test('RULE-04/RULE-05: catálogo verificado, código exato e .0 apenas na configuração',()=>{
  const item={numeroItem:1,materialOuServico:'S',situacaoCompraItemId:2,catalogoCodigoItem:'25852',catalogo:{id:1}};
  assert.equal(itemPresetState([item],'desenvolvimento','1').state,'match');assert.equal(itemPresetState([{...item,catalogo:{id:2}}],'desenvolvimento','1').state,'no_match');assert.equal(itemPresetState([{...item,catalogoCodigoItem:'25852.0'}],'desenvolvimento','1').state,'no_match');assert.equal(itemPresetState([{...item,catalogo:null}],'desenvolvimento','1').state,'unknown');
});
test('RULE-05: dado insuficiente é unknown; detalhe HTTP falho é erro',async()=>{
  const s=service([document(1,{description:'Oracle'})],{items:(seq,page)=>page===1?[{numeroItem:1,materialOuServico:'S'}]:[]});const r=await s.service.execute(query({mode:'refined',preset:'oracle'}));assert.equal(r.total,0);assert.equal(r.unverifiable_documents,1);assert.equal(r.complete_for_rule,false);
  const failed=service([document(1,{description:'Oracle'})],{handler:u=>u.pathname.endsWith('/itens')?new Response(null,{status:404}):null});await assert.rejects(failed.service.execute(query({mode:'refined',preset:'oracle'})),e=>e.code==='PNCP_HTTP_ERROR');
});
test('RULE-05: estado administrativo do documento prevalece sobre rótulo',()=>{
  const d=project(document(1,{description:'Oracle',situacao_id:'2',situacao_nome:'Divulgada no PNCP'}));assert.equal(documentPresetState(d,'oracle'),'no_match');
});
test('ITEMS-01: uma página curta não encerra itens',async()=>{
  const s=service([document(1,{description:'Oracle'})],{items:(seq,page)=>page===1?[{numeroItem:1,materialOuServico:'M',situacaoCompraItemId:2}]:page===2?[{numeroItem:2,materialOuServico:'S',situacaoCompraItemId:2}]:[]});const r=await s.service.execute(query({mode:'refined',preset:'oracle'}));assert.equal(r.total,1);assert.deepEqual(r.data[0].matching_item_numbers,['2']);assert.equal(s.requests.filter(u=>u.pathname.endsWith('/itens')).length,3);
});
test('RULE-06: casefold Unicode sem remoção automática de acentos',()=>{
  assert.equal(casefold('Straße Σς'),'strasse σσ');const docs=[project(document(1,{description:'Straße licença'}))];
  assert.equal(applyRules(docs,fullQuery({filters:[{field:'objeto_compra',type:'like',value:'STRASSE'}]})).documents.length,1);
  assert.equal(applyRules(docs,fullQuery({filters:[{field:'objeto_compra',type:'like',value:'licenca'}]})).documents.length,0);
});
test('RULE-06: nulos, texto vazio e espaços mantêm semântica',()=>{
  const docs=[null,'',' ','NA'].map((description,i)=>project(document(i+1,{description})));
  const apply=(type,value='')=>applyRules(docs,fullQuery({filters:[{field:'objeto_compra',type,value}]})).documents;
  assert.equal(apply('empty').length,2);assert.equal(apply('not_empty').length,2);assert.equal(apply('not_like','abc').length,4);assert.equal(apply('!=','abc').length,4);assert.equal(apply('=','').length,1);
});
test('RULE-06: filtra antes de agrupar; decimal ordena 2 antes de 10; nulos no fim',()=>{
  const docs=[project(document(1,{description:'igual',orgao_nome:'não',valor_total_estimado:'10'})),project(document(2,{description:'igual',orgao_nome:'sim',valor_total_estimado:'2'})),project(document(3,{description:'outro',orgao_nome:'sim',valor_total_estimado:'10'})),project(document(4,{description:null,orgao_nome:'sim',valor_total_estimado:null}))];
  const q=fullQuery({filters:[{field:'orgao_nome',type:'=',value:'sim'}],deduplicate:'objeto_exato',sorters:[{field:'valor_total_estimado',dir:'asc'}]});const r=applyRules(docs,q);assert.deepEqual(r.documents.map(d=>d.id),['2','3','4']);assert.equal(r.matched_documents,3);q.sorters[0].dir='desc';assert.deepEqual(applyRules(docs,q).documents.map(d=>d.id),['3','2','4']);
});
test('RULE-06: grupo OR ainda é combinado por AND com cabeçalhos',()=>{
  const docs=[project(document(1,{description:'Firewall',uf:'DF'})),project(document(2,{description:'Oracle',uf:'GO'}))];const q=fullQuery({filter_join:'or',filters:[{field:'objeto_compra',type:'like',value:'firewall'},{field:'objeto_compra',type:'like',value:'oracle'}],header_filters:[{field:'uf',type:'=',value:'DF'}]});assert.deepEqual(applyRules(docs,q).documents.map(d=>d.id),['1']);
});
test('CAT-01: acentos, fronteiras Unicode e categorias múltiplas',()=>{
  assert.equal(categorize('Licenças de firewall e banco de dados em NÚVEM'),'banco-de-dados, firewall, nuvem, software');assert.equal(categorize('firewallx xfirewall Áfirewall'),'');assert(categorize('x operacao de infraestrutura de tic').includes('infraestrutura'));assert.equal(categorize(null),'');
});
test('RULE-07: regex inválida ou não suportada rejeitada antes da rede',async()=>{
  for(const value of ['[','(?P<python>x)','(?i)abc']){const s=service([]);await assert.rejects(s.service.execute(query({mode:'refined',filters:[{field:'objeto_compra',type:'regex',value}]})),e=>['INVALID_REGEX','UNSUPPORTED_REGEX'].includes(e.code));assert.equal(s.requests.length,0);}
});
test('RULE-07: regex custosa expira no worker e não bloqueia event loop',async()=>{
  const s=service([document(1,{description:'a'.repeat(10000)+'!'})],{}, {REGEX_TIMEOUT_MS:400});let ticked=false;setTimeout(()=>{ticked=true;},50);
  await assert.rejects(s.service.execute(query({mode:'refined',filters:[{field:'objeto_compra',type:'regex',value:'^(a+)+$'}]})),e=>e.code==='REGEX_TIMEOUT');assert(ticked);
});
test('CLI-01: workers funcionam com flags de execução herdadas do servidor',async()=>{
  const source="import {loadConfig} from './src/config.js'; import {PncpClient} from './src/pncp.js'; import {QueryService} from './src/query.js'; import {demoFetch} from './src/demo.js'; const config={...loadConfig({}),DEMO_MODE:true,PNCP_REQUESTS_PER_SECOND:100000}; const svc=new QueryService(config,new PncpClient(config,{fetcher:demoFetch})); console.log((await svc.execute({mode:'refined',filters:[{field:'objeto_compra',type:'like',value:'oracle'}]})).total);";
  const result=await promisify(execFile)(process.execPath,['--input-type=module','--env-file-if-exists=test/absent-fixture.env', '-e',source],{timeout:10000});assert.equal(result.stdout.trim(),'6');
});
test('PRESET-01: textos e grafias históricas permanecem',async()=>{
  for(const [preset,text]of [['oracle','MySQL'],['antivirus','crowndstrike'],['microsoft','licenciamento alng para órgão']]){const s=service([document(1,{description:text})]);const r=await s.service.execute(query({mode:'refined',preset}));assert.equal(r.total,1);assert(!s.requests[0].searchParams.has('q'));}
});
