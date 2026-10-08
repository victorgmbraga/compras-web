import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const baseline=JSON.parse(await readFile(new URL('./layout-baseline.json',import.meta.url),'utf8'));
const normalizeFonts=styles=>Object.fromEntries(Object.entries(styles).map(([selector,style])=>[selector,{...style,fontFamily:style.fontFamily.replace(/["']/g,'')}]));

async function snapshot(page) {
  await page.locator('.tabulator-row').first().waitFor();
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const selectors = ['#app-header', '.search-field', '#search-button', '#results-table', '.tabulator-header', '.tabulator-col', '.tabulator-col-content', '.tabulator-col-title', '.tabulator-row', '.tabulator-row-even', '.tabulator-cell', '.tabulator-footer', '.tabulator-footer-contents', '.tabulator-page-counter', '.tabulator-paginator', '.tabulator-page', '.tabulator-page.active'];
    const properties = ['backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'borderTopColor', 'borderTopWidth', 'borderBottomColor', 'borderBottomWidth', 'borderRightColor', 'borderRightWidth', 'borderRadius', 'display', 'gap', 'minHeight'];
    return Object.fromEntries(selectors.map(selector => {
      const node = document.querySelector(selector), style = getComputedStyle(node);
      // Metadata text includes independently measured durations, so compare its
      // typography/padding rather than its intrinsic text width.
      return [selector, { ...Object.fromEntries(properties.map(key => [key, style[key]])) }];
    }));
  });
}

// Recorded visual baseline: application colors, spacing and table typography.
// Intrinsic heights depend on row content, fonts and browser, so only CSS is fixed.
export async function assertBrowserLayout(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    for (const [type, title] of [['edital','64 contratações'], ['ata','24 atas'], ['contrato','32 contratos']]) {
      if (await page.locator('#document-type').inputValue() !== type) await page.locator('#document-type').selectOption(type);
      await page.waitForFunction(title => document.querySelector('#result-title').textContent === title, title);
      for (const viewport of [{width:1440,height:1000}, {width:1068,height:630}, {width:390,height:844}]) {
        await page.setViewportSize(viewport);
        const expected=Object.fromEntries(Object.entries(baseline.styles).map(([selector,style])=>[selector,{...style,...baseline.viewport_overrides[viewport.width][selector]}]));
        // Browsers serialize quoted family names differently in computed CSS.
        assert.deepEqual(normalizeFonts(await snapshot(page)), normalizeFonts(expected), `Layout ${type} em ${viewport.width}px difere da referência visual`);
      }
    }
    console.log('PASS Layout estático preserva cores, espaçamento e tipografia: três tipos e três tamanhos de tela');
  } finally { await page.close(); }
}
