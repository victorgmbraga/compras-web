import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/server.js';
import { startDevelopment } from '../scripts/dev.js';
import { config } from './helpers.js';

async function listen(app) {
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

test('RELOAD-01: produção mantém HTML original e não expõe os endpoints de desenvolvimento',async t=>{
  const app=createApplication(config({DEMO_MODE:true})),base=await listen(app);t.after(()=>app.close());
  const response=await fetch(base),html=await response.text();
  assert(!html.includes('/__dev/'));assert.equal(Number(response.headers.get('content-length')),Buffer.byteLength(html));
  for(const route of ['/__dev/reload.js','/__dev/events']) {
    const response=await fetch(base+route);assert.equal(response.status,404);await response.arrayBuffer();
  }
});

test('RELOAD-02: HTML e stream usam a mesma versão, que muda após reiniciar a aplicação',async()=>{
  const versions=[];
  for(let run=0;run<2;run++) {
    const app=createApplication(config({DEMO_MODE:true}),{liveReload:true}),base=await listen(app);
    try {
      const response=await fetch(base),html=await response.text();
      const path=html.match(/src="(\/__dev\/reload\.js\?version=[^"]+)"/)[1];
      const version=new URL(path,base).searchParams.get('version');versions.push(version);
      assert.equal(Number(response.headers.get('content-length')),Buffer.byteLength(html));
      const script=await fetch(base+path);assert.equal(script.status,200);assert.match(await script.text(),/EventSource/);
      const head=await fetch(base,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
      const events=await fetch(base+'/__dev/events');
      assert.equal(events.headers.get('content-type'),'text/event-stream');
      const reader=events.body.getReader(),chunk=await reader.read();
      assert.match(Buffer.from(chunk.value).toString(),new RegExp(`event: ready\\ndata: .*${version}`));
      await reader.cancel();
    }finally{await app.close();}
  }
  assert.notEqual(versions[0],versions[1]);
});

test('RELOAD-03: navegador recarrega após nova versão, inclusive após erro de conexão',async()=>{
  let events,reloads=0,closed=0;const listeners={};
  class EventSource {
    constructor(path){assert.equal(path,'/__dev/events');events=this;this.listeners={};}
    addEventListener(name,callback){this.listeners[name]=callback;}close(){closed++;}
  }
  const source=await readFile(new URL('../public/dev-reload.js',import.meta.url),'utf8');
  vm.runInNewContext(source,{URL,EventSource,document:{currentScript:{src:'http://localhost/__dev/reload.js?version=original'}},window:{location:{reload(){reloads++;}},addEventListener(name,callback){listeners[name]=callback;}}});
  events.listeners.ready({data:JSON.stringify({version:'original'})});assert.equal(reloads,0);
  // EventSource mantém a reconexão automática; a nova versão chega após o reinício.
  events.listeners.ready({data:JSON.stringify({version:'restarted'})});assert.equal(reloads,1);assert.equal(closed,1);
  listeners.pagehide();assert.equal(closed,2);
});

test('RELOAD-04: supervisor observa frontend, fonte aninhada e relê a .env',async()=>{
  const root=await mkdtemp(join(tmpdir(),'compras-hot-reload-'));
  let dev;
  try {
    await mkdir(join(root,'src','nested'),{recursive:true});await mkdir(join(root,'public'));
    await writeFile(join(root,'public','styles.css'),'body {}');
    await writeFile(join(root,'src','nested','data.json'),'{}');
    await writeFile(join(root,'.env'),'COMPRAS_DEV_TEST_VALUE=before\n');
    await writeFile(join(root,'src','server.js'),`const http=require('node:http');const version=require('node:crypto').randomUUID();http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version,value:process.env.COMPRAS_DEV_TEST_VALUE}));}).listen(Number(process.argv.at(-1)),'127.0.0.1');`);
    const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
    const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    dev=startDevelopment({root,args:['--port',String(port)],stdio:'ignore'});
    async function changedVersion(previous) {
      const deadline=Date.now()+8000;
      while(Date.now()<deadline) {
        try {const response=await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(500)}),body=await response.json();if(body.version!==previous)return body;}catch{}
        await delay(50);
      }
      assert.fail('O servidor não iniciou ou não reiniciou após a mudança.');
    }
    let current=await changedVersion(null);assert.equal(current.value,'before');
    await writeFile(join(root,'public','styles.css'),'body { color: red; }');current=await changedVersion(current.version);
    await writeFile(join(root,'src','nested','data.json'),'{"changed":true}');current=await changedVersion(current.version);
    await writeFile(join(root,'.env'),'COMPRAS_DEV_TEST_VALUE=after\n');current=await changedVersion(current.version);
    assert.equal(current.value,'after');
  }finally {
    await dev?.close();
    // mkdtemp criou este diretório exclusivamente para o teste, dentro de tmpdir.
    assert(root.startsWith(join(tmpdir(),'compras-hot-reload-')));
    await rm(root,{recursive:true,force:true});
  }
});
