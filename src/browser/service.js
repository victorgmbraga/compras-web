import { PROTOCOL_VERSION } from './protocol.js';

export function createWorkerService(config, { workerFactory = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), startupTimeout = 15000 } = {}) {
  let worker, ready, failed = false, disposed = false, serial = 0;
  const pending = new Map();
  function failure(error) {
    failed = true; worker?.terminate();
    for (const task of pending.values()) { task.cleanup(); task.reject(error); }
    pending.clear();
  }
  function send(message, options = {}) {
    const id = String(++serial);
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (!pending.has(id)) return;
        pending.delete(id); cleanup();
        try { worker.postMessage({ type: 'cancel', id }); } catch {}
        finally { reject(new DOMException('Operação cancelada.', 'AbortError')); }
      };
      const cleanup = () => options.signal?.removeEventListener('abort', abort);
      if (options.signal?.aborted) { reject(new DOMException('Operação cancelada.', 'AbortError')); return; }
      pending.set(id, { resolve, reject, cleanup, onProgress: options.onProgress });
      options.signal?.addEventListener('abort', abort, { once: true });
      try { worker.postMessage({ ...message, id }); }
      catch (error) { pending.delete(id); cleanup(); reject(error); }
    });
  }
  function start() {
    failed = false; const instance = workerFactory(); worker = instance;
    instance.addEventListener('message', ({ data }) => {
      if (worker !== instance) return;
      const task = pending.get(data.id); if (!task) return;
      if (data.progress) { task.onProgress?.(data.progress); return; }
      pending.delete(data.id); task.cleanup();
      if (data.error) { const error = Object.assign(new Error(data.error.message), data.error); task.reject(error); }
      else task.resolve(data.result);
    });
    const unavailable = event => { if (worker !== instance) return; event.preventDefault?.(); failure(Object.assign(new Error('O serviço de navegador foi interrompido. Tente novamente.'), { code: 'WORKER_UNAVAILABLE', retryable: true })); };
    instance.addEventListener('error', unavailable); instance.addEventListener('messageerror', unavailable);
    const timer = setTimeout(() => failure(Object.assign(new Error('Tempo de inicialização do navegador esgotado.'), { code: 'WORKER_TIMEOUT' })), startupTimeout);
    ready = send({ type: 'init', config, version: PROTOCOL_VERSION }).then(result => {
      if (result.version !== PROTOCOL_VERSION) throw new Error('Versão do Worker incompatível.');
    }).catch(error => { if (worker === instance) failure(error); throw error; }).finally(() => clearTimeout(timer));
    ready.catch(() => {});
  }
  start();
  return {
    async call(method, payload = {}, options = {}) {
      if (disposed) throw new Error('Aplicação encerrada.');
      if (failed) start(); await ready;
      if (disposed) throw new DOMException('Aplicação encerrada.', 'AbortError');
      if (options.signal?.aborted) throw new DOMException('Operação cancelada.', 'AbortError');
      return send({ method, payload }, options);
    },
    close() { disposed = true; failure(new DOMException('Aplicação encerrada.', 'AbortError')); },
  };
}
