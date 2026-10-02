import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { setImmediate as tick } from 'node:timers/promises';
import { schema } from '../src/schema.js';
import { demoFetch } from '../src/demo.js';
import { PncpClient } from '../src/pncp.js';
import { QueryService } from '../src/query.js';
import { config, service, document, query } from './helpers.js';
import { project } from '../src/adapter.js';

// Execute the actual app handlers with a minimal DOM and Tabulator adapter.
// These tests verify query state and requests, not browser rendering.
async function interfaceFixture(options={}) {
  const nodes=new Map(),all=[],pending=[];
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.value='';this.hidden=false;this.open=false;this.classList={add(){},toggle(){},contains(){return false;}};all.push(this);}
    set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
    append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    async fire(name){for(const fn of this.listeners[name] || [])await fn({target:this,preventDefault(){}});await settle();await Promise.allSettled(pending);await settle();}
    setAttribute(){}querySelectorAll(){return [];}showModal(){this.open=true;}
    close(){this.open=false;for(const fn of this.listeners.close || [])fn();}
  }
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.id=match[2];node.hidden=match[0].includes(' hidden');}
  const tabs=['native','rules','sorting'].map(name=>{const node=new Element('button');node.dataset.tab=name;return node;});
  const dom={getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),createTextNode:text=>text,addEventListener(){},querySelectorAll:selector=>selector==='dialog'?all.filter(n=>n.tagName==='dialog'):selector==='[data-tab]'?tabs:[],querySelector(){return null;}};
  const cfg=config({DEMO_MODE:true,PNCP_MAX_REFINEMENT_CANDIDATES:10});
  const backend=new QueryService(cfg,new PncpClient(cfg,{fetcher:options.itemFetcher || demoFetch})),requests=[],itemRequests=[];
  let detailFailures=options.detailFailures || 0;
  const fetcher=async(url,options={})=>{
    try{
      if(url==='/api/schema')return Response.json(schema(cfg));
      if(url.startsWith('/api/pncp/filters'))return Response.json(await backend.domains('edital'));
      if(url==='/api/query'){const input=JSON.parse(options.body);requests.push(input);return Response.json(await backend.execute(input));}
      if(url.startsWith('/api/contratacoes/')){
        itemRequests.push(url);if(detailFailures-->0)return Response.json({error:{code:'PNCP_HTTP_ERROR',message:'Falha temporária dos itens.'}},{status:503});
        const [,cnpj,ano,sequencial]=url.match(/contratacoes\/(\d+)\/(\d+)\/(\d+)\/itens/),params=new URL(url,'http://localhost').searchParams;
        return Response.json(await backend.details({cnpj,ano,sequencial},Number(params.get('pagina')),100,options.signal));
      }
      throw new Error(`Unexpected request: ${url}`);
    }catch(error){return Response.json({error:{code:error.code,message:error.message,details:error.details}},{status:error.status || 500});}
  };
  class Table {
    constructor(selector,options){this.options=options;this.size=options.paginationSize;this.handlers={};}on(name,fn){this.handlers[name]=fn;}clearSort(){}getPageSize(){return this.size;}
    setData(url,params){const task=this.options.ajaxRequestFunc(url,{},params);pending.push(task);return task;}redraw(){}
  }
  const context=vm.createContext({document:dom,Tabulator:Table,fetch:fetcher,structuredClone,Intl,Date,Number,URL,URLSearchParams,AbortController,DOMException,setTimeout,clearTimeout,console});
  vm.runInContext(await readFile(new URL('../public/app.js',import.meta.url),'utf8'),context);
  await settle();assert.equal(nodes.get('startup-error').hidden,true);
  const state=()=>JSON.parse(vm.runInContext('JSON.stringify(state.query)',context));
  const select=async name=>{await nodes.get('presets-button').fire('click');const button=nodes.get('preset-list').children.find(b=>b.children[0].textContent===name);assert(button);await button.fire('click');};
  const openDocument=doc=>vm.runInContext('state.table.handlers.rowClick',context)({}, {getData:()=>doc});
  const tableColumns=()=>JSON.parse(vm.runInContext('JSON.stringify(state.table.options.columns)',context));
  return {nodes,all,requests,itemRequests,state,select,openDocument,tableColumns};
}
async function settle(){for(let i=0;i<8;i++)await tick();}

test('PRESET-FLOW-01: selecionar consulta especializada prepara filtros sem iniciar busca',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('search').value='licença';
  await ui.select('Oracle');assert.equal(ui.requests.length,0);assert.equal(ui.nodes.get('filters-dialog').open,true);
  assert.match(ui.nodes.get('filters-title').textContent,/Oracle/);assert.match(ui.nodes.get('preset-guidance').textContent,/10 candidatos/);
  assert.equal(ui.nodes.get('draft-search').value,'licença');assert.equal(ui.state().preset,'all');
  ui.nodes.get('draft-search').value='texto cancelado';ui.nodes.get('filters-dialog').close();assert.equal(ui.state().preset,'all');assert.equal(ui.state().q,'');
});
test('PRESET-FLOW-02: texto e datas explícitos reduzem candidatos antes da verificação integral',async()=>{
  const ui=await interfaceFixture();await ui.select('Oracle');
  ui.nodes.get('draft-search').value='Oracle';
  ui.nodes.get('draft-publication-start').value='2026-09-01';await ui.nodes.get('draft-publication-start').fire('input');
  ui.nodes.get('draft-publication-end').value='2026-09-30';await ui.nodes.get('draft-publication-end').fire('input');
  await ui.nodes.get('apply-filters').fire('click');
  assert.equal(ui.requests.length,1);const q=ui.requests[0];assert.equal(q.preset,'oracle');assert.equal(q.mode,'refined');assert.equal(q.q,'Oracle');
  assert.deepEqual(q.pncp_filters,{data_publicacao_inicio:'2026-09-01',data_publicacao_fim:'2026-09-30'});
  assert.equal(ui.nodes.get('result-title').textContent,'6 contratações');assert.equal(ui.nodes.get('narrow-button').hidden,true);
});
test('PRESET-FLOW-03: busca ampla mostra contagem e permite corrigir sem trocar consulta',async()=>{
  const ui=await interfaceFixture();await ui.select('Oracle');await ui.nodes.get('apply-filters').fire('click');
  assert.match(ui.nodes.get('notice').textContent,/64 candidatos/);assert.match(ui.nodes.get('notice').textContent,/10/);
  assert.equal(ui.nodes.get('narrow-button').hidden,false);assert.equal(ui.nodes.get('retry-button').hidden,true);
  await ui.nodes.get('narrow-button').fire('click');assert.match(ui.nodes.get('preset-guidance').textContent,/64 candidatos/);
  assert.equal(ui.state().preset,'oracle');ui.nodes.get('draft-search').value='Oracle';await ui.nodes.get('apply-filters').fire('click');
  assert.equal(ui.requests.length,2);assert.equal(ui.nodes.get('result-title').textContent,'6 contratações');assert.equal(ui.nodes.get('narrow-button').hidden,true);
});
test('PRESET-FLOW-04: consultas nativas seguem diretas; datas removidas não ficam ocultas',async()=>{
  const ui=await interfaceFixture();await ui.select('Todas as contratações');assert.equal(ui.requests.length,1);
  await ui.select('Oracle');ui.nodes.get('draft-search').value='Oracle';
  ui.nodes.get('draft-publication-start').value='2026-09-01';await ui.nodes.get('draft-publication-start').fire('input');
  ui.nodes.get('draft-publication-start').value='';await ui.nodes.get('draft-publication-start').fire('input');
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests[1].pncp_filters,{});assert.equal(ui.requests[1].q,'Oracle');
});
test('PRESET-FLOW-05: limite rejeita consulta especializada antes de carregar itens, sem truncar',async()=>{
  const s=service(Array.from({length:11},(_,i)=>document(i+1,{description:'Oracle'})),{}, {PNCP_MAX_REFINEMENT_CANDIDATES:10});
  await assert.rejects(s.service.execute(query({mode:'refined',preset:'oracle'})),e=>e.code==='QUERY_TOO_BROAD' && e.details.source_total===11 && e.details.limit===10 && /11 candidatos/.test(e.message));
  assert.equal(s.requests.length,1);assert(!s.requests[0].searchParams.has('q'));
});
test('PRESET-FLOW-06: seleção preserva texto e filtros nativos já aplicados; cancelar não altera consulta',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  ui.nodes.get('draft-search').value='Oracle';ui.nodes.get('draft-publication-start').value='2026-09-01';await ui.nodes.get('draft-publication-start').fire('input');
  await ui.nodes.get('apply-filters').fire('click');const before=ui.state();
  await ui.select('Microsoft');assert.equal(ui.nodes.get('draft-search').value,'Oracle');assert.equal(ui.nodes.get('draft-publication-start').value,'2026-09-01');
  ui.nodes.get('draft-publication-start').value='2026-09-20';await ui.nodes.get('draft-publication-start').fire('input');ui.nodes.get('filters-dialog').close();
  assert.deepEqual(ui.state(),before);assert.equal(ui.requests.length,1);
});
test('DETAILS-UI-01: abrir uma linha carrega itens automaticamente e usa o link /app/editais',async()=>{
  const ui=await interfaceFixture(),doc=project(document(1,{item_url:'/compras/00000000000000/2026/1'}));
  const columns=ui.tableColumns();assert.equal(columns[0].field,'titulo');assert.equal(columns[0].visible,true);assert.equal(columns.find(c=>c.field==='municipio_nome').visible,true);
  await ui.openDocument(doc);assert.equal(ui.nodes.get('details-dialog').open,true);assert.equal(ui.itemRequests.length,1);
  assert.equal(ui.itemRequests[0],'/api/contratacoes/00000000000000/2026/1/itens?pagina=1&tamanhoPagina=100');
  assert(ui.all.some(n=>n.className==='item-card'));assert.equal(ui.all.find(n=>n.textContent==='Abrir no PNCP').href,'https://pncp.gov.br/app/editais/00000000000000/2026/1');
  assert(!ui.all.some(n=>n.textContent==='Atualizar itens'));
  assert.equal(ui.all.find(n=>n.textContent==='Tentar consultar itens').hidden,true);
});
test('DETAILS-UI-02: ausência de identificação mostra aviso sem tentar consultar itens',async()=>{
  const ui=await interfaceFixture();await ui.openDocument(project(document(1,{orgao_cnpj:null})));
  assert.equal(ui.itemRequests.length,0);assert(ui.all.some(n=>n.className==='items-status' && /não forneceu CNPJ/.test(n.textContent)));
});
test('DETAILS-UI-03: erro no carregamento automático permite repetir a consulta de itens',async()=>{
  const ui=await interfaceFixture({detailFailures:1});await ui.openDocument(project(document(1)));
  assert.equal(ui.itemRequests.length,1);const retry=ui.all.find(n=>n.textContent==='Tentar consultar itens');assert(retry);assert.equal(retry.hidden,false);
  await retry.fire('click');assert.equal(ui.itemRequests.length,2);assert(ui.all.some(n=>n.className==='item-card'));assert.equal(retry.hidden,true);
});

test('DETAILS-UI-04: mostra 109 itens e mantém a última página sem oferecer uma página vazia',async()=>{
  let total=109;const itemPages=[];
  const ui=await interfaceFixture({itemFetcher:url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/itens/quantidade'))return Promise.resolve(Response.json(total));
    if(u.pathname.endsWith('/itens')) {
      const page=Number(u.searchParams.get('pagina'));itemPages.push(page);
      return Promise.resolve(Response.json(Array.from({length:total},(_,i)=>({numeroItem:i+1,descricao:`Item ${i+1}`})).slice((page-1)*100,page*100)));
    }
    return demoFetch(url);
  }});
  await ui.openDocument(project(document(1)));
  const section=ui.nodes.get('details-content').children.find(n=>n.className==='items-section');
  const [toolbar,itemStatus,list,pager]=section.children,[previous,pageLabel,next]=pager.children;
  assert.equal(toolbar.children[0].textContent,'Itens da contratação (109)');
  assert.match(itemStatus.textContent,/Itens 1–100 de 109/);assert.equal(pageLabel.textContent,'Página 1 de 2');
  assert.equal(previous.disabled,true);assert.equal(next.disabled,false);
  await next.fire('click');
  assert.equal(list.children.length,9);assert.equal(list.children[0].children[0].textContent,'Item 101');
  assert.match(itemStatus.textContent,/Itens 101–109 de 109/);assert.equal(pageLabel.textContent,'Página 2 de 2');
  assert.equal(next.disabled,true);assert.equal(previous.disabled,false);assert.deepEqual(itemPages,[1,2]);
  assert(!ui.all.some(n=>/Fim dos itens confirmado/.test(n.textContent || '')));
  await previous.fire('click');assert.equal(pageLabel.textContent,'Página 1 de 2');assert.equal(next.disabled,false);
  await next.fire('click');
  await previous.fire('click');total=1;await next.fire('click');
  assert.equal(toolbar.children[0].textContent,'Itens da contratação (1)');
  assert.equal(pageLabel.textContent,'Página 1 de 1');assert.equal(list.children.length,1);assert.equal(pager.hidden,true);
  assert.match(itemStatus.textContent,/Itens 1–1 de 1/);assert.equal(next.disabled,true);
});

test('DETAILS-UI-05: contratação sem itens mostra total zero e oculta a paginação',async()=>{
  const ui=await interfaceFixture({itemFetcher:url=>new URL(url).pathname.endsWith('/itens/quantidade')?Promise.resolve(Response.json(0)):demoFetch(url)});
  await ui.openDocument(project(document(1)));
  const section=ui.nodes.get('details-content').children.find(n=>n.className==='items-section'),[toolbar,itemStatus,list,pager]=section.children;
  assert.equal(toolbar.children[0].textContent,'Itens da contratação (0)');assert.match(itemStatus.textContent,/0 itens/);
  assert.equal(list.children[0].textContent,'Esta contratação não possui itens.');assert.equal(pager.hidden,true);
});
