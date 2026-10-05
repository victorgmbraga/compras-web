// Optional UI verification: install Playwright and its Chromium browser first.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createApplication } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { demoFetch, demoDocuments } from '../src/demo.js';
const { chromium }=await import(process.env.COMPRAS_QA_PLAYWRIGHT_MODULE || 'playwright');
let launch={headless:true};
if(process.env.COMPRAS_QA_CHROMIUM_MODULE) {
  const {default:binary}=await import(pathToFileURL(process.env.COMPRAS_QA_CHROMIUM_MODULE));
  launch={headless:true,executablePath:process.env.COMPRAS_QA_CHROMIUM_EXECUTABLE || await binary.executablePath(),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote']};
}
const config={...loadConfig({}),DEMO_MODE:true,PNCP_REQUESTS_PER_SECOND:100000};
const app=createApplication(config,{fetcher:async(url,init)=>{
  const u=new URL(url);
  if(u.searchParams.get('q')==='falha-ui')return new Response('<html>falha</html>',{headers:{'Content-Type':'text/html'}});
  if(u.searchParams.get('q')==='lenta-ui')await new Promise(resolve=>setTimeout(resolve,500));
  if(u.searchParams.get('q')==='janela-ui') {
    const size=Number(u.searchParams.get('tam_pagina')),page=Number(u.searchParams.get('pagina'));
    const docs=Array.from({length:size},(_,i)=>({...demoDocuments[i%demoDocuments.length],id:`janela-${(page-1)*size+i+1}`,numero_controle_pncp:`janela-${(page-1)*size+i+1}`}));
    return Response.json({items:docs,total:4143240});
  }
  if(u.searchParams.get('q')==='pagina-ui') {
    const docs=Array.from({length:164},(_,i)=>({...demoDocuments[i%demoDocuments.length],id:`pagina-${i+1}`,numero_controle_pncp:`pagina-${i+1}`}));
    const size=Number(u.searchParams.get('tam_pagina')),page=Number(u.searchParams.get('pagina'));
    return Response.json({items:docs.slice((page-1)*size,page*size),total:docs.length});
  }
  if(u.searchParams.get('q')==='xss-ui')return new Response(JSON.stringify({items:[{id:'xss',doc_type:'_doc',document_type:'edital',description:'<img src=x onerror="window.pwned=true">',orgao_cnpj:'00000000000000',ano:'2026',numero_sequencial:'1'}],total:1}),{headers:{'Content-Type':'application/json'}});
  return demoFetch(url,init);
}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch(launch),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const check=name=>{checks.push(name);console.log('PASS '+name);};
async function search(text) {await page.locator('#search').fill(text);await page.locator('#search-button').click();}
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('.tabulator'));
  assert.match(await page.locator('#source-badge').innerText(),/dados fictícios/);check('Demonstração marcada e interface disponível');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');check('Pesquisa inicial sem filtros executada automaticamente');
  assert.equal(await page.locator('.tabulator-page-size').count(),0);check('Seletor de linhas removido');
  assert.equal(await page.locator('.result-toolbar .criteria-row').count(),1);
  assert.equal(await page.locator('.tabulator-footer .result-info').count(),1);
  assert.equal(await page.locator('.source-footer').count(),0);check('Critérios na barra e informações no rodapé da tabela');
  await search('janela-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='4.143.240 contratações');
  assert.match(await page.locator('.tabulator-page-counter').innerText(),/Exibindo 1-100 de\s+4\.143\.240 contratações/);
  assert.equal(await page.locator('#notice').isVisible(),false);assert(await page.locator('#window-warning').isVisible());
  await page.locator('#window-warning').hover();await page.locator('#window-warning-tooltip').waitFor({state:'visible'});
  assert.match(await page.locator('#window-warning-tooltip').innerText(),/janela acessível é de 10000 documentos/);
  await page.locator('#audit-button').click();assert(await page.locator('#audit-dialog').isVisible());await page.locator('#audit-dialog .close-dialog').click();check('Total real, limite em tooltip e critérios pelo ícone de informação');
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
  await page.locator('.tabulator-row').first().click();await page.locator('#details-dialog').waitFor({state:'visible'});await page.locator('.item-card').waitFor();assert.match(await page.locator('.item-card').innerText(),/Homologado/);check('Detalhes carregam itens automaticamente');
  await page.locator('#details-dialog .close-dialog').click();
  await page.locator('#export-button').click();const downloadPromise=page.waitForEvent('download');await page.locator('#download-csv').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/^compras-demo-/);check('CSV gerado por nova coleta');
  await page.locator('#filters-button').click();await page.locator('#native-options').waitFor();await page.locator('#native-options').selectOption('GO');await page.locator('#add-native').click();await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='0 contratações');check('Filtro nativo UF aplicado no backend');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await page.locator('#filters-button').click();await page.locator('#native-field').selectOption('anos');await page.locator('#native-options').waitFor();assert.equal(await page.locator('#native-options option').innerText(),'2026');await page.locator('#filters-dialog .close-dialog').click();check('Domínio de anos no formato real do PNCP');
  await page.locator('#filters-button').click();await page.locator('[data-tab="rules"]').click();await page.locator('#rule-field').selectOption('objeto_compra');await page.locator('#rule-value').fill('oracle');await page.locator('#add-rule').click();await page.locator('#apply-filters').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');assert.equal(await page.locator('#mode').inputValue(),'refined');check('Regras adicionais ativam refinamento completo');
  await page.locator('#columns-button').click();const checkbox=page.locator('#column-list label').filter({hasText:'CNPJ do órgão'}).locator('input');await checkbox.check();await page.locator('#columns-dialog .close-dialog').click();assert(await page.locator('.tabulator-col[tabulator-field="orgao_cnpj"]').isVisible());check('Seleção de colunas');
  await page.locator('#clear-button').click();await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  await search('lenta-ui');await search('firewall');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='6 contratações');await page.waitForTimeout(600);assert.equal(await page.locator('#result-title').innerText(),'6 contratações');check('Resposta antiga não substitui a consulta atual');
  await search('falha-ui');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('INVALID_UPSTREAM'));assert(await page.locator('#export-button').isDisabled());assert.match(await page.locator('#notice').innerText(),/resultado anterior/);check('Falha visível e exportação desabilitada');
  await search('xss-ui');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='1 contratação');assert.equal(await page.evaluate(()=>window.pwned),undefined);assert.match(await page.locator('.object-text').innerText(),/<img/);check('Marcação da fonte é exibida como texto');
  await search('');await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='64 contratações');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:process.env.COMPRAS_QA_SCREENSHOT_DIR+'/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);const fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(fit.scroll<=fit.width);await page.locator('#filters-button').click();assert(await page.locator('#filters-dialog').isVisible());await page.locator('#filters-dialog .close-dialog').click();check('Celular: controles e painéis sem overflow da página');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:process.env.COMPRAS_QA_SCREENSHOT_DIR+'/mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);check('Sem erros JavaScript não tratados');
  console.log(JSON.stringify({checks:checks.length,passed:checks,errors}));
}finally{await browser.close();await app.close();}
