import assert from 'node:assert/strict';
import { createApplication } from '../src/server.js';
import { loadConfig } from '../src/config.js';

async function snapshot(page) {
  await page.locator('.tabulator-row').first().waitFor();
  return page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const selectors = ['#app-header', '.search-field', '#search-button', '#results-table', '.tabulator-header', '.tabulator-col', '.tabulator-col-content', '.tabulator-col-title', '.tabulator-row', '.tabulator-row-even', '.tabulator-cell', '.tabulator-footer', '.tabulator-footer-contents', '.tabulator-page-counter', '.tabulator-paginator', '.tabulator-page', '.tabulator-page.active'];
    const properties = ['backgroundColor', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'borderTopColor', 'borderTopWidth', 'borderBottomColor', 'borderBottomWidth', 'borderRightColor', 'borderRightWidth', 'borderRadius', 'display', 'gap', 'minHeight'];
    return Object.fromEntries(selectors.map(selector => {
      const node = document.querySelector(selector), style = getComputedStyle(node), rect = node.getBoundingClientRect();
      // Metadata text includes independently measured durations, so compare its
      // typography/padding rather than its intrinsic text width.
      return [selector, { ...Object.fromEntries(properties.map(key => [key, style[key]])), height: Math.round(rect.height * 100) / 100 }];
    }));
  });
}

export async function compareBrowserLayout(browser, url) {
  const node = createApplication({ ...loadConfig({}), DEMO_MODE: true, PNCP_REQUESTS_PER_SECOND: 100000 });
  await new Promise(resolve => node.server.listen(0, '127.0.0.1', resolve));
  const reference = await browser.newPage(), actual = await browser.newPage();
  try {
    await Promise.all([reference.goto(`http://127.0.0.1:${node.server.address().port}/`), actual.goto(url)]);
    for (const page of [reference, actual]) await page.waitForFunction(() => document.querySelector('#result-title').textContent === '64 contratações');
    for (const [type, title] of [['edital','64 contratações'], ['ata','24 atas'], ['contrato','32 contratos']]) {
      for (const page of [reference, actual]) {
        if (await page.locator('#document-type').inputValue() !== type) await page.locator('#document-type').selectOption(type);
        await page.waitForFunction(title => document.querySelector('#result-title').textContent === title, title);
      }
      for (const viewport of [{width:1440,height:1000}, {width:1068,height:630}, {width:390,height:844}]) {
        await Promise.all([reference.setViewportSize(viewport), actual.setViewportSize(viewport)]);
        const [expected, result] = await Promise.all([snapshot(reference), snapshot(actual)]);
        assert.deepEqual(result, expected, `Layout ${type} em ${viewport.width}px difere da versão Node.js`);
      }
    }
    console.log('PASS Layout estático igual ao Node.js: três tipos, desktop e telas menores');
  } finally { await reference.close(); await actual.close(); await node.close(); }
}
