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
  const nodes=new Map(),all=[],pending=[],downloads=[];
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.value='';this.hidden=false;this.open=false;this.classList={add(){},toggle(){},contains(){return false;}};all.push(this);}
    set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
    append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
    click(){if(this.tagName==='a')downloads.push({href:this.href,filename:this.download});}remove(){}
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    async fire(name){for(const fn of this.listeners[name] || [])await fn({target:this,preventDefault(){}});await settle();await Promise.allSettled(pending);await settle();}
    setAttribute(name,value){(this.attributes??={})[name]=String(value);}getAttribute(name){return this.attributes?.[name] ?? null;}querySelectorAll(){return [];}showModal(){this.open=true;}
    close(){this.open=false;for(const fn of this.listeners.close || [])fn();}
  }
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.id=match[2];node.hidden=match[0].includes(' hidden');}
  const dom={body:new Element('body'),getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),createTextNode:text=>text,addEventListener(){},querySelectorAll:selector=>selector==='dialog'?all.filter(n=>n.tagName==='dialog'):[],querySelector(){return null;}};
  const cfg=config({DEMO_MODE:true});
  const backend=new QueryService(cfg,new PncpClient(cfg,{fetcher:options.itemFetcher || demoFetch})),requests=[],itemRequests=[],exportRequests=[];
  const queryHandler=options.queryHandler,exportHandler=options.exportHandler;
  let detailFailures=options.detailFailures || 0;
  const fetcher=async(url,options={})=>{
    try{
      if(url==='/api/schema')return Response.json(schema(cfg));
      if(url.startsWith('/api/pncp/filters'))return Response.json(await backend.domains('edital'));
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
    setData(url,params){const task=this.options.ajaxRequestFunc(url,{},params);pending.push(task);return task;}setPage(page){return this.setData('/api/query',{page,size:this.size});}redraw(){}
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
  return {nodes,all,requests,itemRequests,exportRequests,downloads,state,openDocument,tableColumns,request,footer,buildTable};
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
