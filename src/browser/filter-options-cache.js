import { assert } from '../errors.js';

export const FILTER_OPTIONS_TTL = 4 * 60 * 60 * 1000;
export const FILTER_OPTIONS_PREFIX = 'contratos-web:filter-options:v1:';

function normalizeResult(result) {
  const filters = result?.filters;
  assert(filters && typeof filters === 'object' && !Array.isArray(filters) && Object.keys(filters).length > 0, 'INVALID_UPSTREAM', 'O PNCP não forneceu listas válidas de opções.');
  for (const options of Object.values(filters)) {
    assert(Array.isArray(options) && options.every(option => option && typeof option.id === 'string' && option.id !== '' && typeof option.label === 'string' && (option.active === undefined || typeof option.active === 'boolean')), 'INVALID_UPSTREAM', 'Opções de filtro inválidas.');
  }
  const warnings = result.warnings ?? [], partial = result.partial_domains ?? [];
  assert(Array.isArray(warnings) && warnings.every(warning => warning && typeof warning.message === 'string') && Array.isArray(partial) && partial.every(name => typeof name === 'string') && (result.domain_source === undefined || typeof result.domain_source === 'string'), 'INVALID_UPSTREAM', 'Metadados de opções inválidos.');
  // Keep only normalized lists and presentation metadata, not duplicate raw responses.
  return structuredClone({ filters, warnings, partial_domains: partial, ...(result.domain_source ? { domain_source: result.domain_source } : {}) });
}

function waitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export function createFilterOptionsCache(service, schema, { getStorage = () => globalThis.localStorage, now = Date.now } = {}) {
  let storage;
  try { storage = getStorage(); } catch { /* Storage may be blocked by the browser. */ }
  const prefix = `${FILTER_OPTIONS_PREFIX}${schema.source}:${schema.api_version}:`;
  const memory = new Map(), pending = new Map(), queue = [], controller = new AbortController();
  let active = false;

  function describe({ type, field = null, normatives }) {
    assert(schema.document_types.some(document => document.enabled && document.id === type), 'INVALID_DOMAIN', 'Tipo de documento inválido para opções.');
    const cap = field === null ? null : schema.capabilities.find(capability => capability.name === field && capability.domain && capability.documents.includes(type) && !capability.reserved);
    assert(field === null || cap, 'INVALID_DOMAIN', 'Filtro incompatível com o documento.');
    const provider = cap?.domain_source ?? 'search';
    const dependent = provider === 'search' && (field === null || field === 'amparos_legais');
    assert(normatives === undefined || Array.isArray(normatives) && normatives.every(id => typeof id === 'string' && /^\d+$/.test(id)), 'INVALID_DOMAIN', 'Normativos inválidos.');
    const selected = dependent ? [...new Set(normatives ?? [])].sort() : [];
    const key = prefix + encodeURIComponent(JSON.stringify(provider === 'search' ? [provider, type, selected] : [provider, field]));
    return { key, payload: { type, field: provider === 'search' ? selected.length ? 'amparos_legais' : null : field, ...(selected.length ? { normatives: selected } : {}) } };
  }

  function discard(key) {
    memory.delete(key);
    try { storage?.removeItem(key); } catch { /* An in-memory cache still works. */ }
  }
  function read(key) {
    let entry = memory.get(key);
    if (!entry) {
      try { const text = storage?.getItem(key); if (text) entry = JSON.parse(text); }
      catch { discard(key); return null; }
    }
    if (!entry) return null;
    try {
      const time = now();
      assert(entry.version === 1 && Number.isSafeInteger(entry.fetched_at) && entry.fetched_at >= 0 && entry.fetched_at <= time && entry.expires_at === entry.fetched_at + FILTER_OPTIONS_TTL && time < entry.expires_at, 'EXPIRED_OPTIONS', 'Opções expiradas.');
      const value = normalizeResult(entry.value);
      memory.set(key, entry);
      return value;
    } catch { discard(key); return null; }
  }
  function pump() {
    if (active || !queue.length || controller.signal.aborted) return;
    active = true;
    const job = queue.shift();
    Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { active = false; pump(); });
  }
  function load(key, payload) {
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise((resolve, reject) => {
      queue.push({ resolve, reject, async run() {
        controller.signal.throwIfAborted();
        const value = normalizeResult(await service.call('domains', payload, { signal: controller.signal }));
        controller.signal.throwIfAborted();
        const fetched = now(), entry = { version: 1, fetched_at: fetched, expires_at: fetched + FILTER_OPTIONS_TTL, value };
        memory.set(key, entry);
        try { storage?.setItem(key, JSON.stringify(entry)); } catch { /* Quota or unavailable storage must not break filters. */ }
        return value;
      } });
    }).finally(() => pending.delete(key));
    pending.set(key, promise); pump();
    return promise;
  }
  async function get(payload, { signal } = {}) {
    signal?.throwIfAborted(); controller.signal.throwIfAborted();
    const { key, payload: request } = describe(payload), cached = read(key);
    const value = cached ?? await waitFor(load(key, request), signal);
    signal?.throwIfAborted();
    return structuredClone(value);
  }
  function preload() {
    const documents = schema.document_types.filter(document => document.enabled);
    const requests = documents.map(document => ({ type: document.id }));
    for (const cap of schema.capabilities.filter(cap => cap.domain && !cap.reserved && ['catalog', 'reference'].includes(cap.domain_source))) {
      const document = documents.find(document => cap.documents.includes(document.id));
      if (document) requests.push({ type: document.id, field: cap.name });
    }
    return Promise.allSettled(requests.map(request => get(request)));
  }
  function close() {
    controller.abort(new DOMException('Carregamento de opções encerrado.', 'AbortError'));
    for (const job of queue.splice(0)) job.reject(controller.signal.reason);
  }
  return { get, preload, close };
}
