import { AppError, assert, checkKeys } from '../errors.js';
import { schema } from '../schema.js';
import { plain } from '../adapter.js';
import { QueryService } from '../query-core.js';
import { browserSettings, createBrowserClient } from './client.js';
import { PROTOCOL_VERSION } from './protocol.js';

export { PROTOCOL_VERSION } from './protocol.js';
const methods = ['schema','execute','domains','suggest','details','related','documentDetails','documentRelated','contractChild','export'];
export function errorRecord(error) {
  if (error?.name === 'AbortError') return { name: 'AbortError', code: 'CANCELLED', message: 'Operação cancelada.', status: 499, details: {}, retryable: false };
  if (error instanceof AppError) return { name: error.name, code: error.code, message: error.message, status: error.status, details: plain(error.details), retryable: error.retryable };
  return { name: 'Error', code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação no navegador.', status: 500, details: {}, retryable: true };
}

export function createRuntime(input, options = {}) {
  const config = browserSettings(input), client = createBrowserClient(config, options), service = new QueryService(config, client);
  const controllers = new Map();
  return {
    async run(id, method, payload = {}, onProgress = () => {}) {
      assert(methods.includes(method), 'NOT_FOUND', 'Operação não disponível.');
      assert(typeof id === 'string' && id.length > 0 && id.length <= 128 && !controllers.has(id), 'INVALID_OPERATION', 'Identificador de operação inválido.');
      assert(controllers.size < config.PNCP_MAX_CONCURRENT_OPERATIONS, 'CONCURRENCY_LIMIT', 'Há operações demais em andamento. Tente novamente em instantes.', 429, { retry_after_seconds: 2 }, true);
      const controller = new AbortController(); controllers.set(id, controller);
      const signal = controller.signal;
      try {
        const allowed = {
          schema: [], execute: ['query'], domains: ['type','normatives','field'], suggest: ['type','field','q','size'],
          details: ['document','page','size'], related: ['document','resource','page','size'],
          documentDetails: ['document'], documentRelated: ['document','resource','page','size','pagination_mode'],
          contractChild: ['document','resource','sequence'], export: ['query'],
        };
        checkKeys(payload, allowed[method], 'operação');
        let result;
        switch (method) {
          case 'schema': result = schema(config); break;
          case 'execute': result = await service.execute(payload.query, signal, id); break;
          case 'domains': result = await service.domains(payload.type, payload.normatives, signal, id, payload.field); break;
          case 'suggest': result = await service.suggest(payload.type, payload.field, payload.q, payload.size, signal, id); break;
          case 'details': result = await service.details(payload.document, payload.page, payload.size, signal, id); break;
          case 'related': result = await service.related(payload.document, payload.resource, payload.page, payload.size, signal, id); break;
          case 'documentDetails': result = await service.documentDetails(payload.document, signal, id); break;
          case 'documentRelated': result = await service.documentRelated(payload.document, payload.resource, payload.page, payload.size, signal, id, payload.pagination_mode); break;
          case 'contractChild': result = await service.contractChild(payload.document, payload.resource, payload.sequence, signal, id); break;
          case 'export': {
            const { chunks, metadata } = await service.export(payload.query, signal, id, { onProgress });
            const stamp = metadata.finished_at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
            result = { chunks: chunks.map(c => c.buffer), metadata, mime: 'text/csv; charset=utf-8', filename: `compras-${config.DEMO_MODE ? 'demo' : 'pncp'}-${stamp}.csv` };
            break;
          }
        }
        signal.throwIfAborted(); return method === 'export' ? result : plain(result);
      } finally { controllers.delete(id); }
    },
    cancel(id) { controllers.get(id)?.abort(new DOMException('Operação cancelada.', 'AbortError')); },
    async close() { for (const controller of controllers.values()) controller.abort(new DOMException('Aplicação encerrada.', 'AbortError')); await client.close(); },
  };
}

export function attachWorker(scope, options) {
  let runtime;
  scope.addEventListener('message', async ({ data }) => {
    try {
      if (data.type === 'init') {
        assert(data.version === PROTOCOL_VERSION && !runtime, 'INCOMPATIBLE_VERSION', 'Versão do serviço de navegador incompatível.');
        runtime = createRuntime(data.config, options); scope.postMessage({ id: data.id, result: { version: PROTOCOL_VERSION } }); return;
      }
      assert(runtime, 'NOT_READY', 'Serviço de navegador não inicializado.');
      if (data.type === 'cancel') { runtime.cancel(data.id); return; }
      if (data.type === 'close') { await runtime.close(); return; }
      const result = await runtime.run(data.id, data.method, data.payload, progress => scope.postMessage({ id: data.id, progress }));
      scope.postMessage({ id: data.id, result }, data.method === 'export' ? result.chunks : []);
    } catch (error) { scope.postMessage({ id: data?.id, error: errorRecord(error) }); }
  });
}
