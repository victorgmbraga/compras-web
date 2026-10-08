import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { browserSettings } from './src/browser/client.js';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://pncp.gov.br; worker-src 'self'; object-src 'none'; base-uri 'self'";
const headers = { 'Content-Security-Policy': csp + "; frame-ancestors 'self'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

export default defineConfig(({ mode }) => {
  const config = async () => {
    const input = JSON.parse(await readFile(new URL('./public/browser-config.json', import.meta.url), 'utf8'));
    const publicConfig = mode === 'test' ? { ...input, DEMO_MODE: true, PNCP_REQUESTS_PER_SECOND: 100000 } : mode === 'demo' ? { ...input, DEMO_MODE: true } : input;
    browserSettings(publicConfig); return JSON.stringify(publicConfig, null, 2) + '\n';
  };
  return {
    root, publicDir: false, envDir: false, base: './',
    server: { host: '127.0.0.1', port: 8000, headers, fs: { allow: [fileURLToPath(new URL('./', import.meta.url))] } },
    preview: { host: '127.0.0.1', port: 8000, headers },
    worker: { format: 'es', plugins: () => mode === 'test' ? [{
      name: 'controlled-worker-fixtures',
      load(id) {
        if (id === fileURLToPath(new URL('./src/browser/worker.js', import.meta.url))) {
          return `import { attachWorker } from './runtime.js';\nimport { uiDemoFetch } from ${JSON.stringify(fileURLToPath(new URL('./test/browser-fixtures.js', import.meta.url)))};\nattachWorker(globalThis, { demoFetcher: uiDemoFetch });`;
        }
      },
    }] : [] },
    build: { outDir: mode === 'test' ? '../dist-browser-test' : '../dist-browser', emptyOutDir: true, target: ['es2022'], rolldownOptions: {
      input: { index: root + 'index.html', diagnostic: root + 'pncp-diagnostic.html' },
    } },
    plugins: [{
      name: 'compras-static-assets',
      transformIndexHtml: { order: 'pre', handler(html) {
        return html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`)
          .replace(/<script src="\/vendor\/tabulator.min.js" defer><\/script>/, '')
          .replace(/<link rel="stylesheet" href="\/vendor\/tabulator.min.css">/, '')
          .replace('src="/node-entry.js"', 'src="/browser-entry.js"').replace('href="/"', 'href="./"');
      } },
      configureServer(server) {
        server.middlewares.use('/browser-config.json', async (_req, res) => {
          try { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(await config()); }
          catch (error) { res.statusCode = 500; res.end('Configuração pública inválida.'); }
        });
      },
      async generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'browser-config.json', source: await config() });
        this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.md', source: await readFile(new URL('./THIRD_PARTY_LICENSES.md', import.meta.url), 'utf8') });
        this.emitFile({ type: 'asset', fileName: '_headers', source: '/*\n' + Object.entries(headers).map(([name, value]) => `  ${name}: ${value}\n`).join('') + '  Cache-Control: no-cache\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n' });
      },
    }],
  };
});
