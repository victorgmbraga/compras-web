import test from 'node:test';
import assert from 'node:assert/strict';
import {PncpClient} from '../src/pncp.js';
import {QueryService} from '../src/query.js';
import {demoFetch} from '../src/demo.js';
import {createApplication} from '../src/server.js';
import {config,query,service,document,json} from './helpers.js';

const itemBooleans=['incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'];
const demo=()=>{const cfg=config({DEMO_MODE:true});return new QueryService(cfg,new PncpClient(cfg,{fetcher:demoFetch}));};

test('ITEM-FILTER-01: emenda parlamentar distingue omissão, Sim, Não e informação ausente',async()=>{
  const s=demo(),all=await s.export(query());assert.equal(all.metadata.total,64);assert(all.metadata.data.some(d=>d._raw.possui_emenda_parlamentar===null));
  for(const value of [true,false]){
    const input=query({pncp_filters:{possui_emenda_parlamentar:value}}),page=await s.execute(input),csv=await s.export(input);
    assert.equal(page.total,16);assert.equal(csv.metadata.data.length,16);assert(csv.metadata.data.every(d=>d._raw.possui_emenda_parlamentar===value));
    assert.equal(csv.metadata.effective_filters.possui_emenda_parlamentar,value);
  }
});

test('ITEM-FILTER-02: listas selecionam contratações pelos itens e preservam união de IDs',async()=>{
  const s=demo();
  const cases=[['criterios_julgamento',['1'],32,'criterioJulgamentoId'],['criterios_julgamento',['1','2'],64,'criterioJulgamentoId'],['categorias_leilao',['1'],22,'itemCategoriaId'],['categorias_leilao',['1','2'],43,'itemCategoriaId'],['beneficios',['1'],16,'tipoBeneficio'],['beneficios',['1','3'],32,'tipoBeneficio']];
  for(const [name,values,total,field]of cases){
    const result=await s.execute(query({pncp_filters:{[name]:values}}));assert.equal(result.total,total);
    const details=await s.details(result.data[0]._purchase,1,100);assert.equal(details.total_items,2);
    assert(details.data.some(item=>values.includes(String(item[field]))));
  }
});

test('ITEM-FILTER-03: booleanos refletem a contratação e os detalhes mantêm itens diferentes',async()=>{
  const s=demo(),fields=['incentivoProdutivoBasico','aplicabilidadeMargemPreferenciaNormal','aplicabilidadeMargemPreferenciaAdicional'];
  for(const [index,name]of itemBooleans.entries())for(const value of [true,false]){
    const csv=await s.export(query({pncp_filters:{[name]:value}}));assert.equal(csv.metadata.data.length,16);assert(csv.metadata.data.every(d=>d._raw[name]===value));
    const details=await s.details(csv.metadata.data[0]._purchase,1,100);assert.equal(details.data.length,2);
    assert(details.data.some(item=>item[fields[index]]===value));
    assert(details.data.some(item=>item[fields[index]]!==value));
    const page2=await s.details(csv.metadata.data[0]._purchase,2,1);assert.equal(page2.data[0].numeroItem,2);assert.equal(page2.has_more,false);
  }
});

test('ITEM-FILTER-04: combinação não reduz os detalhes nem presume um único item correspondente',async()=>{
  const s=demo(),pncp_filters={criterios_julgamento:['7'],categorias_leilao:['1'],beneficios:['1'],incentivo_produtivo_basico:true,aplicabilidade_margem_preferencia_normal:true,aplicabilidade_margem_preferencia_adicional:true,possui_emenda_parlamentar:true};
  const csv=await s.export(query({pncp_filters}));assert.equal(csv.metadata.data.length,6);assert.equal(csv.csv.toString('utf8').split('\r\n').length,8);
  const details=await s.details(csv.metadata.data[0]._purchase,1,100);assert.equal(details.total_items,2);
  assert(details.data.some(item=>item.criterioJulgamentoId===7));assert(details.data.some(item=>item.tipoBeneficio===1));
  assert(!details.data.some(item=>item.criterioJulgamentoId===7 && item.tipoBeneficio===1));
});

test('ITEM-FILTER-05: aliases validam domínios reais e serializam nomes nativos sem buscar itens',async()=>{
  const s=service([document(1)],{handler:u=>u.pathname.endsWith('/filters')?json({filters:{criterios_julgamento:[{id:1},{id:7}],item_categorias_leilao:[{id:1},{id:3}],item_beneficios:[{id:1},{id:4}]}}):null});
  const pncp_filters={criterios_julgamento:['1','7'],categorias_leilao:['1','3'],beneficios:['1','4'],...Object.fromEntries(itemBooleans.map(name=>[name,false])),possui_emenda_parlamentar:false};
  for(const run of [input=>s.service.execute(input),input=>s.service.export(input)]){
    const before=s.requests.length;await run(query({pncp_filters}));assert.equal(s.requests.length-before,2);
    const params=s.requests.at(-1).searchParams;assert.equal(params.get('categorias_leilao'),'1|3');assert.equal(params.get('beneficios'),'1|4');assert(!params.has('item_beneficios'));assert(!params.has('item_categorias_leilao'));
    for(const name of [...itemBooleans,'possui_emenda_parlamentar'])assert.equal(params.get(name),'false');
    for(const name of ['criterios_julgamento','categorias_leilao','beneficios']){
      const start=s.requests.length;await assert.rejects(run(query({pncp_filters:{[name]:['999']}})),e=>e.code==='INVALID_DOMAIN');assert.equal(s.requests.length,start+1);assert(s.requests.at(-1).pathname.endsWith('/filters'));
    }
  }
  assert(!s.requests.some(u=>u.pathname.includes('/itens')));
});

test('ITEM-FILTER-06: entradas inválidas e contexto de contratos são rejeitados antes da rede',async()=>{
  const s=service([document(1)]);
  for(const name of [...itemBooleans,'possui_emenda_parlamentar'])for(const value of ['false',null,0,[]])await assert.rejects(s.service.execute(query({pncp_filters:{[name]:value}})),e=>e.code==='INVALID_TYPE');
  for(const name of ['criterios_julgamento','categorias_leilao','beneficios'])for(const value of ['1',[1],['nome'],['1|2'],[]])await assert.rejects(s.service.execute(query({pncp_filters:{[name]:value}})));
  for(const pncp_filters of [{permite_adesao:'true'},{item_quantidade_min:1},{situacoes_resultado:'1'},{fornecedores:[1]}])await assert.rejects(s.service.execute(query({pncp_filters})),e=>e.code==='INVALID_TYPE' || e.code==='INVALID_DECIMAL');
  await assert.rejects(s.service.execute(query({pncp_filters:{possui_nfe:true}})),e=>e.code==='DOCUMENT_FILTER_UNAVAILABLE');
  assert.equal(s.requests.length,0);
});

test('ITEM-FILTER-07: API combina os sete filtros e exporta contratações em vez de itens',async t=>{
  const app=createApplication(config({DEMO_MODE:true}));await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`,pncp_filters={criterios_julgamento:['7'],categorias_leilao:['1'],beneficios:['1'],...Object.fromEntries(itemBooleans.map(name=>[name,true])),possui_emenda_parlamentar:true},input=query({pncp_filters});
  const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await post('/api/query',input);assert.equal(response.status,200);const result=await response.json();assert.equal(result.total,6);
  const csv=await post('/api/export',{query:input});assert.equal(csv.status,200);assert.equal(csv.headers.get('X-Exported-Rows'),'6');assert.equal((await csv.text()).split('\r\n').length,8);
});

test('ITEM-FILTER-08: detalhes da demonstração mantêm quantidade e páginas coerentes fora do conjunto',async()=>{
  const s=demo(),purchase={cnpj:'00000000000000',ano:'2026',sequencial:'65'};
  const result=await s.details(purchase,1,100);assert.equal(result.total_items,0);assert.deepEqual(result.data,[]);assert.equal(result.has_more,false);
  await assert.rejects(s.details(purchase,2,100),e=>e.code==='PAGE_OUT_OF_RANGE');
});
