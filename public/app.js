const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
const clone = value => structuredClone(value);
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
function notice(message,kind='') { $('notice').textContent=message;$('notice').className='notice '+kind;$('notice').hidden=!message; }
function hideWindowTooltip() { $('window-warning-tooltip').hidden=true; }
function showWindowTooltip() {
  const marker=$('window-warning'),tooltip=$('window-warning-tooltip');
  if(marker.hidden || state.status==='loading' || !tooltip.textContent)return;
  tooltip.hidden=false;
  const anchor=marker.getBoundingClientRect(),box=tooltip.getBoundingClientRect(),gap=8;
  const left=Math.max(gap,Math.min(anchor.left+(anchor.width-box.width)/2,window.innerWidth-box.width-gap));
  const above=anchor.top-box.height-gap;
  const top=above>=gap?above:Math.min(anchor.bottom+gap,window.innerHeight-box.height-gap);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(gap,top)}px`;
}
function updateExportButton() {
  const busy=!!state.exportAbort;
  $('export-button').disabled=busy || !['success','empty'].includes(state.status);
  $('export-button').setAttribute('aria-busy',String(busy));
  $('export-button').title=busy?'Consultando e gerando CSV…':'Exportar CSV';
  $('export-button').setAttribute('aria-label',busy?'Gerando CSV':'Exportar CSV');
}
function status(value,query=state.query) {
  state.status=value;
  const busy=value==='loading';
  if(busy)hideWindowTooltip();
  $('table-loader').hidden=!busy;
  $('results-table').setAttribute('aria-busy',String(busy));$('results-table').inert=busy;
  if(busy) {
    $('table-loader-title').textContent=query.page>1?`Carregando página ${fmtInt(query.page)}`:state.lastResult?'Atualizando contratações':'Carregando contratações';
    $('table-loader-message').textContent='Consultando o PNCP. Aguarde um instante.';
  }
  $('search-button').hidden=busy;$('cancel-button').hidden=!busy;$('retry-button').hidden=value!=='error';
  $('refresh-button').disabled=!state.lastQuery || busy;
  updateExportButton();
  $('search-button').disabled=false;
}
function openDialog(id) { const dialog=$(id);if(!dialog.open)dialog.showModal(); }
function closeDialog(dialog) { dialog.close(); }
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')hideWindowTooltip();
});
for(const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)closeDialog(dialog);}});
  dialog.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>closeDialog(dialog)));
}
async function api(url,options={}) {
  const response=await fetch(url,{cache:'no-store',...options});
  if(!response.ok){let payload;try{payload=await response.json();}catch{}const error=new Error(payload?.error?.message || `Erro HTTP ${response.status}.`);error.code=payload?.error?.code;error.details=payload?.error?.details;throw error;}
  return response;
}
function updateCriteria() {
  const q=state.query;$('order').value=q.order;
  const count=Object.keys(q.pncp_filters).length+(q.status==='todos'?0:1);
  $('filter-count').hidden=!count;$('filter-count').textContent=String(count);$('clear-button').hidden=!count && !q.q;
  $('native-chips').replaceChildren();
  for(const [key,value]of Object.entries(q.pncp_filters)) {
    const cap=state.schema.capabilities.find(c=>c.name===key),options=state.domains?.filters[cap?.domain] || [];
    const label=Array.isArray(value)?value.map(id=>options.find(o=>o.id===id)?.label || id).join(', '):String(value);
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
  state.placeholder.textContent=result.data.length?'Informe uma pesquisa e consulte as contratações do PNCP.':'Nenhuma contratação encontrada com estes critérios.';
  const first=result.data.length?(result.page-1)*result.size+1:0;
  const last=result.data.length?first+result.data.length-1:0;
  $('result-range').textContent=`Exibindo ${fmtInt(first)}-${fmtInt(last)} de `;$('result-range').hidden=false;
  $('result-title').textContent=`${fmtInt(result.total)} ${result.total===1?'contratação':'contratações'}`;
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
  state.abort?.abort();state.exportAbort?.abort();state.exportSeq++;state.exportAbort=null;
  const seq=++state.seq;const controller=new AbortController();state.abort=controller;status('loading',query);
  notice('');
  try {
    const response=await api('/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal:controller.signal});
    const result=await response.json();
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
function execute() {
  state.query.q=$('search').value;state.query.order=$('order').value;
  if(state.query.order==='relevancia' && !state.query.q.trim())state.query.order='-data';
  updateCriteria();
  state.table.setData('/api/query',{page:1,size:TABLE_PAGE_SIZE}).catch(()=>{});
}
function defaultQuery() {return {api_version:'2.0',document_type:'edital',q:'',status:'todos',pncp_filters:{},order:'-data',page:1,size:TABLE_PAGE_SIZE};}
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
  const params=new URLSearchParams({tipos_documento:'edital'});
  if(field)params.set('campo',field);
  const normatives=state.draft?.pncp_filters.normativos_base;
  if(normatives?.length)params.set('normativos_base',normatives.join('|'));
  const response=await api(`/api/pncp/filters?${params}`,{signal});return response.json();
}
async function renderNativeValue() {
  state.domainAbort?.abort();state.suggestAbort?.abort();clearTimeout(state.suggestTimer);
  const seq=++state.domainSeq;state.suggestSeq++;state.selected=[];
  const cap=state.schema.capabilities.find(c=>c.name===$('native-field').value),area=$('native-value-area');area.replaceChildren();$('domain-error').hidden=true;$('add-native').disabled=false;
  if(!cap)return;
  const help=el('p',`${cap.group} · ${cap.description}`,'panel-note');area.append(help);
  if(cap.state!=='enabled'){$('add-native').disabled=true;area.append(el('p',cap.reason,'panel-note'));return;}
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
            try{const response=await api(`/api/pncp/suggest?${new URLSearchParams({tipos_documento:'edital',campo:cap.name,q:input.value,tam_pagina:'20'})}`,{signal:controller.signal});const result=await response.json();if(seq===state.domainSeq && token===state.suggestSeq)showSuggestions(result.items);}
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
  if(!cap || cap.state!=='enabled' || $('add-native').disabled)return;
  if(state.legalPending && cap.name==='amparos_legais')return;
  if(cap.type==='list'){value=$('native-options')?[...$('native-options').selectedOptions].map(o=>o.value):state.selected.map(o=>o.id);if(!value.length)return;}
  else if(cap.type==='enum'){value=$('native-options').value;if(!value)return;}
  else {value=$('native-value').value;if(value==='')return;if(cap.type==='boolean')value=value==='true';if(cap.type==='integer')value=Number(value);}
  await setDraftFilter(cap.name,value);
}
function safeAnchor(label,value) {
  try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol) || url.username || url.password)return null;const link=el('a',label);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';return link;}catch{return null;}
}
async function openDetails(doc) {
  state.detailAbort?.abort();state.detailSeq++;const token=state.detailSeq;
  const content=$('details-content');content.replaceChildren();
  content.append(el('p',doc.objeto_compra ?? 'Objeto não informado.','detail-object'));
  const links=el('div',undefined,'detail-links');
  for(const [label,url]of [['Abrir no PNCP',doc.url_pncp],['Sistema de origem',doc.link_sistema_origem]]){const link=safeAnchor(label,url);if(link)links.append(link);}content.append(links);
  const fields=['numero_controle_pncp','orgao_nome','orgao_cnpj','unidade_orgao_nome_unidade','uf','municipio_nome','modalidade_nome','situacao_compra_nome_pncp','data_publicacao_pncp','data_atualizacao_pncp','valor_total_estimado','valor_total_homologado'];
  const grid=el('dl',undefined,'detail-grid');
  for(const field of fields){const column=state.schema.columns.find(c=>c.field===field),wrap=el('div');wrap.append(el('dt',column.title),el('dd',column.type==='decimal'?money(doc[field]):column.type==='date'?date(doc[field]):doc[field] ?? '—'));grid.append(wrap);}content.append(grid);
  const section=el('section',undefined,'items-section'),toolbar=el('div',undefined,'items-toolbar'),retry=el('button','Tentar consultar itens','button small'),itemsTitle=el('h3','Itens da contratação');retry.hidden=true;toolbar.append(itemsTitle,retry);section.append(toolbar);
  const itemStatus=el('p','Preparando consulta de itens…','items-status'),list=el('div'),pager=el('div',undefined,'item-pager'),previous=el('button','Anterior','button small'),pageLabel=el('span','Página 1'),next=el('button','Próxima','button small');pager.hidden=true;pager.append(previous,pageLabel,next);section.append(itemStatus,list,pager);content.append(section);
  let page=1,controller=null,hasMore=false;
  async function itemPage(target) {
    controller?.abort();controller=new AbortController();state.detailAbort=controller;
    retry.hidden=true;previous.disabled=true;next.disabled=true;itemStatus.textContent='Consultando itens no PNCP…';
    try {
      const p=doc._purchase,response=await api(`/api/contratacoes/${p.cnpj}/${p.ano}/${p.sequencial}/itens?pagina=${target}&tamanhoPagina=100`,{signal:controller.signal}),result=await response.json();
      if(token!==state.detailSeq)return;page=result.page;list.replaceChildren();
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
    }}
  }
  if(!doc._purchase){itemStatus.textContent='A fonte não forneceu CNPJ, ano e sequencial originais suficientes para consultar itens.';}
  else {retry.addEventListener('click',()=>itemPage(page));previous.addEventListener('click',()=>itemPage(page-1));next.addEventListener('click',()=>itemPage(page+1));}
  const raw=el('details'),summary=el('summary','Registro original da busca'),pre=el('pre',JSON.stringify(doc._raw,null,2));raw.append(summary,pre);content.append(raw);openDialog('details-dialog');
  if(doc._purchase)await itemPage(1);
}
async function exportCsv() {
  if(!state.lastQuery || state.exportAbort || !['success','empty'].includes(state.status))return;
  const query=clone(state.lastQuery);
  const seq=++state.exportSeq;const controller=new AbortController();state.exportAbort=controller;
  updateExportButton();notice('Consultando o PNCP e gerando CSV dos últimos critérios concluídos. Os dados podem diferir da tabela.');
  try {
    const response=await api('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:controller.signal});
    const blob=await response.blob();if(seq!==state.exportSeq)return;
    const href=URL.createObjectURL(blob),link=el('a');link.href=href;link.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'compras-pncp.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),10000);
    notice(`${response.headers.get('x-exported-rows')} linhas exportadas. Nova coleta de ${time(response.headers.get('x-pncp-started-at'))} a ${time(response.headers.get('x-pncp-finished-at'))}.`);
  }catch(error){if(seq===state.exportSeq && error.name!=='AbortError')notice(`Falha ao exportar CSV: ${error.message}${error.code?' ['+error.code+']':''}`,'error');}
  finally{if(seq===state.exportSeq){state.exportAbort=null;updateExportButton();}}
}
async function init() {
  state.schema=await (await api('/api/schema')).json();
  state.query=defaultQuery();
  $('search').value='';
  $('source-badge').hidden=!state.schema.demo;
  for(const groupName of ['Contratação','Item','Resultado do item','Fornecedor','Contrato']) {
    const group=el('optgroup');group.label=groupName==='Contrato'?'Contratos (indisponíveis)':groupName;
    for(const cap of state.schema.capabilities.filter(c=>!c.reserved && c.group===groupName)) {
      const suffix=cap.state==='unsupported_document'?' · somente contratos':cap.state==='enabled'?'':' · pendente';
      const option=el('option',`${cap.label || cap.name}${suffix}`);option.value=cap.name;option.disabled=cap.state!=='enabled';option.title=cap.reason || cap.description;group.append(option);
    }
    $('native-field').append(group);
  }
  $('native-field').value='ufs';
  const tableColumns=[state.schema.columns.find(c=>c.field==='titulo'),...state.schema.columns.filter(c=>c.field!=='titulo')];
  state.placeholder=el('div','Informe uma pesquisa e consulte as contratações do PNCP.');
  const resultInfo=$('result-info');
  state.table=new Tabulator('#results-table',{
    height:'100%',layout:'fitDataFill',nestedFieldSeparator:false,movableColumns:true,
    pagination:true,paginationMode:'remote',paginationSize:TABLE_PAGE_SIZE,paginationSizeSelector:false,paginationButtonCount:4,
    paginationCounter:()=>{resultInfo.hidden=false;return resultInfo;},
    sortMode:'remote',filterMode:'remote',ajaxRequestFunc:requestTable,dataLoader:false,data:[],
    placeholder:state.placeholder,
    locale:'pt-br',langs:{'pt-br':{pagination:{page_size:'Linhas',page_title:'Página',first:paginationIcons.first,first_title:'Primeira página',last:paginationIcons.last,last_title:'Última página',prev:paginationIcons.prev,prev_title:'Página anterior',next:paginationIcons.next,next_title:'Próxima página',counter:{showing:'Exibindo',of:'de',rows:'contratações',pages:'páginas'}}}},
    columns:tableColumns.map(column=>({title:column.title,field:column.field,width:column.width || 180,minWidth:85,visible:!!column.visible,formatter:colFormatter(column),variableHeight:column.field==='objeto_compra',headerSort:false,headerMenu:columnMenu,tooltip:false})),
  });
  state.table.on('rowClick',(event,row)=>openDetails(row.getData()));
  for(const column of tableColumns) {
    const label=el('label',undefined,'checkbox-label'),input=el('input');input.type='checkbox';input.checked=!!column.visible;input.addEventListener('change',()=>{input.checked?state.table.showColumn(column.field):state.table.hideColumn(column.field);});label.append(input,document.createTextNode(column.title));$('column-list').append(label);
  }
  $('app-header').addEventListener('focusin',event=>event.target.scrollIntoView({block:'nearest',inline:'nearest'}));
  $('search-form').addEventListener('submit',event=>{event.preventDefault();execute();});
  $('filters-button').addEventListener('click',()=>openFilters());$('columns-button').addEventListener('click',()=>openDialog('columns-dialog'));
  $('refresh-button').addEventListener('click',async()=>{
    if(!state.lastQuery)return;
    const {page}=state.lastQuery;state.query=clone(state.lastQuery);$('search').value=state.query.q;updateCriteria();
    try{await state.table.setPage(page);}catch{}
  });
  $('retry-button').addEventListener('click',execute);
  $('cancel-button').addEventListener('click',()=>{state.abort?.abort();});
  $('order').addEventListener('change',()=>{state.query.order=$('order').value;state.table.clearSort();execute();});
  $('clear-button').addEventListener('click',()=>{state.query=defaultQuery();$('search').value='';state.table.clearSort();updateCriteria();execute();});
  $('native-field').addEventListener('change',renderNativeValue);$('add-native').addEventListener('click',addNative);
  for(const [id,field]of [['draft-publication-start','data_publicacao_inicio'],['draft-publication-end','data_publicacao_fim']])$(id).addEventListener('input',()=>{const value=$(id).value;if(value)state.draft.pncp_filters[field]=value;else delete state.draft.pncp_filters[field];renderDraftLists();});
  $('apply-filters').addEventListener('click',()=>{if(state.legalPending || state.legalError)return;state.draft.q=$('draft-search').value;state.draft.status=$('draft-status').value;state.query=clone(state.draft);$('search').value=state.query.q;state.table.clearSort();$('filters-dialog').close();updateCriteria();execute();});
  $('filters-dialog').addEventListener('close',()=>{state.domainAbort?.abort();state.suggestAbort?.abort();state.legalAbort?.abort();clearTimeout(state.suggestTimer);state.domainSeq++;state.suggestSeq++;state.legalSeq++;});
  $('details-dialog').addEventListener('close',()=>{state.detailAbort?.abort();state.detailSeq++;});
  $('export-button').addEventListener('click',exportCsv);
  $('window-warning').addEventListener('mouseenter',showWindowTooltip);
  $('window-warning').addEventListener('mouseleave',hideWindowTooltip);
  $('window-warning').addEventListener('focus',showWindowTooltip);
  $('window-warning').addEventListener('blur',hideWindowTooltip);
  window.addEventListener('resize',hideWindowTooltip);
  document.addEventListener('scroll',hideWindowTooltip,true);
  updateCriteria();status('idle');
  state.table.on('tableBuilt',execute);
}
init().catch(error=>{$('startup-error').hidden=false;$('startup-error').textContent=`Não foi possível iniciar a interface: ${error.message}. Recarregue a página.`;notice('Falha ao carregar o esquema da aplicação.','error');});
