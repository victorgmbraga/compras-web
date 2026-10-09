import { createFilterOptionsCache } from '../src/browser/filter-options-cache.js';
import { readQueryUrl, writeQueryUrl } from '../src/browser/query-url.js';

export function createApplicationUI(service,{document=globalThis.document,window=globalThis.window,Tabulator=globalThis.Tabulator,optionsCacheSettings={}}={}) {
const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
const clone = value => structuredClone(value);
const documentName=(type=state.query.document_type)=>state.schema.document_types.find(d=>d.id===type);
const TABLE_PAGE_SIZE = 100;
// Situação da Contratação: PNCP, Manual de Integração, tabela de domínio 7.13.
const purchaseStatusClasses=new Map([
  ['divulgada no pncp','status-cell--divulgada'],
  ['revogada','status-cell--revogada'],
  ['anulada','status-cell--anulada'],
  ['suspensa','status-cell--suspensa'],
]);
// Ícones Lucide de paginação (ISC/MIT): THIRD_PARTY_LICENSES.md.
const paginationIcons={
  first:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m17 18-6-6 6-6"/><path d="M7 6v12"/></svg>',
  prev:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 18-6-6 6-6"/></svg>',
  next:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6"/></svg>',
  last:'<svg class="pagination-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 18 6-6-6-6"/><path d="M17 6v12"/></svg>',
};
const filterHeaderIcon='<svg class="header-filter-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M7 12h10m-7 5h4"/></svg>';
const fmtInt = value => new Intl.NumberFormat('pt-BR').format(value);
const time = value => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(value)) : '—';
const date = value => value ? (/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10).split('-').reverse().join('/') : value) : '—';
function quantity(value) {
  if(value===null || value===undefined)return '—';
  const match=String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if(!match)return String(value);
  const fraction=(match[3] || '').replace(/0+$/,'');
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')}${fraction?','+fraction:''}`;
}
function money(value) {
  if(value===null || value===undefined)return '—';
  const match=String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if(!match)return String(value);
  return `${match[1]}R$ ${match[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${(match[3] || '').padEnd(2,'0')}`;
}
const filterLabel=name=>state.schema.capabilities.find(c=>c.name===name)?.label || name;
const state={schema:null,query:null,lastQuery:null,lastResult:null,table:null,placeholder:null,seq:0,abort:null,status:'idle',draft:null,domains:null,domainAbort:null,domainSeq:0,selected:[],suggestAbort:null,suggestSeq:0,suggestTimer:null,legalAbort:null,legalSeq:0,legalPending:false,legalError:false,detailAbort:null,detailSeq:0,exportAbort:null,exportSeq:0};
let filterOptionsCache;
let urlMode='replace',urlError=null,tableReady=false;
const toolbarButtonIds=['search-button','filters-button','refresh-button','columns-button','export-button'];
function syncQueryUrl(query) {
  const mode=urlMode;urlMode='push';
  if(!window.location?.href || !window.history)return;
  const href=writeQueryUrl(window.location.href,query,state.schema);
  if(href!==window.location.href)window.history[mode==='replace'?'replaceState':'pushState'](null,'',href);
}
function invalidQueryUrl(error) {
  urlError=error;status('error');$('retry-button').hidden=true;$('clear-button').hidden=false;
  notice(`Parâmetros inválidos na URL: ${error.message} Corrija o link ou ajuste os critérios e pesquise novamente.`,'error');
}
function notice(message,kind='') { $('notice').textContent=message;$('notice').className='notice '+kind;$('notice').hidden=!message; }
function hideWindowTooltip() { $('window-warning-tooltip').hidden=true; }
function hideTooltips() {
  hideWindowTooltip();
  for(const id of toolbarButtonIds)$(`${id}-tooltip`).hidden=true;
  $('repository-link-tooltip').hidden=true;
}
function bindTooltip(marker,tooltip) {
  const show=()=>showTooltip(marker,tooltip),hide=()=>{tooltip.hidden=true;};
  marker.addEventListener('mouseenter',show);marker.addEventListener('mouseleave',hide);
  marker.addEventListener('focus',show);marker.addEventListener('blur',hide);
  marker.addEventListener('click',hide);
}
function showTooltip(marker,tooltip) {
  if(marker.hidden || !tooltip.textContent)return;
  hideTooltips();
  tooltip.hidden=false;
  positionTooltip(marker,tooltip);
}
function positionTooltip(marker,tooltip) {
  const anchor=marker.getBoundingClientRect(),box=tooltip.getBoundingClientRect(),gap=8;
  const left=Math.max(gap,Math.min(anchor.left+(anchor.width-box.width)/2,window.innerWidth-box.width-gap));
  const above=anchor.top-box.height-gap;
  const top=above>=gap?above:Math.min(anchor.bottom+gap,window.innerHeight-box.height-gap);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(gap,top)}px`;
}
function showWindowTooltip() {
  if(state.status!=='loading')showTooltip($('window-warning'),$('window-warning-tooltip'));
}
function updateExportButton() {
  const busy=!!state.exportAbort;
  $('export-button').disabled=busy || !['success','empty'].includes(state.status);
  $('export-button').setAttribute('aria-busy',String(busy));
  $('cancel-export-button').hidden=!busy;
  $('export-button-tooltip').textContent=busy?'Consultando e gerando CSV…':'Exportar CSV';
  if(busy)$('export-button-tooltip').hidden=true;
  $('export-button').setAttribute('aria-label',busy?'Gerando CSV':'Exportar CSV');
}
function status(value,query=state.query) {
  state.status=value;
  const busy=value==='loading';
  if(busy)hideTooltips();
  $('table-loader').hidden=!busy;
  $('results-table').setAttribute('aria-busy',String(busy));$('results-table').inert=busy;
  if(busy) {
    const label=documentName(query.document_type).plural;
    $('table-loader-title').textContent=query.page>1?`Carregando página ${fmtInt(query.page)}`:state.lastResult?`Atualizando ${label}`:`Carregando ${label}`;
    $('table-loader-message').textContent='Consultando o PNCP. Aguarde um instante.';
  }
  $('search-button').hidden=busy;$('cancel-button').hidden=!busy;$('retry-button').hidden=value!=='error';
  $('refresh-button').disabled=!state.lastQuery || busy;
  updateExportButton();
  $('search-button').disabled=false;
}
function openDialog(id) { hideTooltips();const dialog=$(id);if(!dialog.open)dialog.showModal(); }
function closeDialog(dialog) { dialog.close(); }
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')hideTooltips();
});
for(const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)closeDialog(dialog);}});
  dialog.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>closeDialog(dialog)));
}
function updateCriteria() {
  const q=state.query;$('order').value=q.order;
  $('document-type').value=q.document_type;
  const count=Object.keys(q.pncp_filters).length+(q.status==='todos'?0:1);
  $('filter-count').hidden=!count;$('filter-count').textContent=String(count);$('clear-button').hidden=!count && !q.q;
  $('native-chips').replaceChildren();
  for(const [key,value]of Object.entries(q.pncp_filters)) {
    const cap=state.schema.capabilities.find(c=>c.name===key),options=state.domains?.filters[cap?.domain] || [];
    const label=Array.isArray(value)?value.map(id=>options.find(o=>o.id===id)?.label || id).join(', '):typeof value==='boolean'?(value?'Sim':'Não'):String(value);
    $('native-chips').append(el('span',`${filterLabel(key)}: ${label}`,'filter-chip'));
  }
}
function colFormatter(column) {
  return cell=>{
    const value=cell.getValue();
    const node=el('span',value===null || value===undefined?'—':column.type==='date'?date(value):column.type==='decimal'?money(value):column.type==='boolean'?(value?'Sim':'Não'):String(value));
    if(column.field==='objeto_compra'){node.className='object-text';node.title=value ?? '';}
    if(column.type==='decimal')node.className='money-cell';
    if(column.field==='situacao_compra_nome_pncp') {
      const label=String(value ?? '').normalize('NFC').trim().replace(/\s+/g,' ');
      node.className=`status-cell ${purchaseStatusClasses.get(label.toLocaleLowerCase('pt-BR')) || 'status-cell--unknown'}`;
      if(!label)node.textContent='—';
      node.title=label || 'Situação não informada';
    }
    return node;
  };
}
function columnMenu(event,column) {
  const definition=state.schema.columns.find(c=>c.field===column.getField());
  const entries=[];
  if(definition.domain || definition.native_range)entries.push({label:'Filtrar por esta coluna',action:()=>openFilters(definition)});
  else entries.push({label:'Filtro não habilitado para este tipo',disabled:true});
  if(definition.native_order) {
    for(const dir of ['asc','desc'])entries.push({label:`Ordenar ${dir==='asc'?'crescente':'decrescente'}`,action:()=>{
      state.query.order=definition.native_order[dir];
      updateCriteria();execute();
    }});
  }
  return entries;
}
function renderResult(result,query) {
  state.lastQuery=clone(query);state.lastResult=result;
  state.placeholder.textContent=result.data.length?'Informe uma pesquisa e consulte os documentos do PNCP.':`Nenhum registro encontrado em ${documentName(query.document_type).label}.`;
  const first=result.data.length?(result.page-1)*result.size+1:0;
  const last=result.data.length?first+result.data.length-1:0;
  $('result-range').textContent=`Exibindo ${fmtInt(first)}-${fmtInt(last)} de `;$('result-range').hidden=false;
  $('result-title').textContent=`${fmtInt(result.total)} ${documentName(query.document_type)[result.total===1?'singular':'plural']}`;
  const source=result.demo?'Demonstração': 'PNCP';
  $('result-meta').textContent=`· ${source} · consulta às ${time(result.finished_at)} · ${(result.elapsed_ms/1000).toFixed(1).replace('.',',')} s · ${result.upstream_requests} chamada(s)`;
  $('result-meta').title=$('result-meta').textContent;
  const windowWarning=result.warnings.find(w=>w.code==='WINDOW_LIMITED');
  $('window-warning').hidden=!windowWarning;
  $('window-warning-tooltip').textContent=windowWarning?.message || '';
  hideWindowTooltip();
  const warnings=result.warnings.filter(w=>w.code!=='WINDOW_LIMITED');
  notice(warnings.map(w=>w.message).join('\n'),warnings.length?'warning':'');
  status(result.data.length?'success':'empty');
}
async function requestTable(url,config,params) {
  if(!state.query)return {data:[],last_page:1,last_row:0};
  const query=clone(state.query);
  query.page=Number(params.page || 1);query.size=TABLE_PAGE_SIZE;
  state.query.page=query.page;urlError=null;
  state.abort?.abort();state.exportAbort?.abort();state.exportSeq++;state.exportAbort=null;
  const seq=++state.seq;const controller=new AbortController();state.abort=controller;status('loading',query);
  notice('');
  try {
    syncQueryUrl(query);
    const result=await service.call('execute',{query},{signal:controller.signal});
    if(seq!==state.seq)throw new DOMException('Resposta anterior descartada.','AbortError');
    renderResult(result,query);return result;
  }catch(error) {
    if(seq===state.seq) {
      if(error.name==='AbortError'){status('cancelled');notice('Consulta cancelada. Nenhum novo resultado foi aplicado.','warning');}
      else {status('error');notice(`${error.message}${error.code?' ['+error.code+']':''}${state.lastResult?'\nA tabela mantém o resultado anterior, consultado às '+time(state.lastResult.finished_at)+'.':''}`,'error');}
    }
    throw error;
  }finally{if(seq===state.seq)state.abort=null;}
}
function loadPage(page,mode='push') {
  state.query.page=page;urlMode=mode;
  return state.table.setPage(page).catch(()=>{});
}
function execute() {
  state.query.q=$('search').value;state.query.order=$('order').value;
  if(state.query.order==='relevancia' && !state.query.q.trim())state.query.order='-data';
  urlError=null;
  updateCriteria();
  return loadPage(1);
}
function defaultQuery(type=state.query?.document_type || 'edital') {return {api_version:'2.0',document_type:type,q:'',status:'todos',pncp_filters:{},order:'-data',page:1,size:TABLE_PAGE_SIZE};}
function renderFilterOptions() {
  const select=$('native-field'),current=select.value;select.replaceChildren();
  for(const groupName of ['Contratação','Item','Resultado do item','Fornecedor','Contrato']) {
    const group=el('optgroup');group.label=groupName==='Contrato' && state.query.document_type==='ata'?'Ata/Contrato':groupName==='Contratação' && state.query.document_type!=='edital'?'Documento':groupName;
    for(const cap of state.schema.capabilities.filter(c=>!c.reserved && c.group===groupName)) {
      const compatible=cap.documents.includes(state.query.document_type);
      const option=el('option',`${cap.label || cap.name}${compatible?'':` · somente ${state.schema.document_types.filter(d=>d.enabled && cap.documents.includes(d.id)).map(d=>d.plural).join(' e ')}`}`);
      option.value=cap.name;option.disabled=!compatible;option.title=cap.description;group.append(option);
    }
    if(group.children.length)select.append(group);
  }
  select.value=state.schema.capabilities.some(c=>c.name===current && c.documents.includes(state.query.document_type))?current:'ufs';
  const statuses=state.schema.statuses_by_document[state.query.document_type],statusNames={todos:'Todos',recebendo_proposta:'Recebendo propostas',propostas_encerradas:'Propostas encerradas',vigente:'Vigentes',nao_vigente:'Não vigentes'};
  $('draft-status').replaceChildren();for(const value of statuses){const option=el('option',statusNames[value] || value);option.value=value;$('draft-status').append(option);}
}
function tableColumnDefinitions() {
  const columns=state.schema.columns;
  return [columns.find(c=>c.field==='titulo'),...columns.filter(c=>c.field!=='titulo')].map(column=>{
    const definition={title:column.title,field:column.field,width:column.width || 180,minWidth:85,visible:!!column.visible,formatter:colFormatter(column),variableHeight:column.field==='objeto_compra',headerSort:false,tooltip:false};
    if(column.domain || column.native_range){definition.headerMenu=columnMenu;definition.headerMenuIcon=filterHeaderIcon;}
    return definition;
  });
}
function renderColumnChoices() {
  $('column-list').replaceChildren();
  for(const column of state.schema.columns) {
    const label=el('label',undefined,'checkbox-label'),input=el('input');input.type='checkbox';input.checked=!!column.visible;
    input.addEventListener('change',()=>{input.checked?state.table.showColumn(column.field):state.table.hideColumn(column.field);});label.append(input,document.createTextNode(column.title));$('column-list').append(label);
  }
}
function applyQuery(query) {
  const type=query.document_type,typeChanged=type!==state.query.document_type;
  state.abort?.abort();state.exportAbort?.abort();state.detailAbort?.abort();state.domainAbort?.abort();state.suggestAbort?.abort();state.legalAbort?.abort();
  state.seq++;state.detailSeq++;state.domainSeq++;state.suggestSeq++;state.legalSeq++;clearTimeout(state.suggestTimer);
  $('filters-dialog').close();$('details-dialog').close();
  state.query=clone(query);state.domains=null;state.draft=null;urlError=null;
  $('search').value=query.q;
  if(typeChanged) {
    state.lastQuery=null;state.lastResult=null;
    $('result-info').hidden=true;$('result-title').textContent='Resultados';$('window-warning').hidden=true;hideWindowTooltip();
    state.schema.columns=state.schema.columns_by_document[type];state.table.clearData();
    state.table.setColumns(tableColumnDefinitions());renderColumnChoices();
  }
  renderFilterOptions();updateCriteria();
}
function changeDocumentType() {
  const type=$('document-type').value;if(type===state.query.document_type)return;
  applyQuery(defaultQuery(type));return execute();
}
function restoreQueryUrl() {
  if(!tableReady)return;
  try {
    const query=readQueryUrl(window.location.href,state.schema,TABLE_PAGE_SIZE);
    applyQuery(query);return loadPage(query.page,'replace');
  } catch(error) {
    state.abort?.abort();state.exportAbort?.abort();state.seq++;state.exportSeq++;state.exportAbort=null;
    invalidQueryUrl(error);
  }
}
function renderDraftLists() {
  const q=state.draft;
  $('draft-publication-start').value=q.pncp_filters.data_publicacao_inicio || '';
  $('draft-publication-end').value=q.pncp_filters.data_publicacao_fim || '';
  $('native-filter-list').replaceChildren();
  for(const [key,value]of Object.entries(q.pncp_filters)) {
    const row=el('div',undefined,'active-filter');row.append(el('span',`${filterLabel(key)}: ${Array.isArray(value)?value.join(', '):typeof value==='boolean'?(value?'Sim':'Não'):String(value)}`));
    const button=el('button','Remover','text-button');button.addEventListener('click',()=>setDraftFilter(key,undefined));row.append(button);$('native-filter-list').append(row);
  }
}
async function setDraftFilter(name,value) {
  const draft=state.draft,previous=JSON.stringify(draft.pncp_filters[name]);
  if(value===undefined)delete draft.pncp_filters[name];else draft.pncp_filters[name]=value;
  renderDraftLists();
  if(name==='amparos_legais') {
    state.legalAbort?.abort();state.legalSeq++;state.legalPending=false;state.legalError=false;$('apply-filters').disabled=false;$('legal-error').hidden=true;
    return;
  }
  if(name!=='normativos_base' || (previous===JSON.stringify(value) && !state.legalError))return;
  state.legalAbort?.abort();const seq=++state.legalSeq;
  state.legalPending=false;state.legalError=false;$('apply-filters').disabled=false;$('legal-error').hidden=true;
  if(draft.pncp_filters.amparos_legais?.length) {
    const controller=new AbortController();state.legalAbort=controller;state.legalPending=true;$('apply-filters').disabled=true;
    if($('native-field').value==='amparos_legais')$('add-native').disabled=true;
    $('legal-error').textContent='Conferindo os amparos do normativo selecionado…';$('legal-error').hidden=false;
    try {
      const domains=await getDomains(controller.signal,'amparos_legais');
      if(seq!==state.legalSeq || draft!==state.draft)return;
      const options=domains.filters.amparos_legais;
      if(!Array.isArray(options))throw new Error('O PNCP não forneceu os amparos deste normativo.');
      const ids=new Set(options.map(o=>o.id)),before=draft.pncp_filters.amparos_legais;
      const valid=before.filter(id=>ids.has(id));
      if(valid.length)draft.pncp_filters.amparos_legais=valid;else delete draft.pncp_filters.amparos_legais;
      renderDraftLists();
      $('legal-error').hidden=valid.length===before.length;
      $('legal-error').textContent='Amparos incompatíveis foram removidos. Confira a seleção antes de pesquisar.';
    }catch(error){if(seq===state.legalSeq && error.name!=='AbortError'){
      state.legalError=true;$('legal-error').textContent='Não foi possível conferir os amparos. Remova o filtro de amparo ou selecione novamente o normativo para tentar outra vez.';$('legal-error').hidden=false;
    }}finally{if(seq===state.legalSeq){state.legalPending=false;$('apply-filters').disabled=state.legalError;}}
  }
  if(seq===state.legalSeq && $('native-field').value==='amparos_legais')await renderNativeValue();
}
async function openFilters(column=null) {
  state.legalAbort?.abort();state.legalSeq++;state.legalPending=false;state.legalError=false;$('apply-filters').disabled=false;
  $('legal-error').hidden=true;
  state.draft=clone(state.query);state.draft.q=$('search').value;
  $('draft-search').value=state.draft.q;$('draft-status').value=state.draft.status;
  $('domain-error').hidden=true;renderDraftLists();openDialog('filters-dialog');
  if(column?.domain){$('native-field').value=column.domain;}
  else if(column?.native_range){$('native-field').value=column.native_range[0];}
  await renderNativeValue();
}
async function getDomains(signal,field=$('native-field').value) {
  return filterOptionsCache.get({type:state.draft?.document_type || state.query.document_type,normatives:state.draft?.pncp_filters.normativos_base,field:field || null},{signal});
}
async function renderNativeValue() {
  state.domainAbort?.abort();state.suggestAbort?.abort();clearTimeout(state.suggestTimer);
  const seq=++state.domainSeq;state.suggestSeq++;state.selected=[];
  const cap=state.schema.capabilities.find(c=>c.name===$('native-field').value),area=$('native-value-area');area.replaceChildren();$('domain-error').hidden=true;$('add-native').disabled=false;
  if(!cap)return;
  const help=el('p',`${cap.group} · ${cap.description}`,'panel-note');area.append(help);
  if(['Item','Resultado do item','Fornecedor'].includes(cap.group) && state.query.document_type==='edital')area.append(el('p','Este filtro seleciona contratações. Os detalhes mostram todos os itens, inclusive os que não correspondem ao filtro. Condições diferentes podem corresponder a itens ou resultados diferentes.','panel-note'));
  if(cap.state!=='enabled' || !cap.documents.includes(state.query.document_type)){$('add-native').disabled=true;area.append(el('p','Filtro disponível em outro tipo de documento. Altere o tipo no cabeçalho.','panel-note'));return;}
  if(cap.type==='list' || cap.type==='enum') {
    $('add-native').disabled=true;
    const controller=new AbortController();state.domainAbort=controller;
    const label=el('label','Carregando opções do PNCP…');area.append(label);
    try {
      const domains=await getDomains(controller.signal,cap.name);if(seq!==state.domainSeq)return;state.domains=domains;
      const warning=domains.warnings?.find(w=>w.domain===cap.domain);
      if(warning){$('domain-error').textContent=warning.message;$('domain-error').hidden=false;}
      label.textContent=cap.cardinality==='single'?'Selecione uma opção':'Selecione uma ou mais opções';
      const large=domains.partial_domains?.some(name=>name===cap.name || name===cap.domain),options=domains.filters[cap.domain] || [];
      if(large) {
        label.textContent='Pesquisar opções (mínimo de 3 caracteres)';
        const input=el('input');input.id='native-suggest';input.placeholder='Digite o nome para buscar no PNCP';input.autocomplete='off';label.append(input);
        const selected=el('div',undefined,'selected-options');selected.id='selected-native';area.append(selected);
        const suggestions=el('div',undefined,'suggestions');suggestions.id='native-suggestions';suggestions.setAttribute('aria-live','polite');area.append(suggestions);
        showSuggestions(options.slice(0,20));
        state.selected=(state.draft.pncp_filters[cap.name] || []).map(id=>options.find(o=>o.id===id) || {id,label:id});renderSelectedOptions();
        input.addEventListener('input',()=>{
          clearTimeout(state.suggestTimer);state.suggestAbort?.abort();const token=++state.suggestSeq;
          $('domain-error').hidden=true;
          if(input.value.trim().length<3){showSuggestions(options.slice(0,20));return;}
          suggestions.replaceChildren(el('p','Consultando opções do PNCP…','panel-note'));
          state.suggestTimer=setTimeout(async()=>{
            const controller=new AbortController();state.suggestAbort=controller;
            try{const result=await service.call('suggest',{type:state.draft.document_type,field:cap.name,q:input.value,size:20},{signal:controller.signal});if(seq===state.domainSeq && token===state.suggestSeq)showSuggestions(result.items);}
            catch(error){if(error.name!=='AbortError' && seq===state.domainSeq && token===state.suggestSeq){suggestions.replaceChildren(el('p','Sugestões indisponíveis. Tente novamente.','panel-note'));$('domain-error').textContent=error.message;$('domain-error').hidden=false;}}
          },450);
        });
      } else {
        if(!options.length)throw new Error('O PNCP não forneceu opções para este domínio.');
        const select=el('select');select.multiple=cap.cardinality==='multiple';select.id='native-options';select.setAttribute('aria-label','Opções do filtro PNCP');
        const current=state.draft.pncp_filters[cap.name];
        for(const option of options){const opt=el('option',option.label+(option.active===false?' (inativa)':''));opt.value=option.id;opt.selected=Array.isArray(current)?current.includes(option.id):current===option.id;select.append(opt);}label.append(select);
      }
      $('add-native').disabled=state.legalPending && cap.name==='amparos_legais';
    }catch(error){if(seq===state.domainSeq && error.name!=='AbortError'){label.textContent='Opções indisponíveis.';$('domain-error').textContent=error.message;$('domain-error').hidden=false;}}
  } else {
    const label=el('label','Valor');let input;
    if(cap.type==='boolean'){input=el('select');for(const [value,label]of [['true','Sim'],['false','Não']]){const o=el('option',label);o.value=value;input.append(o);}}
    else {input=el('input');input.type=cap.type==='date'?'date':cap.type==='integer'?'number':'text';if(cap.type==='decimal')input.inputMode='decimal';if(cap.input_hint)input.placeholder=cap.input_hint;if(cap.name==='codigo_ibge'){input.inputMode='numeric';input.maxLength=7;}if(cap.type==='integer'){input.min='0';input.step='1';}}
    input.id='native-value';label.append(input);area.append(label);
    const current=state.draft.pncp_filters[cap.name];
    if(current!==undefined)input.value=String(current);
    if(cap.type==='boolean' && cap.input_hint)area.append(el('p',cap.input_hint,'panel-note'));
  }
}
function showSuggestions(options) {
  const list=$('native-suggestions');if(!list)return;list.replaceChildren();
  if(!options.length)list.append(el('p','Nenhuma opção encontrada.','panel-note'));
  for(const option of options){const button=el('button',option.label,'suggestion');button.type='button';button.addEventListener('click',()=>{if(!state.selected.some(o=>o.id===option.id))state.selected.push(option);renderSelectedOptions();});list.append(button);}
}
function renderSelectedOptions() {
  const area=$('selected-native');area.replaceChildren();
  for(const option of state.selected){const button=el('button',option.label+' ×','selected-option');button.type='button';button.addEventListener('click',()=>{state.selected=state.selected.filter(o=>o.id!==option.id);renderSelectedOptions();});area.append(button);}
}
async function addNative() {
  const cap=state.schema.capabilities.find(c=>c.name===$('native-field').value);let value;
  if(!cap || cap.state!=='enabled' || !cap.documents.includes(state.draft.document_type) || $('add-native').disabled)return;
  if(state.legalPending && cap.name==='amparos_legais')return;
  if(cap.type==='list'){value=$('native-options')?[...$('native-options').selectedOptions].map(o=>o.value):state.selected.map(o=>o.id);if(!value.length)return;}
  else if(cap.type==='enum'){value=$('native-options').value;if(!value)return;}
  else {value=$('native-value').value;if(value==='')return;if(cap.type==='boolean')value=value==='true';if(cap.type==='integer')value=Number(value);}
  await setDraftFilter(cap.name,value);
}
function safeAnchor(label,value) {
  try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol) || url.username || url.password)return null;const link=el('a',label);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';return link;}catch{return null;}
}
function detailScheduler() {
  let active=0;const waiting=[];
  function pump() {
    while(active<2 && waiting.length) {
      const job=waiting.shift();job.cleanup();
      if(job.signal.aborted){job.reject(job.signal.reason);continue;}
      active++;
      Promise.resolve().then(()=>{job.signal.throwIfAborted();return job.task();}).then(job.resolve,job.reject).finally(()=>{active--;pump();});
    }
  }
  return (task,signal)=>new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return;}
    const job={task,signal,resolve,reject,cleanup:()=>signal.removeEventListener('abort',abort)};
    const abort=()=>{const index=waiting.indexOf(job);if(index>=0){waiting.splice(index,1);job.cleanup();reject(signal.reason);}};
    signal.addEventListener('abort',abort,{once:true});waiting.push(job);pump();
  });
}
function detailIdentity(doc) {
  const d=doc._document || (doc.tipo_documento==='edital' && doc._purchase?{type:'edital',...doc._purchase}:null);
  if(!d)return null;
  return d;
}
function appendFields(container,fields,className='related-values') {
  const values=el('dl',undefined,className);
  for(const field of fields){
    const wrap=el('div'),value=el('dd');
    const text=field.value==null?'—':field.type==='decimal'?money(field.value):field.type==='date'?date(field.value):field.type==='datetime'?time(field.value):field.type==='boolean'?(field.value?'Sim':'Não'):String(field.value);
    const link=field.url?safeAnchor(text,field.url):null;
    if(link)value.append(link);else value.textContent=text;
    wrap.append(el('dt',field.title),value);values.append(wrap);
  }
  container.append(values);return values;
}
function relatedSection(resource,title,doc,token,signal,schedule,updateCount) {
  const section=el('section',undefined,'related-section');section.dataset.resource=resource;
  const heading=el('h3',title,'detail-panel-title'),toolbar=el('div',undefined,'items-toolbar'),retry=el('button','Tentar novamente','button small'),status=el('p','Preparando consulta…','items-status'),list=el('div',undefined,'related-list');
  retry.hidden=true;toolbar.append(retry);
  const pager=el('div',undefined,'item-pager'),previous=el('button','Anterior','button small'),label=el('span','Página 1'),next=el('button','Próxima','button small');pager.hidden=true;pager.append(previous,label,next);
  previous.setAttribute('aria-label',`Página anterior de ${title}`);next.setAttribute('aria-label',`Próxima página de ${title}`);retry.setAttribute('aria-label',`Consultar ${title} novamente`);
  status.setAttribute('role','status');section.append(heading,toolbar,status,list,pager);
  let loaded=false,page=1,hasMore=false,untilEmpty=false,controller=null,seq=0;
  const showFields=(card,fields)=>{const values=el('dl',undefined,'related-values');for(const [name,value]of fields){const field=el('div');field.append(el('dt',name),el('dd',value ?? '—'));values.append(field);}card.append(values);};
  async function load(target) {
    controller?.abort();controller=new AbortController();const request=++seq;
    const current=()=>token===state.detailSeq && request===seq && !signal.aborted;
    retry.hidden=true;previous.disabled=true;next.disabled=true;section.setAttribute('aria-busy','true');status.textContent='Preparando consulta…';
    if(!loaded)updateCount(null,'loading');
    try {
      const requestSignal=AbortSignal.any([signal,controller.signal]);
      const result=await schedule(async()=>{status.textContent='Consultando o PNCP…';return service.call('documentRelated',{document:detailIdentity(doc),resource,page:target,size:10,...(untilEmpty?{pagination_mode:'until_empty'}:{})},{signal:requestSignal});},requestSignal);
      if(!current())return;loaded=true;page=result.page;hasMore=result.has_more;untilEmpty ||= result.pagination_mode==='until_empty';list.replaceChildren();
      for(const record of result.data) {
        const card=el('article',undefined,'related-card');
        if(record.fields) {
          card.append(el('h4',`${{partesenvolvidas:'Parte envolvida',termos:'Termo',empenhos:'Empenho',instrumentocobranca:'Instrumento de cobrança'}[resource]}`));
          appendFields(card,record.fields);
          if(record.sequencial && ['termos','empenhos','instrumentocobranca'].includes(resource)){
            const button=el('button',resource==='termos'?'Arquivos do termo':'Ver detalhes','button small'),extra=el('div',undefined,'related-extra');extra.hidden=true;
            button.setAttribute('aria-expanded','false');card.append(button,extra);let fetched=false,busy=false,failed=false;
            button.addEventListener('click',async()=>{
              if(busy)return;extra.hidden=failed?false:!extra.hidden;failed=false;button.setAttribute('aria-expanded',String(!extra.hidden));
              if(extra.hidden || fetched)return;
              busy=true;button.disabled=true;extra.replaceChildren(el('p','Consultando o PNCP…','panel-note'));
              try {
                const data=await schedule(async()=>{return service.call('contractChild',{document:detailIdentity(doc),resource,sequence:record.sequencial},{signal:requestSignal});},requestSignal);
                if(!current())return;extra.replaceChildren();
                if(data.fields)appendFields(extra,data.fields);
                if(data.files){for(const file of data.files){const fileCard=el('article',undefined,'related-card');fileCard.append(el('h4',file.titulo ?? 'Arquivo sem título'));appendFields(fileCard,[{title:'Tipo',value:file.tipo},{title:'Publicação',type:'datetime',value:file.data_publicacao}]);const link=safeAnchor('Baixar arquivo',file.url);if(link)fileCard.append(link);extra.append(fileCard);}if(!data.files.length)extra.append(el('p','Este termo não possui arquivos.','panel-note'));}
                fetched=true;
              }catch(error){if(current() && error.name!=='AbortError'){extra.replaceChildren(el('p',error.message,'inline-error'));failed=true;button.textContent='Tentar novamente';}}
              finally{busy=false;button.disabled=false;}
            });
          }
        } else if(resource==='arquivos') {
          card.append(el('h4',record.titulo ?? 'Arquivo sem título'));
          showFields(card,[['Tipo',record.tipo],['Inclusão',time(record.data_publicacao)]]);
        } else if(resource==='historico') {
          card.append(el('h4',record.evento ?? 'Evento não informado'));
          showFields(card,[['Nome',record.nome],['Data/Hora do evento',time(record.data_evento)],['Justificativa',record.justificativa]]);
        } else {
          card.append(el('h4',`${resource==='atas'?'Ata':'Contrato/Empenho'} ${record.numero ?? '—'}${record.ano?'/'+record.ano:''}`));
          showFields(card,[['Controle PNCP',record.numero_controle_pncp],...(record.orgao_nome?[['Órgão',record.orgao_nome]]:[]),['Assinatura',date(record.data_assinatura)],['Vigência',`${date(record.vigencia_inicio)} a ${date(record.vigencia_fim)}`],...(resource==='atas'?[['Cancelamento',record.data_cancelamento?time(record.data_cancelamento):'—']]:[['Fornecedor',record.fornecedor_nome],['Valor global',money(record.valor_global)]])]);
        }
        if(!record.fields && resource!=='historico') {const link=safeAnchor(resource==='arquivos'?'Baixar arquivo':'Abrir no PNCP',record.url);if(link)card.append(link);else card.append(el('p','Link não disponível.','panel-note'));}
        list.append(card);
      }
      if(!result.data.length)list.append(el('p',`Nenhum registro em ${title}.`,'panel-note'));
      const unknownTotal=result.total===null;
      heading.textContent=`${title} (${unknownTotal?'?':fmtInt(result.total)})`;
      updateCount(result.total,'loaded');
      const first=result.data.length?(page-1)*result.size+1:0,last=result.data.length?first+result.data.length-1:0;
      const summary=unknownTotal?`${result.data.length?`${fmtInt(result.data.length)} ${result.data.length===1?'registro':'registros'} nesta página`:'Fim do histórico: nenhum registro nesta página'} · Quantidade desconhecida: contagem inconsistente do PNCP` : result.total===0?'0 registros':`Registros ${fmtInt(first)}–${fmtInt(last)} de ${fmtInt(result.total)}`;
      status.textContent=`${summary} · Consulta às ${time(result.queried_at)}.`;
      label.textContent=unknownTotal?`Página ${page}`:`Página ${page} de ${fmtInt(result.total_pages)}`;pager.hidden=!unknownTotal && result.total_pages<=1;previous.disabled=page<=1;next.disabled=!hasMore;
    }catch(error){if(current() && error.name!=='AbortError'){
      if(error.code==='PAGE_OUT_OF_RANGE' && Number.isSafeInteger(error.details?.last_page) && error.details.last_page>=1 && error.details.last_page<target)return load(error.details.last_page);
      status.textContent=error.message;retry.hidden=false;previous.disabled=page<=1;next.disabled=!hasMore;
      if(!loaded)updateCount(null,'error');
    }}finally{if(current())section.setAttribute('aria-busy','false');}
  }
  if(detailIdentity(doc)) {
    retry.addEventListener('click',()=>load(page));previous.addEventListener('click',()=>load(page-1));next.addEventListener('click',()=>load(page+1));
  } else {status.textContent='A fonte não forneceu CNPJ, ano e sequencial originais suficientes para consultar esta listagem.';updateCount(null,'unavailable');}
  return {section,load:()=>detailIdentity(doc)?load(1):Promise.resolve()};
}
async function openDetails(doc) {
  state.detailAbort?.abort();state.detailSeq++;const token=state.detailSeq;
  const detailController=new AbortController();state.detailAbort=detailController;
  const schedule=detailScheduler(),loads=[],tabs=[];
  const content=$('details-content');content.replaceChildren();
  content.append(el('p',doc.objeto_compra ?? 'Objeto não informado.','detail-object'));
  const kind=doc.tipo_documento,names=documentName(kind);
  $('details-kind').textContent=doc.titulo ?? '—';
  $('details-dialog').setAttribute('aria-label',`Detalhes: ${names.singular}`);
  const links=$('details-links');links.replaceChildren();
  for(const [label,url]of [['Abrir no PNCP',doc.url_pncp],['Sistema de origem',doc.link_sistema_origem]]){const link=safeAnchor(label,url);if(link)links.append(link);}
  const nav=el('div',undefined,'detail-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label',`Seções: ${names.singular}`);content.append(nav);
  function activate(index,focus=false) {
    tabs.forEach((tab,i)=>{tab.button.setAttribute('aria-selected',String(i===index));tab.button.tabIndex=i===index?0:-1;tab.panel.hidden=i!==index;});
    if(focus){tabs[index].button.focus();tabs[index].button.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  function addTab(resource,title,panel) {
    const button=el('button',title,'detail-tab'),index=tabs.length;button.type='button';button.id=`detail-tab-${resource}`;button.dataset.resource=resource;
    panel.id=`detail-panel-${resource}`;panel.hidden=true;panel.tabIndex=0;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-selected','false');button.tabIndex=-1;
    button.addEventListener('click',()=>activate(index));
    button.addEventListener('keydown',event=>{
      let target;
      if(event.key==='ArrowRight')target=(index+1)%tabs.length;else if(event.key==='ArrowLeft')target=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')target=0;else if(event.key==='End')target=tabs.length-1;else return;
      event.preventDefault();activate(target,true);
    });
    nav.append(button);content.append(panel);tabs.push({button,panel});
    const update=(count,phase)=>{
      const loading=count===null && phase==='loading';
      button.textContent=loading?title:`${title} (${count===null?phase==='loaded'?'?':'—':fmtInt(count)})`;
      if(loading){const spinner=el('span',undefined,'detail-tab-spinner');spinner.setAttribute('aria-hidden','true');button.append(spinner);}
      button.setAttribute('aria-label',loading?`${title}: carregando`:button.textContent);
      button.setAttribute('aria-busy',String(loading));button.dataset.state=phase;
    };
    update(null,'loading');return update;
  }
  const common=['numero_controle_pncp','orgao_nome','orgao_cnpj','unidade_orgao_nome_unidade','uf','municipio_nome'];
  const fieldNames=[...common,...(kind==='edital'?['modalidade_nome','situacao_compra_nome_pncp','data_publicacao_pncp','data_atualizacao_pncp','valor_total_estimado','valor_total_homologado']:kind==='ata'?['modalidade_nome','data_publicacao_pncp','data_atualizacao_pncp','data_assinatura','data_inicio_vigencia','data_fim_vigencia','cancelado','permite_adesao']:['tipo_contrato_nome','fornecedor_nome','fornecedor_ni','valor_global','data_assinatura','data_inicio_vigencia','data_fim_vigencia','data_publicacao_pncp','data_atualizacao_pncp'])];
  const fields=fieldNames.map(name=>{const column=state.schema.columns_by_document[kind].find(c=>c.field===name);return {title:column.title,type:column.type,value:doc[name]};});
  const detailPanel=el('section',undefined,'detail-information');
  let grid=appendFields(detailPanel,fields,'detail-grid');
  const updateDetails=addTab('detalhes','Detalhes',detailPanel);updateDetails(fields.length,'loaded');
  if(kind!=='edital'){
    const detailStatus=el('p','Preparando consulta dos detalhes…','items-status'),retryDetails=el('button','Tentar novamente','button small');retryDetails.hidden=true;detailStatus.setAttribute('role','status');detailPanel.append(detailStatus,retryDetails);
    async function loadDetails(){
      retryDetails.hidden=true;detailPanel.setAttribute('aria-busy','true');
      try {
        const data=await schedule(async()=>{detailStatus.textContent='Consultando detalhes no PNCP…';return service.call('documentDetails',{document:detailIdentity(doc)},{signal:detailController.signal});},detailController.signal);
        if(token!==state.detailSeq)return;
        const holder=el('div');grid=appendFields(holder,data.fields,'detail-grid');detailPanel.replaceChildren(grid,detailStatus,retryDetails);
        updateDetails(data.fields.length,'loaded');if(data.objeto)content.children[0].textContent=data.objeto;
        if(data.link_sistema_origem && !doc.link_sistema_origem){const link=safeAnchor('Sistema de origem',data.link_sistema_origem);if(link)links.append(link);}
        detailStatus.textContent=`Consulta às ${time(data.queried_at)}.`;
      }catch(error){if(token===state.detailSeq && error.name!=='AbortError'){detailStatus.textContent=`${error.message} Os dados disponíveis na busca permanecem visíveis.`;retryDetails.hidden=false;updateDetails(null,'error');}}
      finally{if(token===state.detailSeq)detailPanel.setAttribute('aria-busy','false');}
    }
    if(detailIdentity(doc)){retryDetails.addEventListener('click',loadDetails);loads.push(loadDetails);updateDetails(null,'loading');}
    else {detailStatus.textContent='A fonte não forneceu os identificadores originais para consultar os detalhes completos.';updateDetails(null,'unavailable');}
  }
  if(kind==='edital'){
  const section=el('section',undefined,'items-section'),toolbar=el('div',undefined,'items-toolbar'),retry=el('button','Tentar consultar itens','button small'),itemsTitle=el('h3','Itens da contratação');retry.hidden=true;toolbar.append(itemsTitle,retry);section.append(toolbar);
  const itemStatus=el('p','Preparando consulta de itens…','items-status'),list=el('div'),pager=el('div',undefined,'item-pager'),previous=el('button','Anterior','button small'),pageLabel=el('span','Página 1'),next=el('button','Próxima','button small');pager.hidden=true;pager.append(previous,pageLabel,next);section.append(itemStatus,list,pager);
  itemStatus.setAttribute('role','status');previous.setAttribute('aria-label','Página anterior de Itens');next.setAttribute('aria-label','Próxima página de Itens');
  const updateItems=addTab('itens','Itens',section);
  let page=1,controller=null,hasMore=false,itemsLoaded=false;
  async function itemPage(target) {
    controller?.abort();controller=new AbortController();
    retry.hidden=true;previous.disabled=true;next.disabled=true;itemStatus.textContent='Consultando itens no PNCP…';
    section.setAttribute('aria-busy','true');if(!itemsLoaded)updateItems(null,'loading');
    try {
      const p=doc._purchase,signal=AbortSignal.any([detailController.signal,controller.signal]);
      const result=await schedule(async()=>{return service.call('details',{document:{type:'edital',...p},page:target,size:100},{signal});},signal);
      if(token!==state.detailSeq)return;page=result.page;list.replaceChildren();
      itemsLoaded=true;updateItems(result.total_items,'loaded');
      for(const item of result.data) {
        const card=el('article',undefined,'item-card');card.append(el('h4',`Item ${item.numeroItem ?? '—'}`),el('p',item.descricao ?? 'Descrição não informada.'),el('div',`${item.materialOuServico==='S'?'Serviço':item.materialOuServico==='M'?'Material':'Tipo não informado'} · ${item.situacaoCompraItemNome ?? 'Situação não informada'} · Catálogo: ${item.catalogo?.nome ?? '—'} / ${item.catalogoCodigoItem ?? '—'}`,'item-meta'));
        const values=el('dl',undefined,'item-values');
        for(const [label,value] of [['Quantidade',quantity(item.quantidade)],['Valor unitário estimado',money(item.valorUnitarioEstimado)],['Valor total estimado',money(item.valorTotal)]]) {
          const field=el('div');field.append(el('dt',label),el('dd',value));values.append(field);
        }
        card.append(values);list.append(card);
      }
      if(!result.data.length)list.append(el('p','Esta contratação não possui itens.','panel-note'));
      const first=result.data.length?(page-1)*result.size+1:0,last=result.data.length?first+result.data.length-1:0;
      itemsTitle.textContent=`Itens da contratação (${fmtInt(result.total_items)})`;
      hasMore=result.has_more;itemStatus.textContent=`${result.total_items===0?'0 itens':`Itens ${fmtInt(first)}–${fmtInt(last)} de ${fmtInt(result.total_items)}`} · Consulta às ${time(result.queried_at)}.`;pageLabel.textContent=`Página ${page} de ${result.total_pages}`;pager.hidden=result.total_pages<=1;previous.disabled=page<=1;next.disabled=!hasMore;
    }catch(error){if(token===state.detailSeq && error.name!=='AbortError'){
      if(error.code==='PAGE_OUT_OF_RANGE' && Number.isSafeInteger(error.details?.last_page) && error.details.last_page>=1 && error.details.last_page<target)return itemPage(error.details.last_page);
      itemStatus.textContent=error.message;retry.hidden=false;previous.disabled=page<=1;next.disabled=!hasMore;
      if(!itemsLoaded)updateItems(null,'error');
    }}finally{if(token===state.detailSeq)section.setAttribute('aria-busy','false');}
  }
  if(!doc._purchase){itemStatus.textContent='A fonte não forneceu CNPJ, ano e sequencial originais suficientes para consultar itens.';updateItems(null,'unavailable');}
  else {retry.addEventListener('click',()=>itemPage(page));previous.addEventListener('click',()=>itemPage(page-1));next.addEventListener('click',()=>itemPage(page+1));loads.push(()=>itemPage(1));}
  }
  const sections={edital:[['arquivos','Arquivos'],['atas','Atas de Registro de Preço'],['contratos','Contratos/Empenhos'],['historico','Histórico']],ata:[['partesenvolvidas','Partes envolvidas'],['contratos','Contratos'],['arquivos','Arquivos'],['historico','Histórico']],contrato:[['empenhos','Empenhos'],['instrumentocobranca','Instrumentos de cobrança'],['termos','Termos'],['arquivos','Arquivos'],['historico','Histórico']]};
  for(const [resource,title]of sections[kind]){
    let updateCount=()=>{};
    const related=relatedSection(resource,title,doc,token,detailController.signal,schedule,(...args)=>updateCount(...args));
    updateCount=addTab(resource,title,related.section);if(!detailIdentity(doc))updateCount(null,'unavailable');
    loads.push(related.load);
  }
  activate(0);openDialog('details-dialog');
  await Promise.all(loads.map(load=>load()));
}
async function exportCsv() {
  if(!state.lastQuery || state.exportAbort || !['success','empty'].includes(state.status))return;
  const query=clone(state.lastQuery);
  const seq=++state.exportSeq;const controller=new AbortController();state.exportAbort=controller;
  updateExportButton();notice('Consultando o PNCP e gerando CSV dos últimos critérios concluídos. Os dados podem diferir da tabela.');
  try {
    const result=await service.call('export',{query},{signal:controller.signal,onProgress:progress=>{
      if(seq===state.exportSeq)notice(`Coletando ${fmtInt(progress.rows)} de ${fmtInt(progress.total)} documentos para CSV…`);
    }});
    if(seq!==state.exportSeq || controller.signal.aborted)return;
    const blob=new Blob(result.chunks,{type:result.mime});
    const href=URL.createObjectURL(blob),link=el('a');link.href=href;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
    notice(`${result.metadata.exported_rows} linhas exportadas. Nova coleta de ${time(result.metadata.started_at)} a ${time(result.metadata.finished_at)}.`);
  }catch(error){if(seq===state.exportSeq && error.name!=='AbortError')notice(`Falha ao exportar CSV: ${error.message}${error.code?' ['+error.code+']':''}`,'error');}
  finally{if(seq===state.exportSeq){state.exportAbort=null;updateExportButton();}}
}
async function init() {
  state.schema=await service.call('schema');
  filterOptionsCache=createFilterOptionsCache(service,state.schema,{getStorage:()=>window.localStorage,...optionsCacheSettings});
  state.optionsReady=filterOptionsCache.preload();
  state.query=defaultQuery();
  try {if(window.location?.href)state.query=readQueryUrl(window.location.href,state.schema,TABLE_PAGE_SIZE);}
  catch(error){urlError=error;}
  state.schema.columns=state.schema.columns_by_document[state.query.document_type];
  $('search').value=state.query.q;
  $('source-badge').hidden=!state.schema.demo;
  renderFilterOptions();
  $('native-field').value='ufs';
  state.placeholder=el('div','Informe uma pesquisa e consulte as contratações do PNCP.');
  const resultInfo=$('result-info');
  state.table=new Tabulator('#results-table',{
    height:'100%',layout:'fitDataFill',nestedFieldSeparator:false,movableColumns:true,
    pagination:true,paginationMode:'remote',paginationSize:TABLE_PAGE_SIZE,paginationInitialPage:state.query.page,paginationSizeSelector:false,paginationButtonCount:4,
    paginationCounter:()=>{resultInfo.hidden=false;return resultInfo;},
    footerElement:'<a id="repository-link" class="repository-link" href="https://github.com/victorgmbraga/contratos-web" target="_blank" rel="noopener noreferrer" aria-label="Repositório do Contratos Web no GitHub (abre em nova aba)" aria-describedby="repository-link-tooltip"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg></a>',
    sortMode:'remote',filterMode:'remote',ajaxURL:'pncp-query',ajaxRequestFunc:requestTable,dataLoader:false,data:[],
    placeholder:state.placeholder,
    locale:'pt-br',langs:{'pt-br':{pagination:{page_size:'Linhas',page_title:'Página',first:paginationIcons.first,first_title:'Primeira página',last:paginationIcons.last,last_title:'Última página',prev:paginationIcons.prev,prev_title:'Página anterior',next:paginationIcons.next,next_title:'Próxima página',counter:{showing:'Exibindo',of:'de',rows:'contratações',pages:'páginas'}}}},
    columns:tableColumnDefinitions(),
  });
  state.table.on('rowClick',(event,row)=>openDetails(row.getData()));
  renderColumnChoices();
  $('document-type').addEventListener('change',changeDocumentType);
  $('app-header').addEventListener('focusin',event=>event.target.scrollIntoView({block:'nearest',inline:'nearest'}));
  $('search-form').addEventListener('submit',event=>{event.preventDefault();execute();});
  $('filters-button').addEventListener('click',()=>openFilters());$('columns-button').addEventListener('click',()=>openDialog('columns-dialog'));
  $('refresh-button').addEventListener('click',async()=>{
    if(!state.lastQuery)return;
    const {page}=state.lastQuery;state.query=clone(state.lastQuery);$('search').value=state.query.q;updateCriteria();
    await loadPage(page);
  });
  $('retry-button').addEventListener('click',()=>loadPage(state.query.page));
  $('cancel-button').addEventListener('click',()=>{state.abort?.abort();});
  $('cancel-export-button').addEventListener('click',()=>{state.exportAbort?.abort();notice('Exportação cancelada.');});
  $('order').addEventListener('change',()=>{state.query.order=$('order').value;execute();});
  $('clear-button').addEventListener('click',()=>{state.query=defaultQuery();$('search').value='';updateCriteria();execute();});
  $('native-field').addEventListener('change',renderNativeValue);$('add-native').addEventListener('click',addNative);
  for(const [id,field]of [['draft-publication-start','data_publicacao_inicio'],['draft-publication-end','data_publicacao_fim']])$(id).addEventListener('input',()=>{const value=$(id).value;if(value)state.draft.pncp_filters[field]=value;else delete state.draft.pncp_filters[field];renderDraftLists();});
  $('apply-filters').addEventListener('click',()=>{if(state.legalPending || state.legalError)return;state.draft.q=$('draft-search').value;state.draft.status=$('draft-status').value;state.query=clone(state.draft);$('search').value=state.query.q;$('filters-dialog').close();updateCriteria();execute();});
  $('filters-dialog').addEventListener('close',()=>{state.domainAbort?.abort();state.suggestAbort?.abort();state.legalAbort?.abort();clearTimeout(state.suggestTimer);state.domainSeq++;state.suggestSeq++;state.legalSeq++;});
  $('details-dialog').addEventListener('close',()=>{state.detailAbort?.abort();state.detailSeq++;});
  $('export-button').addEventListener('click',exportCsv);
  for(const id of toolbarButtonIds)bindTooltip($(id),$(`${id}-tooltip`));
  $('window-warning').addEventListener('mouseenter',showWindowTooltip);
  $('window-warning').addEventListener('mouseleave',hideWindowTooltip);
  $('window-warning').addEventListener('focus',showWindowTooltip);
  $('window-warning').addEventListener('blur',hideWindowTooltip);
  window.addEventListener('resize',hideTooltips);
  window.addEventListener('popstate',restoreQueryUrl);
  window.addEventListener('pagehide',event=>{if(!event.persisted)filterOptionsCache.close();});
  document.addEventListener('scroll',event=>{
    const button=document.activeElement;
    // Ao focar uma ação em telas menores, o cabeçalho rola para torná-la visível.
    if(event.target===$('app-header') && toolbarButtonIds.includes(button?.id)) {
      const tooltip=$(`${button.id}-tooltip`),anchor=button.getBoundingClientRect();
      if(!tooltip.hidden && anchor.left>=0 && anchor.right<=window.innerWidth) {
        positionTooltip(button,tooltip);return;
      }
    }
    hideTooltips();
  },true);
  updateCriteria();status('idle');
  state.table.on('tableBuilt',()=>{
    const repositoryLink=document.querySelector('.tabulator-footer .repository-link');
    if(repositoryLink) {
      repositoryLink.parentElement.append(repositoryLink);
      bindTooltip(repositoryLink,$('repository-link-tooltip'));
    }
    tableReady=true;if(window.location?.href)return restoreQueryUrl();if(urlError)invalidQueryUrl(urlError);else return loadPage(state.query.page,'replace');
  });
}
const ready=init().catch(error=>{$('startup-error').hidden=false;$('startup-error').textContent=`Não foi possível iniciar a interface: ${error.message}. Recarregue a página.`;notice('Falha ao carregar o esquema da aplicação.','error');});

return {ready,state,requestTable,setDraftFilter};
}
