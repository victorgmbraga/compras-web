import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { setImmediate as tick } from 'node:timers/promises';
import { schema } from '../src/schema.js';
import { demoFetch,demoContracts } from '../src/demo.js';
import { PncpClient } from '../src/pncp.js';
import { QueryService } from '../src/query.js';
import { config, service, document, query } from './helpers.js';
import { project } from '../src/adapter.js';

// Execute the actual app handlers with a minimal DOM and Tabulator adapter.
// These tests verify query state and requests, not browser rendering.
async function interfaceFixture(options={}) {
  const nodes=new Map(),all=[],pending=[],downloads=[];
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.value='';this.hidden=false;this.open=false;this.classList={add(){},toggle(){},contains(){return false;}};all.push(this);}
    set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
    append(...children){this.children.push(...children);}replaceChildren(...children){
      const detach=node=>{if(!node || typeof node!=='object')return;if(node.id && nodes.get(node.id)===node)nodes.delete(node.id);for(const child of node.children || [])detach(child);};
      for(const node of this.children)detach(node);this.children=children;
    }
    get selectedOptions(){return this.children.filter(n=>n.selected);}
    click(){if(this.tagName==='a')downloads.push({href:this.href,filename:this.download});}remove(){}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    async fire(name){for(const fn of this.listeners[name] || [])await fn({target:this,preventDefault(){}});await settle();await Promise.allSettled(pending);await settle();}
    setAttribute(name,value){(this.attributes??={})[name]=String(value);}getAttribute(name){return this.attributes?.[name] ?? null;}querySelectorAll(){return [];}showModal(){this.open=true;}
    close(){this.open=false;for(const fn of this.listeners.close || [])fn();}
  }
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.id=match[2];node.hidden=match[0].includes(' hidden');}
  const dom={body:new Element('body'),getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),createTextNode:text=>text,addEventListener(){},querySelectorAll:selector=>selector==='dialog'?all.filter(n=>n.tagName==='dialog'):[],querySelector(){return null;}};
  const cfg=config({DEMO_MODE:true,...options.config});
  const backend=new QueryService(cfg,new PncpClient(cfg,{fetcher:options.itemFetcher || demoFetch})),requests=[],itemRequests=[],exportRequests=[],domainRequests=[],suggestRequests=[];
  const queryHandler=options.queryHandler,exportHandler=options.exportHandler,domainHandler=options.domainHandler;
  let detailFailures=options.detailFailures || 0;
  const fetcher=async(url,options={})=>{
    try{
      if(url==='/api/schema')return Response.json(schema(cfg));
      if(url.startsWith('/api/pncp/filters')){
        domainRequests.push(url);if(domainHandler)return domainHandler(url,options,backend);
        const p=new URL(url,'http://localhost').searchParams;return Response.json(await backend.domains(p.get('tipos_documento') || 'edital',p.get('normativos_base')?.split('|'),options.signal,null,p.get('campo')));
      }
      if(url.startsWith('/api/pncp/suggest')){suggestRequests.push(url);const p=new URL(url,'http://localhost').searchParams;return Response.json(await backend.suggest(p.get('tipos_documento') || 'edital',p.get('campo'),p.get('q'),Number(p.get('tam_pagina')),options.signal));}
      if(url==='/api/query'){const input=JSON.parse(options.body);requests.push(input);if(queryHandler)return await queryHandler(input,options,backend);return Response.json(await backend.execute(input,options.signal));}
      if(url==='/api/export') {
        const input=JSON.parse(options.body);exportRequests.push(input);
        if(exportHandler)return await exportHandler(input,options,backend);
        const result=await backend.export(input.query,options.signal);
        return new Response(result.csv,{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="compras-demo.csv"','X-Exported-Rows':String(result.metadata.data.length),'X-PNCP-Started-At':result.metadata.started_at,'X-PNCP-Finished-At':result.metadata.finished_at}});
      }
      if(url.startsWith('/api/contratacoes/')){
        itemRequests.push(url);if(detailFailures-->0)return Response.json({error:{code:'PNCP_HTTP_ERROR',message:'Falha temporária dos itens.'}},{status:503});
        const [,cnpj,ano,sequencial]=url.match(/contratacoes\/(\d+)\/(\d+)\/(\d+)\/itens/),params=new URL(url,'http://localhost').searchParams;
        return Response.json(await backend.details({cnpj,ano,sequencial},Number(params.get('pagina')),100,options.signal));
      }
      throw new Error(`Unexpected request: ${url}`);
    }catch(error){if(error.name==='AbortError')throw error;return Response.json({error:{code:error.code,message:error.message,details:error.details}},{status:error.status || 500});}
  };
  class Table {
    constructor(selector,options){this.options=options;this.size=options.paginationSize;this.handlers={};}on(name,fn){this.handlers[name]=fn;}clearSort(){}getPageSize(){return this.size;}
    setData(url,params){const task=this.options.ajaxRequestFunc(url,{},params);pending.push(task);return task;}setPage(page){return this.setData('/api/query',{page,size:this.size});}redraw(){}clearData(){}setColumns(columns){this.options.columns=columns;}
  }
  const context=vm.createContext({document:dom,window:{addEventListener(){}},Tabulator:Table,fetch:fetcher,structuredClone,Intl,Date,Number,URL,URLSearchParams,AbortController,DOMException,setTimeout,clearTimeout,console});
  vm.runInContext(await readFile(new URL('../public/app.js',import.meta.url),'utf8'),context);
  await settle();assert.equal(nodes.get('startup-error').hidden,true);
  const buildTable=async()=>{vm.runInContext('state.table.handlers.tableBuilt()',context);await Promise.allSettled(pending);await settle();};
  if(!options.deferTableBuilt)await buildTable();
  const state=()=>JSON.parse(vm.runInContext('JSON.stringify(state.query)',context));
  const openDocument=doc=>vm.runInContext('state.table.handlers.rowClick',context)({}, {getData:()=>doc});
  const tableColumns=()=>JSON.parse(vm.runInContext('JSON.stringify(state.table.options.columns)',context));
  const request=params=>vm.runInContext('requestTable',context)('/api/query',{},params);
  const footer=()=>vm.runInContext('state.table.options.paginationCounter',context)();
  const draft=()=>JSON.parse(vm.runInContext('JSON.stringify(state.draft)',context));
  const setFilter=(name,value)=>vm.runInContext('setDraftFilter',context)(name,value);
  return {nodes,all,requests,itemRequests,exportRequests,domainRequests,suggestRequests,downloads,state,draft,setFilter,openDocument,tableColumns,request,footer,buildTable};
}
async function settle(){for(let i=0;i<8;i++)await tick();}

test('HEADER-UI-01: ordenação e todas as ações dos resultados ficam no cabeçalho',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const header=html.match(/<header\b[^>]*id="app-header"[^>]*>([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);assert.match(header,/class="header-toolbar"/);
  assert.match(header,/id="search-button">Pesquisar<\/button>\s*<button type="button" class="button danger search-action" id="cancel-button" hidden>Cancelar<\/button>/);
  assert.doesNotMatch(html,/class="result-toolbar"/);
  assert.match(header, /id="filters-button"[\s\S]*?<\/button>\s*<button type="button" class="button" id="clear-button" hidden>Limpar filtros<\/button>/);
  for(const id of ['order','clear-button','cancel-button','retry-button','refresh-button','columns-button','export-button']) {
    assert.match(header,new RegExp(`id="${id}"`));
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1);
  }
});

test('HEADER-UI-02: atualizar, colunas e exportar usam somente ícones com nomes acessíveis',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const [id,label]of [['refresh-button','Atualizar resultados'],['columns-button','Selecionar colunas'],['export-button','Exportar CSV']]) {
    const button=html.match(new RegExp(`<button id="${id}"([^>]*)>([\\s\\S]*?)<\\/button>`));
    assert.ok(button);assert.match(button[1],/class="[^"]*\bicon-only\b/);
    assert.match(button[1],new RegExp(`aria-label="${label}"`));assert.match(button[1],new RegExp(`title="${label}"`));
    assert.match(button[2],/^<svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*<\/svg>$/);
    assert.equal(button[2].replace(/<[^>]+>/g,''),'');
  }
});

test('EXPORT-UI-01: um clique baixa o CSV dos últimos critérios concluídos sem modal',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('search').value='firewall';await ui.nodes.get('search-form').fire('submit');
  const completed=ui.state();ui.nodes.get('search').value='texto ainda não pesquisado';
  await ui.nodes.get('export-button').fire('click');
  assert.equal(ui.nodes.has('export-dialog'),false);assert.equal(ui.nodes.has('download-csv'),false);
  assert.equal(ui.exportRequests.length,1);assert.deepEqual(ui.exportRequests[0],{query:completed});
  assert.equal(ui.downloads.length,1);assert.equal(ui.downloads[0].filename,'compras-demo.csv');
  assert.match(ui.nodes.get('notice').textContent,/6 linhas exportadas/);
  assert.equal(ui.nodes.get('export-button').disabled,false);assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'false');
});

test('EXPORT-UI-02: geração desabilita o botão e impede exportações duplicadas',async()=>{
  let finish;
  const ui=await interfaceFixture({exportHandler:(input,options,backend)=>new Promise(resolve=>{finish=async()=>{
    const result=await backend.export(input.query,options.signal);
    resolve(new Response(result.csv,{headers:{'X-Exported-Rows':'64','X-PNCP-Started-At':result.metadata.started_at,'X-PNCP-Finished-At':result.metadata.finished_at}}));
  };})});
  const exporting=ui.nodes.get('export-button').fire('click');await settle();
  assert.equal(ui.nodes.get('export-button').disabled,true);assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'true');
  assert.match(ui.nodes.get('notice').textContent,/gerando CSV/);
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.length,1);
  await finish();await exporting;assert.equal(ui.downloads.length,1);assert.equal(ui.nodes.get('export-button').disabled,false);
  assert.equal(ui.nodes.get('export-button').title,'Exportar CSV');
});

test('EXPORT-UI-03: falha é exibida acima da tabela e permite tentar exportar novamente',async()=>{
  const ui=await interfaceFixture({exportHandler:()=>Response.json({error:{code:'EXPORT_TOO_BROAD',message:'Delimite a pesquisa.'}},{status:422})});
  await ui.nodes.get('export-button').fire('click');
  assert.equal(ui.downloads.length,0);assert.equal(ui.nodes.get('notice').className,'notice error');
  assert.match(ui.nodes.get('notice').textContent,/Falha ao exportar CSV: Delimite a pesquisa/);
  assert.equal(ui.nodes.get('export-button').disabled,false);assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'false');
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.length,2);
});

test('EXPORT-UI-04: uma nova consulta cancela a exportação e descarta seu download tardio',async()=>{
  let finish,signal;
  const ui=await interfaceFixture({exportHandler:(input,options)=>{signal=options.signal;return new Promise(resolve=>{finish=()=>resolve(new Response('csv antigo'));});}});
  const exporting=ui.nodes.get('export-button').fire('click');await settle();
  await ui.request({page:1});assert.equal(signal.aborted,true);assert.equal(ui.nodes.get('export-button').disabled,false);
  finish();await exporting;assert.equal(ui.downloads.length,0);assert.equal(ui.nodes.get('notice').hidden,true);
  assert.equal(ui.nodes.get('export-button').getAttribute('aria-busy'),'false');
});

test('STARTUP-UI-01: abrir a aplicação consulta a primeira página sem texto ou filtros',async()=>{
  const ui=await interfaceFixture();assert.equal(ui.requests.length,1);
  assert.deepEqual(ui.requests[0],{
    api_version:'2.0',document_type:'edital',q:'',status:'todos',
    pncp_filters:{},order:'-data',page:1,size:100,
  });
  assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
  assert.equal(ui.nodes.get('table-loader').hidden,true);assert.equal(ui.nodes.get('export-button').disabled,false);
});

test('STARTUP-UI-02: falha da pesquisa inicial usa o aviso de consulta e permite tentar novamente',async()=>{
  let fail=true;
  const ui=await interfaceFixture({queryHandler:async(input,options,backend)=>fail
    ?Response.json({error:{code:'PNCP_UNAVAILABLE',message:'PNCP indisponível.'}},{status:503})
    :Response.json(await backend.execute(input,options.signal))});
  assert.equal(ui.requests.length,1);assert.equal(ui.nodes.get('startup-error').hidden,true);
  assert.match(ui.nodes.get('notice').textContent,/PNCP indisponível/);
  assert.equal(ui.nodes.get('retry-button').hidden,false);assert.equal(ui.nodes.get('table-loader').hidden,true);
  fail=false;await ui.nodes.get('retry-button').fire('click');
  assert.equal(ui.requests.length,2);assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
  assert.equal(ui.nodes.get('notice').hidden,true);
});

test('TABLE-FOOTER-01: total real no rodapé, aviso de janela no marcador e demais avisos acima da tabela',async()=>{
  let total=4143240,extraWarning=false,fail=false;
  const source=service([],{handler:u=>{
    const size=Number(u.searchParams.get('tam_pagina')),page=Number(u.searchParams.get('pagina'));
    return Response.json({items:Array.from({length:size},(_,i)=>document((page-1)*size+i+1)),total});
  }});
  const ui=await interfaceFixture({queryHandler:async input=>{
    if(fail)return Response.json({error:{code:'PNCP_UNAVAILABLE',message:'PNCP indisponível.'}},{status:503});
    const result=await source.service.execute(input);
    if(extraWarning)result.warnings.push({code:'MISSING_IDENTITY',message:'Há documentos sem identidade de negócio na página.'});
    return Response.json(result);
  }});
  assert.equal(ui.footer(),ui.nodes.get('result-info'));assert.equal(ui.nodes.get('result-info').hidden,false);
  const result=await ui.request({page:1});
  assert.equal(result.last_row,10000);assert.equal(result.last_page,100);
  assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 1-100 de ');
  assert.equal(ui.nodes.get('result-title').textContent,'4.143.240 contratações');
  const warning=ui.nodes.get('window-warning');assert.equal(warning.hidden,false);
  assert.equal(ui.nodes.get('window-warning-tooltip').textContent,'Refine a pesquisa para acessar todos os resultados. A janela acessível é de 10000 documentos.');
  assert.equal(ui.nodes.get('window-warning-tooltip').hidden,true);assert.equal(ui.nodes.get('notice').hidden,true);
  extraWarning=true;await ui.request({page:100});
  assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 9.901-10.000 de ');
  assert.equal(ui.nodes.get('notice').hidden,false);
  assert.equal(ui.nodes.get('notice').textContent,'Há documentos sem identidade de negócio na página.');
  fail=true;await assert.rejects(ui.request({page:1}),e=>e.code==='PNCP_UNAVAILABLE');
  assert.match(ui.nodes.get('notice').textContent,/PNCP indisponível/);assert.match(ui.nodes.get('notice').textContent,/resultado anterior/);
  assert.equal(ui.nodes.get('notice').className,'notice error');assert.equal(warning.hidden,false);
  fail=false;extraWarning=false;total=10000;await ui.request({page:1});
  assert.equal(warning.hidden,true);assert.equal(ui.nodes.get('notice').hidden,true);
});

test('TABLE-FOOTER-02: intervalo usa os dados da página curta e apresenta zero para consulta vazia',async()=>{
  const source=service(Array.from({length:164},(_,i)=>document(i+1))),empty=service([]);
  let noResults=false;
  const ui=await interfaceFixture({queryHandler:async input=>Response.json(await (noResults?empty:source).service.execute(input))});
  await ui.request({page:1});assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 1-100 de ');
  await ui.request({page:2});assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 101-164 de ');
  assert.equal(ui.nodes.get('result-title').textContent,'164 contratações');
  noResults=true;await ui.request({page:1});
  assert.equal(ui.nodes.get('result-range').textContent,'Exibindo 0-0 de ');assert.equal(ui.nodes.get('result-title').textContent,'0 contratações');
  assert.equal(ui.nodes.get('window-warning').hidden,true);
});

test('TABLE-LOADER-01: consulta, atualização e paginação mostram loader; sucesso, falha e cancelamento o removem',async()=>{
  const source=service(Array.from({length:164},(_,i)=>document(i+1))),waiting=[];
  const ui=await interfaceFixture({deferTableBuilt:true,queryHandler:(input,{signal})=>new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException('Consulta cancelada.','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    waiting.push({finish:async()=>{signal.removeEventListener('abort',abort);resolve(Response.json(await source.service.execute(input)));},fail:()=>{signal.removeEventListener('abort',abort);resolve(Response.json({error:{code:'PNCP_UNAVAILABLE',message:'PNCP indisponível.'}},{status:503}));}});
  })});
  const loader=ui.nodes.get('table-loader'),table=ui.nodes.get('results-table'),title=ui.nodes.get('table-loader-title');
  const busy=value=>{assert.equal(loader.hidden,!value);assert.equal(table.inert,value);assert.equal(table.getAttribute('aria-busy'),String(value));assert.equal(ui.nodes.get('search-button').hidden,value);assert.equal(ui.nodes.get('cancel-button').hidden,!value);};
  busy(false);
  const initial=ui.buildTable();await settle();busy(true);assert.equal(title.textContent,'Carregando contratações');assert.equal(ui.nodes.get('cancel-button').hidden,false);
  await waiting[0].finish();await initial;busy(false);
  const refresh=ui.nodes.get('refresh-button').fire('click');await settle();busy(true);assert.equal(title.textContent,'Atualizando contratações');
  await waiting[1].finish();await refresh;busy(false);
  const second=ui.request({page:2});await settle();busy(true);assert.equal(title.textContent,'Carregando página 2');
  await waiting[2].finish();const result=await second;assert.equal(result.data.length,64);busy(false);
  const failure=ui.request({page:1}).catch(error=>error);await settle();busy(true);
  waiting[3].fail();assert.equal((await failure).code,'PNCP_UNAVAILABLE');busy(false);
  const cancelled=ui.request({page:2}).catch(error=>error);await settle();busy(true);
  await ui.nodes.get('cancel-button').fire('click');assert.equal((await cancelled).name,'AbortError');busy(false);
});

test('TABLE-LOADER-02: resposta antiga não oculta o loader da consulta mais recente',async()=>{
  const source=service([document(1)]),waiting=[];
  const ui=await interfaceFixture({deferTableBuilt:true,queryHandler:input=>new Promise(resolve=>{
    // Simula uma fonte que entrega a resposta mesmo depois do cancelamento.
    waiting.push(async()=>resolve(Response.json(await source.service.execute(input))));
  })});
  const first=ui.request({page:1}).catch(error=>error);await settle();
  const latest=ui.request({page:1});await settle();
  await waiting[0]();assert.equal((await first).name,'AbortError');
  assert.equal(ui.nodes.get('table-loader').hidden,false);assert.equal(ui.nodes.get('results-table').inert,true);
  assert.equal(ui.nodes.get('search-button').hidden,true);assert.equal(ui.nodes.get('cancel-button').hidden,false);
  await waiting[1]();await latest;
  assert.equal(ui.nodes.get('table-loader').hidden,true);assert.equal(ui.nodes.get('results-table').inert,false);
  assert.equal(ui.nodes.get('search-button').hidden,false);assert.equal(ui.nodes.get('cancel-button').hidden,true);
});

test('FILTERS-UI-01: aplicar texto, período e status envia apenas critérios nativos',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  assert.equal(ui.requests.length,1);ui.nodes.get('draft-search').value='Oracle';
  ui.nodes.get('draft-publication-start').value='2026-09-01';await ui.nodes.get('draft-publication-start').fire('input');
  ui.nodes.get('draft-publication-end').value='2026-09-30';await ui.nodes.get('draft-publication-end').fire('input');
  ui.nodes.get('draft-status').value='recebendo_proposta';await ui.nodes.get('apply-filters').fire('click');
  assert.equal(ui.requests.length,2);
  assert.deepEqual(ui.requests[1],{api_version:'2.0',document_type:'edital',q:'Oracle',status:'recebendo_proposta',pncp_filters:{data_publicacao_inicio:'2026-09-01',data_publicacao_fim:'2026-09-30'},order:'-data',page:1,size:100});
  assert.equal(ui.itemRequests.length,0);
});

test('FILTERS-UI-02: cancelar mantém a consulta; limpar remove todos os critérios',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('search').value='firewall';await ui.nodes.get('search-form').fire('submit');
  const before=ui.state();await ui.nodes.get('filters-button').fire('click');
  ui.nodes.get('draft-search').value='texto cancelado';ui.nodes.get('draft-publication-start').value='2026-09-20';await ui.nodes.get('draft-publication-start').fire('input');ui.nodes.get('filters-dialog').close();
  assert.deepEqual(ui.state(),before);assert.equal(ui.requests.length,2);
  await ui.nodes.get('clear-button').fire('click');assert.equal(ui.requests.length,3);
  assert.equal(ui.state().q,'');assert.equal(ui.state().status,'todos');assert.deepEqual(ui.state().pncp_filters,{});
  assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
});

test('FILTERS-UI-03: datas removidas do formulário não permanecem na requisição',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  ui.nodes.get('draft-publication-start').value='2026-09-01';await ui.nodes.get('draft-publication-start').fire('input');
  ui.nodes.get('draft-publication-start').value='';await ui.nodes.get('draft-publication-start').fire('input');
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests[1].pncp_filters,{});
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

test('DETAILS-UI-06: quantidade e valores do PNCP preservam precisão, zero e ausência de informação',async()=>{
  const ui=await interfaceFixture({itemFetcher:url=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/itens/quantidade'))return Promise.resolve(Response.json(4));
    if(path.endsWith('/itens'))return Promise.resolve(new Response(`[
      {"numeroItem":1,"quantidade":1234.56789,"valorUnitarioEstimado":9007199254740993.12345,"valorTotal":111222333444555666.98765},
      {"numeroItem":2,"quantidade":0,"valorUnitarioEstimado":0,"valorTotal":0},
      {"numeroItem":3,"quantidade":null,"valorTotal":null},
      {"numeroItem":4,"quantidade":30.0000,"valorUnitarioEstimado":3296.01,"valorTotal":98880.3}
    ]`,{headers:{'Content-Type':'application/json'}}));
    return demoFetch(url);
  }});
  await ui.openDocument(project(document(1)));
  const values=ui.all.filter(n=>n.className==='item-values');assert.equal(values.length,4);
  assert.deepEqual(values[0].children.map(n=>n.children[0].textContent),['Quantidade','Valor unitário estimado','Valor total estimado']);
  assert.deepEqual(values.map(n=>n.children.map(field=>field.children[1].textContent)),[
    ['1.234,56789','R$ 9.007.199.254.740.993,12345','R$ 111.222.333.444.555.666,98765'],
    ['0','R$ 0,00','R$ 0,00'],
    ['—','—','—'],
    ['30','R$ 3.296,01','R$ 98.880,30'],
  ]);
});

test('FILTERS-UI-04: catálogo completo distingue a compatibilidade com contratos',async()=>{
  const ui=await interfaceFixture(),groups=ui.nodes.get('native-field').children;
  assert.deepEqual(groups.map(g=>g.label),['Contratação','Item','Resultado do item','Fornecedor','Contrato']);
  const contracts=groups.at(-1).children;assert.equal(contracts.length,9);assert(contracts.every(o=>o.disabled && o.textContent.endsWith('somente contratos')));
  const srp=groups[0].children.find(o=>o.value==='srp');assert.equal(srp.disabled,false);assert.equal(srp.textContent,'Sistema de Registro de Preços');
  const country=groups[3].children.find(o=>o.value==='paises_fornecedor');assert.equal(country.disabled,false);
  assert(groups.flatMap(g=>g.children).every(o=>!o.textContent.includes('pendente')));
});

test('FILTERS-UI-05: seleção de Não preserva false na consulta SRP',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  ui.nodes.get('native-field').value='srp';await ui.nodes.get('native-field').fire('change');
  ui.nodes.get('native-value').value='false';await ui.nodes.get('add-native').fire('click');await ui.nodes.get('apply-filters').fire('click');
  assert.deepEqual(ui.requests.at(-1).pncp_filters,{srp:false});assert.equal(ui.nodes.get('result-title').textContent,'32 contratações');
});

test('FILTERS-UI-06: margem singular e catálogo inativo usam controles de seleção',async()=>{
  const ui=await interfaceFixture({config:{PNCP_VALIDATED_FILTERS:'tipos_margens_preferencia,naturezas_juridicas'}});await ui.nodes.get('filters-button').fire('click');
  ui.nodes.get('native-field').value='tipos_margens_preferencia';await ui.nodes.get('native-field').fire('change');
  assert.equal(ui.nodes.get('native-options').multiple,false);assert.equal(ui.nodes.has('native-value'),false);
  ui.nodes.get('native-options').value='2';await ui.nodes.get('add-native').fire('click');assert.equal(ui.draft().pncp_filters.tipos_margens_preferencia,'2');
  ui.nodes.get('native-field').value='naturezas_juridicas';await ui.nodes.get('native-field').fire('change');
  const select=ui.nodes.get('native-options');assert.equal(select.multiple,true);assert.equal(select.children[0].value,'0000');assert.match(select.children[0].textContent,/inativa/);
  assert(ui.domainRequests.at(-1).includes('campo=naturezas_juridicas'));
});

test('FILTERS-UI-07: mudar normativo preserva amparos válidos e remove incompatíveis',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  await ui.setFilter('amparos_legais',['1','19','98']);await ui.setFilter('normativos_base',['1']);
  assert.deepEqual(ui.draft().pncp_filters,{amparos_legais:['1','19'],normativos_base:['1']});
  assert.equal(ui.nodes.get('apply-filters').disabled,false);assert.equal(ui.nodes.get('legal-error').hidden,false);
  const request=new URL(ui.domainRequests.at(-1),'http://localhost');assert.equal(request.searchParams.get('campo'),'amparos_legais');assert.equal(request.searchParams.get('normativos_base'),'1');
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests.at(-1).pncp_filters,{amparos_legais:['1','19'],normativos_base:['1']});assert.equal(ui.nodes.get('result-title').textContent,'32 contratações');
});

test('FILTERS-UI-08: falha de reconciliação bloqueia aplicar e permite repetir o mesmo normativo',async()=>{
  let attempts=0;
  const ui=await interfaceFixture({domainHandler:async(url,options,backend)=>{
    const p=new URL(url,'http://localhost').searchParams;
    if(p.get('campo')==='amparos_legais' && attempts++===0)return Response.json({error:{message:'Indisponível'}},{status:503});
    return Response.json(await backend.domains('edital',p.get('normativos_base')?.split('|'),options.signal,null,p.get('campo')));
  }});await ui.nodes.get('filters-button').fire('click');
  await ui.setFilter('amparos_legais',['19','98']);await ui.setFilter('normativos_base',['1']);
  assert.equal(ui.nodes.get('apply-filters').disabled,true);const before=ui.requests.length;await ui.nodes.get('apply-filters').fire('click');assert.equal(ui.requests.length,before);
  await ui.setFilter('normativos_base',['1']);assert.equal(ui.nodes.get('apply-filters').disabled,false);assert.deepEqual(ui.draft().pncp_filters.amparos_legais,['19']);
});

test('FILTERS-UI-09: resposta tardia de amparos não altera um novo rascunho',async()=>{
  let resolve;
  const ui=await interfaceFixture({domainHandler:async(url,options,backend)=>{
    const p=new URL(url,'http://localhost').searchParams;
    if(p.get('campo')==='amparos_legais' && p.get('normativos_base')==='1')return new Promise(done=>{resolve=done;});
    return Response.json(await backend.domains('edital'));
  }});await ui.nodes.get('filters-button').fire('click');await ui.setFilter('amparos_legais',['19','98']);
  ui.nodes.get('native-field').value='amparos_legais';await ui.nodes.get('native-field').fire('change');
  const pending=ui.setFilter('normativos_base',['1']);await settle();assert.equal(ui.nodes.get('apply-filters').disabled,true);assert.equal(ui.nodes.get('add-native').disabled,true);
  await ui.nodes.get('add-native').fire('click');assert.equal(ui.nodes.get('apply-filters').disabled,true);
  ui.nodes.get('filters-dialog').close();await ui.nodes.get('filters-button').fire('click');
  resolve(Response.json({filters:{amparos_legais:[{id:'19',label:'Amparo'}]}}));await pending;
  assert.deepEqual(ui.draft().pncp_filters,{});assert.equal(ui.nodes.get('apply-filters').disabled,false);
});

test('FILTERS-UI-10: sistemas de origem e modos de disputa usam múltiplos IDs por padrão',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  for(const [name,values]of [['fontes',['3','5']],['modos_disputa',['1','2']]]){
    const option=ui.nodes.get('native-field').children.flatMap(g=>g.children).find(o=>o.value===name);
    assert.equal(option.disabled,false);assert(!option.textContent.includes('pendente'));
    ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');
    const select=ui.nodes.get('native-options');assert.equal(select.multiple,true);
    for(const option of select.children)option.selected=values.includes(option.value);
    await ui.nodes.get('add-native').fire('click');
  }
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests.at(-1).pncp_filters,{fontes:['3','5'],modos_disputa:['1','2']});
  assert.equal(ui.nodes.get('result-title').textContent,'43 contratações');
});

test('FILTERS-UI-11: condições documentais preservam Não ao editar e remover filtros',async()=>{
  const ui=await interfaceFixture(),names=['indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional'];
  await ui.nodes.get('filters-button').fire('click');
  for(const name of names){
    ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');
    assert(ui.nodes.get('native-value-area').children.some(n=>n.textContent?.includes('Não informado não equivale a Não')));
    ui.nodes.get('native-value').value='false';await ui.nodes.get('add-native').fire('click');
    await ui.nodes.get('native-field').fire('change');assert.equal(ui.nodes.get('native-value').value,'false');
  }
  await ui.nodes.get('apply-filters').fire('click');assert(names.every(name=>ui.requests.at(-1).pncp_filters[name]===false));
  assert.equal(ui.nodes.get('result-title').textContent,'16 contratações');
  assert(ui.nodes.get('native-chips').children.every(n=>n.textContent.endsWith(': Não')));
  await ui.nodes.get('filters-button').fire('click');assert.equal(ui.nodes.get('native-value').value,'false');
  for(const name of names)await ui.setFilter(name,undefined);
  await ui.nodes.get('apply-filters').fire('click');assert.deepEqual(ui.requests.at(-1).pncp_filters,{});assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');
});

test('FILTERS-UI-12: domínio indisponível impede adicionar opções de origem',async()=>{
  const ui=await interfaceFixture({domainHandler:async()=>Response.json({error:{message:'Origem indisponível'}},{status:503})});
  await ui.nodes.get('filters-button').fire('click');ui.nodes.get('native-field').value='fontes';await ui.nodes.get('native-field').fire('change');
  assert.equal(ui.nodes.get('add-native').disabled,true);assert.equal(ui.nodes.get('domain-error').hidden,false);
  await ui.nodes.get('add-native').fire('click');assert.deepEqual(ui.draft().pncp_filters,{});
});

test('FILTERS-UI-13: filtros de itens habilitados usam domínios e informam o alcance dos detalhes',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  for(const [name,ids]of [['criterios_julgamento',['7']],['categorias_leilao',['1']],['beneficios',['1']]]){
    ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');
    assert(ui.nodes.get('native-value-area').children.some(n=>n.textContent?.includes('Os detalhes mostram todos os itens')));
    const select=ui.nodes.get('native-options');assert.equal(select.multiple,true);for(const option of select.children)option.selected=ids.includes(option.value);
    await ui.nodes.get('add-native').fire('click');
  }
  for(const name of ['possui_emenda_parlamentar','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional']){
    ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');ui.nodes.get('native-value').value='true';await ui.nodes.get('add-native').fire('click');
  }
  await ui.nodes.get('apply-filters').fire('click');const filters=ui.requests.at(-1).pncp_filters;
  assert.deepEqual(filters.criterios_julgamento,['7']);assert.deepEqual(filters.categorias_leilao,['1']);assert.deepEqual(filters.beneficios,['1']);
  assert.equal(filters.possui_emenda_parlamentar,true);assert.equal(ui.nodes.get('result-title').textContent,'6 contratações');
});

test('FILTERS-UI-14: Não é preservado ao editar condições de itens e emenda',async()=>{
  const ui=await interfaceFixture(),names=['possui_emenda_parlamentar','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'];
  await ui.nodes.get('filters-button').fire('click');
  for(const name of names){
    ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');ui.nodes.get('native-value').value='false';await ui.nodes.get('add-native').fire('click');
  }
  await ui.nodes.get('apply-filters').fire('click');assert(names.every(name=>ui.requests.at(-1).pncp_filters[name]===false));assert.equal(ui.nodes.get('result-title').textContent,'16 contratações');
  await ui.nodes.get('filters-button').fire('click');
  for(const name of names){ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');assert.equal(ui.nodes.get('native-value').value,'false');}
});

test('FILTERS-UI-15: Não é preservado nos cinco booleanos restantes',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  const names=['permite_adesao','indicador_subcontratacao','indicador_aplicacao_margem_preferencia','indicador_aplicacao_beneficio_me_epp','indicador_aplicacao_criterio_desempate'];
  for(const name of names){ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');ui.nodes.get('native-value').value='false';await ui.nodes.get('add-native').fire('click');}
  await ui.nodes.get('apply-filters').fire('click');assert(names.every(name=>ui.requests.at(-1).pncp_filters[name]===false));assert.equal(ui.nodes.get('result-title').textContent,'16 contratações');
  await ui.nodes.get('filters-button').fire('click');for(const name of names){ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');assert.equal(ui.nodes.get('native-value').value,'false');}
});

test('FILTERS-UI-16: países, reserva, inteiro zero, percentual e data são enviados nos formatos exigidos',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');
  for(const [name,value]of [['paises_fornecedor','BRA'],['reservas_remanescentes','2']]){
    ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');for(const option of ui.nodes.get('native-options').children)option.selected=option.value===value;await ui.nodes.get('add-native').fire('click');
  }
  for(const [name,value]of [['ordem_classificacao_min','0'],['resultado_percentual_desconto_min','0.00'],['data_homologacao_inicio','2026-09-01']]){
    ui.nodes.get('native-field').value=name;await ui.nodes.get('native-field').fire('change');ui.nodes.get('native-value').value=value;await ui.nodes.get('add-native').fire('click');
  }
  await ui.nodes.get('apply-filters').fire('click');const filters=ui.requests.at(-1).pncp_filters;assert.deepEqual(filters.paises_fornecedor,['BRA']);assert.deepEqual(filters.reservas_remanescentes,['2']);assert.equal(filters.ordem_classificacao_min,0);assert.equal(filters.resultado_percentual_desconto_min,'0.00');assert.equal(filters.data_homologacao_inicio,'2026-09-01');
});

test('CONTRACTS-UI-01: trocar o tipo reinicia critérios, colunas e status e permite consultar e exportar contratos',async()=>{
  const ui=await interfaceFixture();await ui.nodes.get('filters-button').fire('click');await ui.setFilter('srp',true);await ui.nodes.get('apply-filters').fire('click');
  ui.nodes.get('document-type').value='contrato';await ui.nodes.get('document-type').fire('change');
  assert.equal(ui.state().document_type,'contrato');assert.deepEqual(ui.state().pncp_filters,{});assert.equal(ui.nodes.get('result-title').textContent,'32 contratos');assert(ui.tableColumns().some(c=>c.field==='valor_global'));assert(!ui.tableColumns().some(c=>c.field==='valor_total_estimado'));
  assert.deepEqual(ui.nodes.get('draft-status').children.map(o=>o.value),['todos','vigente','nao_vigente']);
  const fields=ui.nodes.get('native-field').children.flatMap(g=>g.children);assert.equal(fields.find(o=>o.value==='tipos_contrato').disabled,false);assert.equal(fields.find(o=>o.value==='item_quantidade_min').disabled,true);
  await ui.nodes.get('filters-button').fire('click');ui.nodes.get('native-field').value='tipos_contrato';await ui.nodes.get('native-field').fire('change');assert(ui.domainRequests.at(-1).includes('tipos_documento=contrato'));
  for(const option of ui.nodes.get('native-options').children)option.selected=option.value==='1';await ui.nodes.get('add-native').fire('click');
  ui.nodes.get('native-field').value='possui_nfe';await ui.nodes.get('native-field').fire('change');ui.nodes.get('native-value').value='true';await ui.nodes.get('add-native').fire('click');await ui.nodes.get('apply-filters').fire('click');assert.equal(ui.nodes.get('result-title').textContent,'8 contratos');
  await ui.nodes.get('export-button').fire('click');assert.equal(ui.exportRequests.at(-1).query.document_type,'contrato');assert.deepEqual(ui.exportRequests.at(-1).query.pncp_filters,{tipos_contrato:['1'],possui_nfe:true});
  await ui.nodes.get('clear-button').fire('click');assert.equal(ui.state().document_type,'contrato');assert.equal(ui.nodes.get('result-title').textContent,'32 contratos');
  ui.nodes.get('document-type').value='edital';await ui.nodes.get('document-type').fire('change');assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');assert(ui.tableColumns().some(c=>c.field==='valor_total_estimado'));
});

test('CONTRACTS-UI-02: detalhes de contratos exibem os campos próprios sem buscar itens com o sequencial do contrato',async()=>{
  const ui=await interfaceFixture();ui.nodes.get('document-type').value='contrato';await ui.nodes.get('document-type').fire('change');await ui.openDocument(project(demoContracts[0]));
  assert.equal(ui.itemRequests.length,0);assert(!ui.all.some(n=>n.className==='items-section'));
  const values=ui.nodes.get('details-content').children.find(n=>n.tagName==='dl').children.map(wrap=>wrap.children[1].textContent);assert(values.includes('R$ 10.000,50'));assert(values.includes('01234567000189'));
});

test('CONTRACTS-UI-03: resposta de contrato atrasada não substitui a pesquisa após voltar a edital',async()=>{
  let finishContract;const ui=await interfaceFixture({queryHandler:async(input,options,backend)=>input.document_type==='contrato'?new Promise(resolve=>{finishContract=async()=>resolve(Response.json(await backend.execute(input)));}):Response.json(await backend.execute(input))});
  const selector=ui.nodes.get('document-type');selector.value='contrato';await selector.listeners.change[0]();await settle();assert(finishContract);
  selector.value='edital';await selector.listeners.change[0]();await settle();await finishContract();await settle();
  assert.equal(ui.state().document_type,'edital');assert.equal(ui.nodes.get('result-title').textContent,'64 contratações');assert.equal(ui.nodes.get('export-button').disabled,false);
});
