import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Only files: deliberately no API, proxy, SPA fallback or response interception.
export function createStaticServer(directory, prefix = '/') {
  const root = path.resolve(fileURLToPath(directory));
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain' };
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!['GET','HEAD'].includes(req.method) || !pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
      const relative = pathname.slice(prefix.length) || 'index.html';
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(root + path.sep)) { res.writeHead(404); res.end(); return; }
      const bytes = await readFile(filename);
      res.writeHead(200, { 'Content-Type': (mime[path.extname(filename)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  return { server, close: () => new Promise(resolve => server.close(resolve)) };
}
