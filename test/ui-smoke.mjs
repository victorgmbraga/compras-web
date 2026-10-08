// UI verification against the static artifact; see docs/validacao.md.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { launchTestBrowser } from './browser-launch.js';
import { defaults } from '../src/settings.js';
import { createStaticServer } from './static-server.js';
import { schema } from '../src/schema.js';
import { FILTER_OPTIONS_PREFIX, FILTER_OPTIONS_TTL } from '../src/browser/filter-options-cache.js';
const config={...defaults,DEMO_MODE:true,PNCP_REQUESTS_PER_SECOND:100000};
const app=createStaticServer(new URL('../dist-browser-test/',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const serviceEvent='service';
const initialDomains=[];
page.on(serviceEvent,message=>{if(message.method==='domains')initialDomains.push(message.payload);});
const localApiRequests=[];
page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))localApiRequests.push(r.url());});
{
  await page.exposeFunction('__observeService',message=>page.emit('service',message));
  await page.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {postMessage(message,...args){window.__observeService(message);return super.postMessage(message,...args);}};});
}
function waitQuery(predicate){
  return page.waitForEvent('service',{predicate:m=>m.method==='execute' && predicate(m.payload.query)}).then(m=>m.payload.query);
}
const check=name=>{checks.push(name);console.log('PASS '+name);};
async function search(text) {await page.locator('#search').fill(text);await page.locator('#search-button').click();}
async function addEveryFilter(type) {
  const catalog=schema(config);
  const caps=catalog.capabilities.filter(c=>!c.reserved && c.documents.includes(type));
  await page.locator('#filters-button').click();
  for(const cap of caps){
    await page.locator('#native-field').selectOption(cap.name);
    await page.waitForFunction(()=>!document.querySelector('#add-native').disabled);
    if(['list','enum'].includes(cap.type)){
      if(cap.domain_kind==='suggest')await page.locator('#native-suggestions .suggestion').first().click();
      else {const first=await page.locator('#native-options option').first().getAttribute('value');await page.locator('#native-options').selectOption(first);}
    }else if(cap.type==='boolean')await page.locator('#native-value').selectOption('false');
    else await page.locator('#native-value').fill(cap.type==='date'?'2026-09-01':cap.type==='integer'?'0':cap.name==='codigo_ibge'?'5300108':'0.00');
    await page.locator('#add-native').click();
  }
  const request=waitQuery(input=>Object.keys(input.pncp_filters).length===caps.length);
  await page.locator('#apply-filters').click();const input=await request;assert.equal(input.document_type,type);assert.equal(Object.keys(input.pncp_filters).length,caps.length);
  await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);return caps.length;
}
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('.tabulator'));
  assert.match(await page.locator('#source-badge').innerText(),/dados fictícios/);check('Demonstração marcada e interface disponível');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');check('Pesquisa inicial sem filtros executada automaticamente');
  await page.waitForFunction(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length===8,FILTER_OPTIONS_PREFIX);
  assert.equal(initialDomains.length,8);
  assert.deepEqual(initialDomains.filter(payload=>payload.field===null).map(payload=>payload.type),['edital','ata','contrato']);
  const storedOptions=await page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).map(key=>JSON.parse(localStorage.getItem(key))),FILTER_OPTIONS_PREFIX);
  for(const entry of storedOptions){assert.equal(entry.expires_at-entry.fetched_at,FILTER_OPTIONS_TTL);assert(!Object.hasOwn(entry.value,'raw'));}
  for(let i=0;i<2;i++){await page.locator('#filters-button').click();await page.locator('#native-options').waitFor();await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();}
  assert.equal(initialDomains.length,8);check('Inicialização pré-carrega e persiste as opções dos três tipos; reabrir filtros não consulta a fonte');
  const cachedPage=await page.context().newPage(),cachedDomains=[];
  try {
    cachedPage.on('pageerror',error=>errors.push(error.message));
    await cachedPage.exposeFunction('__observeCachedDomains',message=>{if(message.method==='domains')cachedDomains.push(message.payload);});
    await cachedPage.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {postMessage(message,...args){window.__observeCachedDomains(message);return super.postMessage(message,...args);}};});
    await cachedPage.goto(page.url(),{waitUntil:'load'});
    await cachedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
    for(const [type,title] of [['edital','64 contratações'],['ata','24 atas'],['contrato','32 contratos']]){
      await cachedPage.locator('#document-type').selectOption(type);
      await cachedPage.waitForFunction(expected=>document.querySelector('#result-title').textContent===expected,title);
      await cachedPage.locator('#filters-button').click();await cachedPage.locator('#native-options').waitFor();
      await cachedPage.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
    }
    assert.equal(cachedDomains.length,0);check('Nova página reutiliza localStorage para filtros de edital, ata e contrato');
    await cachedPage.evaluate(({prefix,ttl})=>{
      localStorage.setItem('filter-cache-test-preference','preservar');
      for(const key of Object.keys(localStorage).filter(key=>key.startsWith(prefix))){const entry=JSON.parse(localStorage.getItem(key));entry.fetched_at=Date.now()-ttl;entry.expires_at=entry.fetched_at+ttl;localStorage.setItem(key,JSON.stringify(entry));}
    },{prefix:FILTER_OPTIONS_PREFIX,ttl:FILTER_OPTIONS_TTL});
    await cachedPage.reload({waitUntil:'load'});
    await cachedPage.waitForFunction(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length===8 && Object.keys(localStorage).filter(key=>key.startsWith(prefix)).every(key=>JSON.parse(localStorage.getItem(key)).expires_at>Date.now()),FILTER_OPTIONS_PREFIX);
    await cachedPage.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
    assert.equal(cachedDomains.length,8);
    assert.equal(await cachedPage.evaluate(()=>localStorage.getItem('filter-cache-test-preference')),'preservar');
    check('Listas vencidas há quatro horas são renovadas sem apagar dados alheios');
  } finally {await cachedPage.close();}
  assert.equal(await page.locator('.tabulator-page-size').count(),0);check('Seletor de linhas removido');
  assert.equal(await page.locator('#app-header .header-toolbar .criteria-row').count(),1);
  for(const id of ['order','clear-button','cancel-button','retry-button','refresh-button','columns-button','export-button'])assert.equal(await page.locator(`#app-header #${id}`).count(),1);
  for(const [id,label] of [['search-button','Pesquisar'],['filters-button','Filtros']]){
    const button=page.locator(`#${id}`);assert.equal(await button.getAttribute('aria-label'),label);assert.equal(await button.getAttribute('title'),label);assert.equal(await button.locator('svg').count(),1);assert.equal(await button.locator('span:not(.count-badge)').count(),0);
  }
  assert.equal(await page.locator('.result-toolbar').count(),0);
  assert.equal(await page.locator('.tabulator-footer .result-info').count(),1);
  const popupFields=await page.locator('.tabulator-header-popup-button').evaluateAll(buttons=>buttons.map(button=>button.closest('.tabulator-col')?.getAttribute('tabulator-field')));
  assert(!popupFields.includes('titulo'));assert(!popupFields.includes('objeto_compra'));assert(!popupFields.includes('data_atualizacao_pncp'));assert(popupFields.includes('orgao_nome'));
  assert.equal(await page.locator('.tabulator-header-popup-button .header-filter-icon').count(),popupFields.length);
  for(const field of ['orgao_nome','uf','data_publicacao_pncp']){
    const title=page.locator(`.tabulator-col[tabulator-field="${field}"] .tabulator-col-title`);
    assert.equal(await title.locator('.tabulator-header-popup-button').evaluate(node=>node===node.parentElement.lastElementChild),true);
  }
  assert.equal(await page.locator('.source-footer').count(),0);check('Ordenação e ações no cabeçalho, informações no rodapé da tabela');
  await search('janela-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='4.143.240 contratações');
  assert.match(await page.locator('.tabulator-page-counter').innerText(),/Exibindo 1-100 de\s+4\.143\.240 contratações/);
  assert.equal(await page.locator('#notice').isVisible(),false);assert(await page.locator('#window-warning').isVisible());
  await page.locator('#window-warning').hover();await page.locator('#window-warning-tooltip').waitFor({state:'visible'});
  assert.match(await page.locator('#window-warning-tooltip').innerText(),/janela acessível é de 10000 documentos/);
  check('Total real e limite em tooltip');
  for(const [action,label]of [['first','Primeira página'],['prev','Página anterior'],['next','Próxima página'],['last','Última página']]) {
    const button=page.locator(`.tabulator-page[data-page="${action}"]`);
    assert.equal(await button.locator('svg.pagination-icon').count(),1);
    assert.equal(await button.getAttribute('aria-label'),label);assert.equal(await button.getAttribute('title'),label);
  }
  check('Todos os botões de navegação usam ícones SVG com rótulos acessíveis');
  await search('pagina-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='164 contratações');
  assert.equal(await page.locator('#window-warning').isVisible(),false);
  // Tabulator virtualizes rows; the page counter represents the full page.
  await page.waitForFunction(()=>/1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.tabulator-page-counter')?.textContent || ''));check('Consulta nativa e primeira página de 100 documentos');
  await page.locator('.tabulator-page[data-page="last"]').click();await page.waitForFunction(()=>/101\s*[-–]\s*164\s+de\s+164/.test(document.querySelector('.tabulator-page-counter')?.textContent || ''));check('Ícone de última página abre a segunda página com 64 documentos');
  await page.locator('#refresh-button').click();await page.waitForFunction(()=>!document.querySelector('#refresh-button').disabled);assert.equal(await page.locator('.tabulator-page.active').getAttribute('data-page'),'2');assert.match(await page.locator('.tabulator-page-counter').innerText(),/101\s*[-–]\s*164/);check('Atualizar mantém a segunda página');
  await page.locator('.tabulator-page[data-page="first"]').click();await page.waitForFunction(()=>/1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.tabulator-page-counter')?.textContent || ''));check('Ícone de primeira página retorna ao início');
  await page.locator('.tabulator-page[data-page="next"]').click();await page.waitForFunction(()=>/101\s*[-–]\s*164\s+de\s+164/.test(document.querySelector('.tabulator-page-counter')?.textContent || ''));check('Ícone de próxima página avança');
  await page.locator('.tabulator-page[data-page="prev"]').click();await page.waitForFunction(()=>/1\s*[-–]\s*100\s+de\s+164/.test(document.querySelector('.tabulator-page-counter')?.textContent || ''));check('Ícone de página anterior retorna');
  await search('firewall');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');assert.equal(await page.locator('.tabulator-page.active').getAttribute('data-page'),'1');check('Novos critérios voltam à página 1');
  const tabRequests=[];const observeTabs=request=>{if(['details','documentRelated'].includes(request.method) && request.payload.document.type==='edital')tabRequests.push(request);};page.on(serviceEvent,observeTabs);
  await page.locator('.tabulator-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#detail-tab-detalhes').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#detail-panel-detalhes dt').count(),12);check('Detalhes abre com seis abas e os doze campos solicitados');
  await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(button=>button.dataset.state==='loaded'));assert.equal(tabRequests.length,5);check('Cinco listagens carregam em background antes da troca de abas');
  assert.equal(await page.locator('#details-content .detail-links').count(),0);assert.equal(await page.locator('.details-actions #details-links a').count(),1);assert.equal(Math.round((await page.locator('#details-dialog').boundingBox()).width),888);check('Links junto ao botão de fechar e painel ampliado em 20%');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/details-tabs-desktop.png`});
  await page.locator('#detail-tab-detalhes').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#detail-tab-itens').getAttribute('aria-selected'),'true');await page.keyboard.press('End');assert.equal(await page.locator('#detail-tab-historico').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('#detail-tab-detalhes').getAttribute('aria-selected'),'true');check('Teclado navega entre abas com foco e seleção sincronizados');
  await page.locator('#detail-tab-itens').click();await page.locator('.item-card').first().waitFor();assert.match(await page.locator('.item-card').first().innerText(),/Homologado/);check('Detalhes carregam itens automaticamente');
  for(const [resource,pattern]of [['arquivos',/Baixar arquivo/],['atas',/Vigência/],['contratos',/Valor global/],['historico',/Justificativa/]]) {
    const section=page.locator(`.related-section[data-resource="${resource}"]`);await page.locator(`#detail-tab-${resource}`).click();await section.locator('.related-card').first().waitFor();assert.match(await section.innerText(),pattern);check(`Aba ${resource} exibe a listagem carregada`);
  }
  assert.equal(tabRequests.length,5);check('Trocar abas preserva dados sem repetir consultas');
  for(const resource of ['arquivos','historico']) {
    const section=page.locator(`.related-section[data-resource="${resource}"]`);await page.locator(`#detail-tab-${resource}`).click();assert.equal(await section.locator('.related-card').count(),10);
    await section.locator('.item-pager button').nth(1).click();await page.waitForFunction(r=>document.querySelector(`.related-section[data-resource="${r}"] .item-pager span`)?.textContent==='Página 2 de 2',resource);
    assert.equal(await section.locator('.related-card').count(),2);assert.equal(await section.locator('.item-pager button').nth(1).isDisabled(),true);check(`Paginação de ${resource} alcança a última página`);
  }
  const fileLink=page.locator('.related-section[data-resource="arquivos"] .related-card a').first();assert.equal(await fileLink.getAttribute('target'),'_blank');assert.equal(await fileLink.getAttribute('rel'),'noopener noreferrer');assert.match(await fileLink.getAttribute('href'),/^https:\/\/pncp.gov.br\//);
  await page.locator('#detail-tab-detalhes').click();const previousViewport=page.viewportSize();
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('#details-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);await page.locator('#detail-tab-historico').click();assert(await page.locator('#detail-panel-historico').isVisible());await page.locator('#detail-tab-detalhes').click();}
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/details-tabs-mobile.png`});
  await page.setViewportSize(previousViewport);check('Abas, listagens e links cabem no painel em telas menores');
  await page.locator('#details-dialog .close-dialog').click();page.off(serviceEvent,observeTabs);
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^compras-demo-/);assert.equal(await page.locator('#export-dialog').count(),0);check('CSV baixado diretamente por nova coleta, sem confirmação');
  await page.locator('#filters-button').click();await page.locator('#native-options').waitFor();await page.locator('#native-options').selectOption('GO');await page.locator('#add-native').click();await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='0 contratações');check('Filtro nativo UF aplicado no serviço');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await page.locator('#native-field').selectOption('srp');await page.locator('#native-value').selectOption('false');await page.locator('#add-native').click();
  const srpRequest=waitQuery(input=>input.pncp_filters.srp===false);
  await page.locator('#apply-filters').click();assert.equal((await srpRequest).pncp_filters.srp,false);
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratações');check('Filtro SRP envia false e exibe somente registros correspondentes');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();
  for(const [name,ids]of [['fontes',['3','5']],['modos_disputa',['1','2']]]){
    await page.locator('#native-field').selectOption(name);await page.locator('#native-options').selectOption(ids);await page.locator('#add-native').click();
  }
  const conditions=['indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional'];
  for(const name of conditions){await page.locator('#native-field').selectOption(name);await page.locator('#native-value').selectOption('false');await page.locator('#add-native').click();}
  const documentaryRequest=waitQuery(input=>input.pncp_filters.fontes?.length===2);
  await page.locator('#apply-filters').click();const documentaryFilters=(await documentaryRequest).pncp_filters;
  assert.deepEqual(documentaryFilters.fontes,['3','5']);assert.deepEqual(documentaryFilters.modos_disputa,['1','2']);assert(conditions.every(name=>documentaryFilters[name]===false));
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='11 contratações');check('Origem, modo de disputa e cinco condições documentais são aplicados juntos');
  await page.locator('#filters-button').click();
  for(const name of conditions){await page.locator('#native-field').selectOption(name);assert.equal(await page.locator('#native-value').inputValue(),'false');}
  await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();check('Editar filtros documentais preserva Não');
  const documentaryDownload=page.waitForEvent('download');await page.locator('#export-button').click();const exported=await documentaryDownload;
  const documentaryCsv=await readFile(await exported.path(),'utf8');assert.equal(documentaryCsv.split('\r\n').length,13);check('CSV usa os mesmos filtros documentais e exporta todas as onze contratações');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();
  for(const [name,ids]of [['criterios_julgamento',['7']],['categorias_leilao',['1']],['beneficios',['1']]]){
    await page.locator('#native-field').selectOption(name);assert.match(await page.locator('#native-value-area').innerText(),/Os detalhes mostram todos os itens/);
    await page.locator('#native-options').selectOption(ids);await page.locator('#add-native').click();
  }
  const itemConditions=['incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional','possui_emenda_parlamentar'];
  for(const name of itemConditions){await page.locator('#native-field').selectOption(name);await page.locator('#native-value').selectOption('true');await page.locator('#add-native').click();}
  const itemRequest=waitQuery(input=>input.pncp_filters.beneficios?.includes('1'));
  await page.locator('#apply-filters').click();const itemFilters=(await itemRequest).pncp_filters;assert(itemConditions.every(name=>itemFilters[name]===true));assert.deepEqual(itemFilters.categorias_leilao,['1']);
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');check('Emenda e seis filtros de itens são aplicados juntos');
  await page.locator('.tabulator-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});await page.locator('#detail-tab-itens').click();await page.waitForFunction(()=>document.querySelectorAll('.item-card').length===2);
  assert.match(await page.locator('.item-card').nth(1).innerText(),/Item complementar/);await page.locator('#details-dialog .close-dialog').click();check('Detalhes preservam os dois itens após a pesquisa filtrada');
  const itemDownload=page.waitForEvent('download');await page.locator('#export-button').click();const itemExport=await itemDownload;assert.equal((await readFile(await itemExport.path(),'utf8')).split('\r\n').length,8);check('CSV exporta seis contratações, sem multiplicar linhas pelos itens');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await page.locator('#native-field').selectOption('codigo_ibge');await page.locator('#native-value').fill('5300108');await page.locator('#add-native').click();
  const ibgeRequest=waitQuery(input=>input.pncp_filters.codigo_ibge==='5300108');
  await page.locator('#apply-filters').click();assert.equal((await ibgeRequest).pncp_filters.codigo_ibge,'5300108');check('Código IBGE preservado como texto na pesquisa');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratações');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await page.locator('#native-field').selectOption('amparos_legais');await page.locator('#native-options').selectOption(['19','98']);await page.locator('#add-native').click();
  await page.locator('#native-field').selectOption('normativos_base');await page.locator('#native-options').selectOption('1');await page.locator('#add-native').click();
  await page.waitForFunction(()=>document.querySelector('#legal-error').textContent.includes('incompatíveis') && !document.querySelector('#apply-filters').disabled);
  const legalRequest=waitQuery(input=>input.pncp_filters.normativos_base?.includes('1'));
  await page.locator('#apply-filters').click();const legalFilters=(await legalRequest).pncp_filters;assert.deepEqual(legalFilters.amparos_legais,['19']);assert.deepEqual(legalFilters.normativos_base,['1']);check('Normativo reconcilia amparos legais e aplica os critérios válidos');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='11 contratações');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await page.locator('#native-field').selectOption('anos');await page.locator('#native-options').waitFor();assert.equal(await page.locator('#native-options option').innerText(),'2026');await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();check('Domínio de anos no formato real do PNCP');
  assert.equal(await addEveryFilter('edital'),71);check('Todos os 71 filtros de contratações podem ser preenchidos e aplicados no navegador');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#document-type').selectOption('contrato');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');
  assert(await page.locator('.tabulator-col[tabulator-field="valor_global"]').isVisible());assert.equal(await page.locator('.tabulator-col[tabulator-field="valor_total_estimado"]').count(),0);check('Troca para contratos consulta a fonte e apresenta as colunas próprias');
  await page.locator('#filters-button').click();await page.locator('#draft-status').selectOption('vigente');await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='16 contratos');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');check('Status Vigentes usa o domínio temporal de contratos e limpar mantém o tipo');
  const detailRequests=[];const observe=r=>{if(r.method==='details')detailRequests.push(r);};page.on(serviceEvent,observe);
  await page.locator('.tabulator-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(button=>button.dataset.state==='loaded'));
  assert.equal(await page.locator('#detail-panel-detalhes dt').count(),34);assert.match(await page.locator('#details-content').innerText(),/Valor inicial/);assert.equal(await page.locator('.items-section').count(),0);assert.equal(detailRequests.length,0);check('Contrato carrega os dados nativos e cinco listas sem confundir seu sequencial com a compra');
  for(const resource of ['empenhos','instrumentocobranca','termos']){
    await page.locator(`#detail-tab-${resource}`).click();const section=page.locator(`#detail-panel-${resource}`);assert.equal(await section.locator('.related-card').count(),1);
    await section.locator('.related-card > button').first().click();await section.locator('.related-extra').waitFor({state:'visible'});
    if(resource==='termos')await section.locator('.related-extra a').first().waitFor();else await section.locator('.related-extra dl').waitFor();
    check(`Contrato exibe ${resource} e consulta os detalhes do registro selecionado`);
  }
  await page.locator('#detail-tab-detalhes').click();if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/contract-details-desktop.png`});
  await page.locator('#details-dialog .close-dialog').click();page.off(serviceEvent,observe);
  await page.locator('.tabulator-row').filter({hasText:'Contrato de demonstração nº 2/2026'}).click();await page.waitForFunction(()=>document.querySelector('#detail-tab-historico')?.textContent==='Histórico (?)');await page.locator('#detail-tab-historico').click();
  const unknownHistory=page.locator('#detail-panel-historico'),historyNext=unknownHistory.getByRole('button',{name:'Próxima página de Histórico'}),historyPrevious=unknownHistory.getByRole('button',{name:'Página anterior de Histórico'});
  assert.equal(await unknownHistory.locator('.related-card').count(),2);assert.match(await unknownHistory.locator('.items-status').innerText(),/Quantidade desconhecida/);assert.equal(await unknownHistory.locator('.item-pager span').innerText(),'Página 1');
  await historyNext.click();await page.waitForFunction(()=>document.querySelector('#detail-panel-historico .item-pager span').textContent==='Página 2');assert.equal(await unknownHistory.locator('.related-card').count(),1);assert.equal(await historyNext.isEnabled(),true);
  await historyNext.click();await page.waitForFunction(()=>document.querySelector('#detail-panel-historico .item-pager span').textContent==='Página 3');assert.equal(await historyNext.isDisabled(),true);assert.equal(await historyPrevious.isEnabled(),true);assert.match(await unknownHistory.locator('.items-status').innerText(),/Fim do histórico/);assert.match(await unknownHistory.locator('.related-list').innerText(),/Nenhum registro/);assert.equal(await page.locator('#detail-tab-historico').innerText(),'Histórico (?)');
  await historyPrevious.click();await page.waitForFunction(()=>document.querySelector('#detail-panel-historico .item-pager span').textContent==='Página 2');assert.equal(await unknownHistory.locator('.related-card').count(),1);assert.equal(await historyNext.isEnabled(),true);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#details-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);await page.setViewportSize({width:1440,height:1000});
  await page.locator('#details-dialog .close-dialog').click();check('Histórico de contrato com contagem divergente exibe total desconhecido e permite avançar até uma página vazia');
  await page.locator('#filters-button').click();await page.locator('#native-field').selectOption('tipos_contrato');await page.locator('#native-options').selectOption('1');await page.locator('#add-native').click();await page.locator('#native-field').selectOption('possui_nfe');await page.locator('#native-value').selectOption('true');await page.locator('#add-native').click();await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='8 contratos');
  const contractDownload=page.waitForEvent('download');await page.locator('#export-button').click();const exportedContracts=await contractDownload,contractCsv=await readFile(await exportedContracts.path(),'utf8');assert.equal(contractCsv.split('\r\n').length,10);assert(contractCsv.split('\r\n')[0].includes('"valor_global"'));check('Filtros exclusivos de contratos e CSV de oito contratos usam os mesmos critérios');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='32 contratos');assert.equal(await addEveryFilter('contrato'),32);check('Todos os 32 filtros de contratos podem ser preenchidos e aplicados no navegador');
  assert.deepEqual(await page.locator('#document-type option').evaluateAll(nodes=>nodes.map(n=>n.textContent)),['Editais e Avisos de Contratações','Atas de Registro de Preços','Contratos']);
  await page.locator('#document-type').selectOption('ata');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='24 atas');
  assert(await page.locator('.tabulator-col[tabulator-field="cancelado"]').isVisible());assert.equal(await page.locator('.tabulator-col[tabulator-field="valor_global"]').count(),0);check('Os três tipos oficiais estão disponíveis e atas apresentam colunas próprias');
  const ataRequests=[];const observeAta=r=>{if(['documentDetails','documentRelated'].includes(r.method) && r.payload.document.type==='ata')ataRequests.push(r);};page.on(serviceEvent,observeAta);
  await page.locator('.tabulator-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('.detail-tab')].every(button=>button.dataset.state==='loaded'));
  assert.equal(ataRequests.length,5);assert.equal(await page.locator('#detail-panel-detalhes dt').count(),22);assert.match(await page.locator('#detail-panel-detalhes').innerText(),/Número da ata/);assert.equal(await page.locator('#detail-tab-itens').count(),0);assert.equal(await page.locator('#detail-tab-termos').count(),0);check('Ata carrega seus dados completos e quatro listas em background');
  await page.locator('#detail-tab-partesenvolvidas').click();assert.match(await page.locator('#detail-panel-partesenvolvidas').innerText(),/Gerenciadora/);await page.locator('#detail-tab-contratos').click();assert.match(await page.locator('#detail-panel-contratos').innerText(),/Valor global/);assert.equal(ataRequests.length,5);check('Partes envolvidas e contratos vinculados da ata aparecem sem repetir consultas');
  await page.locator('#detail-tab-detalhes').click();const ataOrigin=page.locator('#detail-panel-detalhes a').first();assert.match(await ataOrigin.getAttribute('href'),/\/app\/editais\//);assert.equal(await ataOrigin.getAttribute('rel'),'noopener noreferrer');
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert(await page.locator('#details-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));}
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/ata-details-mobile.png`});await page.setViewportSize({width:1440,height:1000});check('Detalhes de ata conservam vínculos seguros e layout em telas menores');
  await page.locator('#details-dialog .close-dialog').click();page.off(serviceEvent,observeAta);
  await page.locator('#filters-button').click();await page.locator('#draft-status').selectOption('vigente');await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='12 atas');
  const ataDownload=page.waitForEvent('download');await page.locator('#export-button').click();const exportedAtas=await ataDownload,ataCsv=await readFile(await exportedAtas.path(),'utf8');assert.equal(ataCsv.split('\r\n').length,14);assert(ataCsv.split('\r\n')[0].includes('"cancelado"'));assert(!ataCsv.split('\r\n')[0].includes('"valor_global"'));check('Vigência e CSV de atas conservam os mesmos critérios e colunas');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='24 atas');assert.equal(await addEveryFilter('ata'),16);check('Todos os 16 filtros de atas podem ser preenchidos e aplicados no navegador');
  await page.locator('#document-type').selectOption('edital');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');check('Voltar a contratações restaura colunas e critérios do tipo escolhido');
  await page.locator('#columns-button').click();const checkbox=page.locator('#column-list label').filter({hasText:'CNPJ do órgão'}).locator('input');await checkbox.check();await page.locator('#columns-dialog .close-dialog').click();assert(await page.locator('.tabulator-col[tabulator-field="orgao_cnpj"]').isVisible());check('Seleção de colunas');
  await search('csv-lenta-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='164 contratações');
  let cancelledDownloads=0;const observeDownload=()=>cancelledDownloads++;page.on('download',observeDownload);
  await page.locator('#export-button').click();
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Coletando'));
  assert(await page.locator('#cancel-export-button').isVisible());await page.locator('#cancel-export-button').click();
  await page.waitForFunction(()=>!document.querySelector('#export-button').disabled);await page.waitForTimeout(600);
  assert.equal(cancelledDownloads,0);assert.match(await page.locator('#notice').innerText(),/Exportação cancelada/);page.off('download',observeDownload);check('Progresso e botão Cancelar CSV interrompem a coleta sem baixar arquivo parcial');
  await search('lenta-ui');assert.equal(await page.locator('#search-button').isVisible(),false);assert(await page.locator('#cancel-button').isVisible());
  await page.locator('#cancel-button').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Consulta cancelada'));
  assert(await page.locator('#search-button').isVisible());assert.equal(await page.locator('#cancel-button').isVisible(),false);check('Cancelar substitui Pesquisar durante o carregamento e restaura o botão ao cancelar');
  await search('lenta-ui');await page.locator('#search').fill('firewall');await page.locator('#search').press('Enter');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');await page.waitForTimeout(600);assert.equal(await page.locator('#result-title').innerText(),'6 contratações');check('Resposta antiga não substitui a consulta atual');
  await search('falha-ui');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('INVALID_UPSTREAM'));assert(await page.locator('#export-button').isDisabled());assert.match(await page.locator('#notice').innerText(),/resultado anterior/);check('Falha visível e exportação desabilitada');
  await search('xss-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='1 contratação');assert.equal(await page.evaluate(()=>window.pwned),undefined);assert.match(await page.locator('.object-text').innerText(),/<img/);check('Marcação da fonte é exibida como texto');
  await search('');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:process.env.COMPRAS_QA_SCREENSHOT_DIR+'/desktop.png',fullPage:true});
  for(const width of [320,390,768,1057,1440]) {
    await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
    const fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,centers:[...document.querySelectorAll('#app-header .brand,#app-header input,#app-header button,#app-header select,#source-badge')].filter(node=>node.getClientRects().length).map(node=>{const rect=node.getBoundingClientRect();return rect.top+rect.height/2;})}));
    assert(fit.scroll<=fit.width,`Overflow da página em ${width}px`);
    assert(Math.max(...fit.centers)-Math.min(...fit.centers)<=1,`Cabeçalho quebrou linha em ${width}px`);
    await page.locator('#export-button').evaluate(node=>node.blur());await page.locator('#export-button').focus();
    const focused=await page.locator('#export-button').boundingBox();assert(focused.x>=-.5 && focused.x+focused.width<=width+.5,`Exportar não ficou visível com foco em ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#filters-button').click();assert(await page.locator('#filters-dialog').isVisible());await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();check('Cabeçalho em linha única com rolagem acessível e painéis sem overflow da página');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:process.env.COMPRAS_QA_SCREENSHOT_DIR+'/mobile.png',fullPage:true});
  {assert.deepEqual(localApiRequests,[]);check('Distribuição estática executa todas as ações sem API local');}
  assert.deepEqual(errors,[]);check('Sem erros JavaScript não tratados');
  console.log(JSON.stringify({checks:checks.length,passed:checks,errors}));
}finally{await browser.close();await app.close();}
