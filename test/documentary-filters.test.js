import test from 'node:test';
import assert from 'node:assert/strict';
import {PncpClient} from '../src/pncp.js';
import {QueryService} from '../src/query.js';
import {demoFetch} from '../src/demo.js';
import {createApplication} from '../src/server.js';
import {config,query,service,document,json} from './helpers.js';

const booleans=['indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional'];
const demo=()=>{const cfg=config({DEMO_MODE:true});return new QueryService(cfg,new PncpClient(cfg,{fetcher:demoFetch}));};

test('DOCUMENTARY-01: origem e modo de disputa aceitam IDs únicos e união de opções',async()=>{
  const s=demo();
  for(const [name,field]of [['fontes','usuario_id'],['modos_disputa','modo_disputa_id']]){
    const cases=name==='fontes'?[[['3'],22],[['5'],21],[['3','5'],43]]:[[['1'],22],[['2'],21],[['1','2'],43]];
    for(const [values,total]of cases){
      const result=await s.export(query({pncp_filters:{[name]:values}}));
      assert.equal(result.metadata.total,total);assert.equal(result.metadata.data.length,total);
      assert(result.metadata.data.every(d=>values.includes(d._raw[field])));
    }
  }
});

test('DOCUMENTARY-02: booleanos distinguem ausência, true e false na pesquisa e no CSV',async()=>{
  const s=demo();assert.equal((await s.execute(query())).total,64);
  for(const name of booleans)for(const value of [true,false]){
    const input=query({pncp_filters:{[name]:value}}),page=await s.execute(input),csv=await s.export(input);
    assert.equal(page.total,16);assert.equal(page.data.length,10);assert.equal(csv.metadata.data.length,16);
    assert(csv.metadata.data.every(d=>d._raw[name]===value));
    assert.equal(csv.metadata.effective_filters[name],value);
    assert.equal(csv.csv.toString('utf8').split('\r\n').length,18);
  }
});

test('DOCUMENTARY-03: combinação documental mantém predicados nas páginas e na exportação',async()=>{
  const s=demo(),pncp_filters={fontes:['3','5'],modos_disputa:['1','2'],...Object.fromEntries(booleans.map(name=>[name,false]))};
  const first=await s.execute(query({pncp_filters})),second=await s.execute(query({pncp_filters,page:2})),csv=await s.export(query({pncp_filters,page:2}));
  assert.equal(first.total,11);assert.equal(first.data.length,10);assert.equal(second.data.length,1);
  assert.equal(csv.metadata.data.length,11);
  assert.deepEqual([...first.data,...second.data].map(d=>d.id),csv.metadata.data.map(d=>d.id));
  assert(csv.metadata.data.every(d=>['3','5'].includes(d._raw.usuario_id) && ['1','2'].includes(d._raw.modo_disputa_id) && booleans.every(name=>d._raw[name]===false)));
});

test('DOCUMENTARY-04: tipos inválidos e capacidades restantes são recusados antes da rede',async()=>{
  const s=service([document(1)]);
  for(const name of booleans)for(const value of ['false',0,null,[false]])await assert.rejects(s.service.execute(query({pncp_filters:{[name]:value}})),e=>e.code==='INVALID_TYPE');
  for(const name of ['fontes','modos_disputa'])for(const value of ['1',[1],['nome'],[]])await assert.rejects(s.service.execute(query({pncp_filters:{[name]:value}})));
  for(const name of ['permite_adesao','possui_emenda_parlamentar'])await assert.rejects(s.service.execute(query({pncp_filters:{[name]:true}})),e=>e.code==='CAPABILITY_PENDING');
  await assert.rejects(s.service.execute(query({pncp_filters:{possui_nfe:true}})),e=>e.code==='DOCUMENT_FILTER_UNAVAILABLE');
  assert.equal(s.requests.length,0);
});

test('DOCUMENTARY-05: domínios compartilhados são conferidos e valores chegam intactos ao PNCP',async()=>{
  const s=service([document(1)],{handler:u=>u.pathname.endsWith('/filters')?json({filters:{fontes:[{id:3,nome:'Compras.gov.br'},{id:5,nome:'BLL Compras'}],modos_disputa:[{id:1,nome:'Aberto'},{id:3,nome:'Aberto-Fechado'}]}}):null});
  const pncp_filters={fontes:['3','5'],modos_disputa:['1','3'],...Object.fromEntries(booleans.map(name=>[name,false]))};
  for(const run of [input=>s.service.execute(input),input=>s.service.export(input)]){
    const before=s.requests.length;await run(query({pncp_filters}));assert.equal(s.requests.length-before,2);
    const u=s.requests.at(-1);assert.equal(u.searchParams.get('fontes'),'3|5');assert.equal(u.searchParams.get('modos_disputa'),'1|3');
    assert(u.search.includes('3%7C5'));assert(!u.search.includes('%257C'));
    for(const name of booleans)assert.equal(u.searchParams.get(name),'false');
    const beforeInvalid=s.requests.length;await assert.rejects(run(query({pncp_filters:{fontes:['999']}})),e=>e.code==='INVALID_DOMAIN');
    assert.equal(s.requests.length,beforeInvalid+1);assert(s.requests.at(-1).pathname.endsWith('/filters'));
  }
  const missing=service([document(1)],{handler:u=>u.pathname.endsWith('/filters')?json({filters:{}}):null});
  await assert.rejects(missing.service.execute(query({pncp_filters:{modos_disputa:['1']}})),e=>e.code==='DOMAIN_UNAVAILABLE');assert.equal(missing.requests.length,1);
});

test('DOCUMENTARY-06: API padrão habilita o grupo e mantém os mesmos critérios no CSV',async t=>{
  const app=createApplication(config({DEMO_MODE:true}));await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`,schema=await (await fetch(base+'/api/schema')).json();
  for(const name of ['fontes','modos_disputa',...booleans])assert.equal(schema.capabilities.find(c=>c.name===name).state,'enabled');
  const input=query({pncp_filters:{fontes:['3'],modos_disputa:['1'],tem_contrato_empenho:false,tem_nfe_contrato:false}});
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await post('/api/query',input);assert.equal(response.status,200);const result=await response.json();assert.equal(result.total,5);
  assert(result.data.every(d=>d._raw.tem_contrato_empenho===false && d._raw.tem_nfe_contrato===false));
  const csv=await post('/api/export',{query:input});assert.equal(csv.status,200);assert.equal(csv.headers.get('X-Exported-Rows'),'5');assert.equal((await csv.text()).split('\r\n').length,7);
});
