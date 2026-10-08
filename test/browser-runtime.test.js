import { csvBytes } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, errorRecord } from '../src/browser/runtime.js';
import { createWorkerService } from '../src/browser/service.js';
import { browserSettings } from '../src/browser/client.js';
import { defaults } from '../src/settings.js';
import { operation, delay } from '../src/operation.js';
import { service, document, fixture, json } from './helpers.js';
import { demoFetch } from '../src/demo.js';

const settings = extra => ({ PNCP_PAGE_SIZE: 10, PNCP_REQUESTS_PER_SECOND: 100000, PNCP_MAX_RETRIES: 0, ...extra });
const purchase = { type: 'edital', cnpj: '00000000000000', ano: '2026', sequencial: '1' };
const contract = { ...purchase, type: 'contrato' };

test('BROWSER-01: configuração pública rejeita segredos, hosts alternativos e limites inválidos', () => {
  assert.equal(browserSettings({}).DEMO_MODE, false);
  for (const input of [{ HOST: 'localhost' }, { TOKEN: 'secret' }, { PNCP_SEARCH_BASE_URL: 'https://other.example' }, { PNCP_PAGE_SIZE: 1 }, { PNCP_MAX_EXPORT_DOCUMENTS: 10001 }, { DEMO_MODE: 'true' }, { PNCP_MAX_OPERATION_BYTES: 0 }]) assert.throws(() => browserSettings(input), e => ['INVALID_CONFIG','UNKNOWN_FIELD'].includes(e.code));
});

test('BROWSER-02: transporte usa GET simples e nunca presume HTTP em falha de fetch', async () => {
  let options;
  const runtime = createRuntime(settings(), { fetcher: async (_url, init) => { options = init; throw new TypeError('Failed to fetch'); } });
  try {
    await assert.rejects(runtime.run('1', 'execute', { query: {} }), e => e.code === 'PNCP_TRANSPORT_ERROR' && e.retryable && !Object.hasOwn(e.details, 'upstream_status'));
    assert.deepEqual({ mode: options.mode, credentials: options.credentials, cache: options.cache, redirect: options.redirect, headers: options.headers }, { mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
  } finally { await runtime.close(); }
});

test('BROWSER-03: identidades, sugestões, paginação e método são validados antes da rede', async () => {
  let calls = 0;
  const runtime = createRuntime(settings(), { fetcher: async () => { calls++; return json({}); } });
  const cases = [['suggest', { type: 'edital', field: 'orgaos', q: 'ab', size: 20 }], ['domains', { type: 'ata', normatives: ['x'] }], ['details', { document: { ...purchase, cnpj: '1' }, page: 1, size: 10 }], ['documentRelated', { document: purchase, resource: 'arquivos', page: 0, size: 10 }], ['contractChild', { document: contract, resource: 'empenhos', sequence: '../1' }], ['execute', { query: { pncp_filters: { srp: 'false' } } }], ['fetch', {}]];
  try { for (let i = 0; i < cases.length; i++) await assert.rejects(runtime.run(String(i), ...cases[i])); assert.equal(calls, 0); }
  finally { await runtime.close(); }
});

test('BROWSER-04: UTF-8 dividido em bytes preserva acentos e números maiores que 2^53', async () => {
  const content = new TextEncoder().encode('{"items":[{"id":"1","document_type":"edital","description":"Licitação — ação","ano":"2026","orgao_cnpj":"00000000000000","numero_sequencial":90071992547409931234,"valor_total_estimado":123456789012345678.123456789}],"total":1}');
  const runtime = createRuntime(settings(), { fetcher: async () => new Response(new ReadableStream({ start(c) { for (const byte of content) c.enqueue(new Uint8Array([byte])); c.close(); } }), { headers: { 'Content-Type': 'application/json' } }) });
  try {
    const result = await runtime.run('1', 'execute', { query: {} });
    assert.equal(result.data[0].objeto_compra, 'Licitação — ação');
    assert.equal(result.data[0]._document.sequencial, '90071992547409931234');
    assert.equal(result.data[0].valor_total_estimado, '123456789012345678.123456789');
    assert.equal(Object.getPrototypeOf(result.data[0]), Object.prototype);
  } finally { await runtime.close(); }
});

test('BROWSER-05: HTTP 204/404 preserva vazio apenas nos recursos permitidos', async () => {
  const runtime = createRuntime(settings(), { fetcher: async () => new Response(null, { status: 404 }) });
  try {
    assert.equal((await runtime.run('1', 'documentRelated', { document: purchase, resource: 'contratos', page: 1, size: 10 })).total, 0);
    for (const resource of ['empenhos','instrumentocobranca']) {
      const result = await runtime.run(`2-${resource}`, 'documentRelated', { document: contract, resource, page: 1, size: 10 });
      assert.equal(result.total, 0);assert.deepEqual(result.data, []);assert.equal(result.has_more, false);assert.equal(result.complete, true);
      await assert.rejects(runtime.run(`child-${resource}`, 'contractChild', { document: contract, resource, sequence: '1' }), e => e.details.upstream_status === 404);
    }
    await assert.rejects(runtime.run('3', 'documentDetails', { document: contract }), e => e.details.upstream_status === 404);
  } finally { await runtime.close(); }
  const empty = createRuntime(settings(), { fetcher: async () => new Response(null, { status: 204 }) });
  try {
    await assert.rejects(empty.run('4', 'execute', { query: {} }), e => e.code === 'INVALID_UPSTREAM');
    assert.equal((await empty.run('5', 'documentRelated', { document: contract, resource: 'empenhos', page: 1, size: 10 })).total, 0);
  } finally { await empty.close(); }
});

test('BROWSER-18: RPC preserva total desconhecido e paginação até vazio no histórico do contrato',async()=>{
  const runtime=createRuntime(settings(),{fetcher:async url=>{const u=new URL(url);return json(u.pathname.endsWith('/quantidade')?20:Number(u.searchParams.get('pagina'))===1?[{tipoLogManutencaoNome:'Evento'}]:[]);}});
  try {
    const first=await runtime.run('1','documentRelated',{document:contract,resource:'historico',page:1,size:10});assert.equal(first.total,null);assert.equal(first.total_pages,null);assert.equal(first.has_more,true);assert.equal(first.complete,false);
    const last=await runtime.run('2','documentRelated',{document:contract,resource:'historico',page:2,size:10,pagination_mode:'until_empty'});assert.deepEqual(last.data,[]);assert.equal(last.total,null);assert.equal(last.has_more,false);assert.equal(last.complete,true);
    await assert.rejects(runtime.run('3','documentRelated',{document:contract,resource:'arquivos',page:1,size:10,pagination_mode:'until_empty'}),e=>e.code==='INVALID_PAGINATION');
  }finally{await runtime.close();}
});

test('BROWSER-06: 429, 503, JSON inválido e orçamento de leitura não viram listas vazias', async () => {
  for (const status of [429,503]) {
    const runtime = createRuntime(settings(), { fetcher: async () => new Response(null, { status, headers: { 'Retry-After': '2' } }) });
    try { await assert.rejects(runtime.run('1', 'execute', { query: {} }), e => e.code === 'PNCP_UNAVAILABLE' && e.details.upstream_status === status && e.details.retry_after_seconds === 2); }
    finally { await runtime.close(); }
  }
  for (const [response, limit, code] of [[new Response('invalid', { headers: { 'Content-Type': 'application/json' } }), 100, 'INVALID_UPSTREAM'], [json({ items: [document(1)], total: 1 }), 10, 'OPERATION_BYTES_LIMIT']]) {
    const runtime = createRuntime(settings({ PNCP_MAX_OPERATION_BYTES: limit }), { fetcher: async () => response });
    try { await assert.rejects(runtime.run('1', 'execute', { query: {} }), e => e.code === code); }
    finally { await runtime.close(); }
  }
});

test('BROWSER-07: CSV transferível coincide byte a byte com o núcleo nos três tipos e não envia documentos', async () => {
  for (const type of ['edital','ata','contrato']) {
    const input = { document_type: type, q: '', pncp_filters: {} }, progress = [];
    const runtime = createRuntime(settings({ DEMO_MODE: true }));
    const core = service([], { handler: (url, _n, init) => demoFetch(url.href, init) }, { DEMO_MODE: true });
    try {
      const result = await runtime.run('1', 'export', { query: input }, p => progress.push(p));
      const reference = await core.service.export(input);
      assert.deepEqual(Buffer.concat(result.chunks.map(b => Buffer.from(b))), csvBytes(reference));
      assert.equal(Object.hasOwn(result.metadata, 'data'), false);
      assert.equal(result.metadata.exported_rows, reference.metadata.exported_rows);
      assert.equal(result.metadata.snapshot_guaranteed, false);
      assert.equal(progress.at(-1).rows, result.metadata.exported_rows);
      assert.equal(progress.at(-1).bytes, csvBytes(reference).byteLength);
    } finally { await runtime.close(); await core.client.close(); }
  }
});

test('BROWSER-08: exportação rejeita duplicação, mudança de total e limite de CSV', async () => {
  for (const scenario of ['duplicate','total','bytes']) {
    const fake = fixture(Array.from({ length: 11 }, (_, i) => document(i + 1)), { handler: url => {
      if (url.searchParams.get('pagina') !== '2') return;
      return json({ items: [document(scenario === 'duplicate' ? 1 : 11)], total: scenario === 'total' ? 12 : 11 });
    } });
    const runtime = createRuntime(settings(scenario === 'bytes' ? { PNCP_MAX_EXPORT_BYTES: 100 } : {}), fake);
    try { await assert.rejects(runtime.run('1', 'export', { query: {} }), e => e.code === (scenario === 'bytes' ? 'EXPORT_BYTES_LIMIT' : 'SOURCE_CHANGED')); }
    finally { await runtime.close(); }
  }
});

test('BROWSER-09: cancelamento em leitura libera fila e operações, sem cancelar a pesquisa seguinte', async () => {
  let cancelled = false, calls = 0;
  const runtime = createRuntime(settings({ PNCP_MAX_CONCURRENT_REQUESTS: 1 }), { fetcher: async () => {
    calls++;
    if (calls === 1) return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } });
    return json({ items: [], total: 0 });
  } });
  try {
    const first = runtime.run('1', 'execute', { query: {} }); const firstCheck = assert.rejects(first, e => e.name === 'AbortError');
    await delay(10); const queued = runtime.run('2', 'execute', { query: {} }); const queuedCheck = assert.rejects(queued, e => e.name === 'AbortError');
    runtime.cancel('2'); runtime.cancel('1'); await Promise.all([firstCheck, queuedCheck]);
    assert.equal(cancelled, true); assert.equal(calls, 1);
    assert.equal((await runtime.run('3', 'execute', { query: {} })).total, 0);
  } finally { await runtime.close(); }
});

test('BROWSER-10: limite de operações recupera após cancelamento e prazo absoluto é conferido', async () => {
  const runtime = createRuntime(settings({ PNCP_MAX_CONCURRENT_OPERATIONS: 1 }), { fetcher: async (_url, { signal }) => { await delay(10000, signal); return json({ items: [], total: 0 }); } });
  const first = runtime.run('1', 'execute', { query: {} }); const aborted = assert.rejects(first, e => e.name === 'AbortError');
  try { await assert.rejects(runtime.run('2', 'schema'), e => e.code === 'CONCURRENCY_LIMIT'); runtime.cancel('1'); await aborted; assert((await runtime.run('3', 'schema')).columns.length); }
  finally { await runtime.close(); }
  const op = operation(defaults); op.deadline = Date.now() - 1;
  try { assert.throws(() => op.check(), e => e.code === 'OPERATION_TIMEOUT'); } finally { op.finish(); }
});

class FakeWorker extends EventTarget {
  sent = []; terminated = false;
  postMessage(message) { this.sent.push(message); if (message.type === 'init') queueMicrotask(() => this.reply(message.id, { version: message.version })); }
  reply(id, result) { this.dispatchEvent(new MessageEvent('message', { data: { id, result } })); }
  terminate() { this.terminated = true; }
}
test('BROWSER-11: RPC resolve fora de ordem, descarta resposta cancelada e reinicia após falha', async () => {
  const workers = [];
  const bridge = createWorkerService({}, { workerFactory: () => { const w = new FakeWorker(); workers.push(w); return w; } });
  try {
    const one = bridge.call('execute', { query: { q: '1' } }), two = bridge.call('execute', { query: { q: '2' } });
    await delay(0); const worker = workers[0], [first, second] = worker.sent.filter(m => m.method);
    worker.reply(second.id, 'second'); worker.reply(first.id, 'first'); assert.deepEqual(await Promise.all([one,two]), ['first','second']);
    const controller = new AbortController(), cancel = bridge.call('export', {}, { signal: controller.signal }); const rejected = assert.rejects(cancel, e => e.name === 'AbortError');
    await delay(0); const last = worker.sent.at(-1); controller.abort(); await rejected; worker.reply(last.id, 'late');
    assert.equal(worker.sent.at(-1).type, 'cancel');
    const pending = bridge.call('execute', {}); const failed = assert.rejects(pending, e => e.code === 'WORKER_UNAVAILABLE'); await delay(0);
    worker.dispatchEvent(new Event('error')); await failed; assert(worker.terminated);
    const recovered = bridge.call('schema'); await delay(0); workers[1].reply(workers[1].sent.at(-1).id, { recovered: true }); assert.deepEqual(await recovered, { recovered: true });
  } finally { bridge.close(); }
});

test('BROWSER-12: erros inesperados não expõem diagnóstico interno pela ponte', () => {
  assert.equal(errorRecord(new Error('private URL/token')).message.includes('private'), false);
  assert.equal(errorRecord(new DOMException('cancel','AbortError')).name, 'AbortError');
});

test('BROWSER-13: CSV preserva aspas, CRLF e acentos no limite exato de bytes', async () => {
  const records = [document(1, { description: 'Aquisição "ação"\r\nSão Paulo', valor_total_estimado: '9007199254740993.00000000001' })];
  const core = service(records);
  try {
    const csv = csvBytes(await core.service.export({}));
    for (const difference of [0,-1]) {
      const runtime = createRuntime(settings({ PNCP_MAX_EXPORT_BYTES: csv.byteLength + difference }), fixture(records));
      try {
        if(difference) await assert.rejects(runtime.run('1','export',{query:{}}),e=>e.code==='EXPORT_BYTES_LIMIT');
        else {
          const result=await runtime.run('1','export',{query:{}}),bytes=Buffer.concat(result.chunks.map(b=>Buffer.from(b)));
          assert.deepEqual(bytes,csv);assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf');assert.match(bytes.toString(),/Aquisição ""ação""\r\nSão Paulo/);
        }
      }finally{await runtime.close();}
    }
  }finally{await core.client.close();}
});

test('BROWSER-14: cancelar CSV no progresso impede páginas seguintes e permite reutilizar o Worker', async () => {
  const fake=fixture(Array.from({length:100},(_,i)=>document(i+1))),runtime=createRuntime(settings(),fake);let progress=0;
  try {
    await assert.rejects(runtime.run('1','export',{query:{}},()=>{progress++;runtime.cancel('1');}),e=>e.name==='AbortError');
    assert.equal(progress,1);assert.equal(fake.requests.length,1);
    assert.equal((await runtime.run('2','execute',{query:{}})).data.length,10);
  }finally{await runtime.close();}
});

test('BROWSER-15: resposta opaca é erro de transporte e timeout interrompe leitura pendente', async () => {
  const opaque=createRuntime(settings(),{fetcher:async()=>({status:0,type:'opaqueredirect'})});
  try {await assert.rejects(opaque.run('1','execute',{query:{}}),e=>e.code==='PNCP_TRANSPORT_ERROR' && !e.details.upstream_status);}
  finally{await opaque.close();}
  let cancelled=false;
  const timed=createRuntime(settings({PNCP_READ_TIMEOUT_SECONDS:1}),{fetcher:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}})});
  try {await assert.rejects(timed.run('1','execute',{query:{}}),e=>e.code==='PNCP_TIMEOUT');assert(cancelled);}
  finally{await timed.close();}
});

test('BROWSER-16: nova tentativa e orçamento de chamadas compartilham o mesmo cliente', async () => {
  let calls=0;
  const runtime=createRuntime(settings({PNCP_MAX_RETRIES:1}),{fetcher:async()=>++calls===1?new Response(null,{status:503}):json({items:[],total:0})});
  try{assert.equal((await runtime.run('1','execute',{query:{}})).upstream_requests,2);}
  finally{await runtime.close();}
  const fake=fixture(Array.from({length:11},(_,i)=>document(i+1))),limited=createRuntime(settings({PNCP_MAX_REQUESTS_PER_OPERATION:1}),fake);
  try {await assert.rejects(limited.run('1','export',{query:{}}),e=>e.code==='REQUEST_BUDGET');assert.equal(fake.requests.length,1);}
  finally{await limited.close();}
});

test('BROWSER-17: inicialização expirada rejeita chamadas e versões incompatíveis encerram o Worker', async () => {
  const worker=new FakeWorker();worker.postMessage=m=>worker.sent.push(m);
  const timeout=createWorkerService({}, {workerFactory:()=>worker,startupTimeout:5});
  try {await assert.rejects(timeout.call('schema'),e=>e.code==='WORKER_TIMEOUT');assert(worker.terminated);}
  finally{timeout.close();}
  const incompatible=new FakeWorker();incompatible.postMessage=m=>queueMicrotask(()=>incompatible.reply(m.id,{version:99}));
  const bridge=createWorkerService({}, {workerFactory:()=>incompatible});
  try {await assert.rejects(bridge.call('schema'),/Versão do Worker/);assert(incompatible.terminated);}
  finally{bridge.close();}
  const closing=createWorkerService({}, {workerFactory:()=>new FakeWorker()});await delay(0);
  const pending=closing.call('schema'),aborted=assert.rejects(pending,e=>e.name==='AbortError');closing.close();await aborted;
});
