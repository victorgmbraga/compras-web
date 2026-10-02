import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function createDevReload() {
  const version=randomUUID(),clients=new Set();
  return {
    inject(html) {
      return Buffer.from(html.toString('utf8').replace('</head>',`<script src="/__dev/reload.js?version=${version}" defer></script></head>`));
    },
    async handle(req,res,url) {
      if(req.method!=='GET' && req.method!=='HEAD')return false;
      if(url.pathname==='/__dev/reload.js') {
        const bytes=await readFile(new URL('../public/dev-reload.js',import.meta.url));
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Content-Length':bytes.length});
        res.end(req.method==='HEAD'?undefined:bytes);return true;
      }
      if(url.pathname!=='/__dev/events' || req.method!=='GET')return false;
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
      res.write(`retry: 300\nevent: ready\ndata: ${JSON.stringify({version})}\n\n`);
      clients.add(res);
      const heartbeat=setInterval(()=>res.write(': keep-alive\n\n'),15000);heartbeat.unref();
      res.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});
      return true;
    },
    close() {for(const client of clients)client.end();clients.clear();},
  };
}
