import { AppError } from './errors.js';

export const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const cleanup = () => signal?.removeEventListener('abort', abort);
  const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
  const abort = () => { clearTimeout(timer); cleanup(); reject(signal.reason); };
  signal?.addEventListener('abort', abort, { once: true });
});
export function operation(config, parentSignal, requestId = globalThis.crypto.randomUUID()) {
  const controller = new AbortController();
  const started = Date.now();
  const timeout = setTimeout(() => controller.abort(new AppError('OPERATION_TIMEOUT', 'Tempo total da operação esgotado. Delimite a pesquisa.', 504, {}, true)), config.PNCP_OPERATION_TIMEOUT_SECONDS * 1000);
  const abort = () => controller.abort(parentSignal.reason || new AppError('CANCELLED', 'Operação cancelada.', 499));
  if (parentSignal?.aborted) abort(); else parentSignal?.addEventListener('abort', abort, { once: true });
  return { id: requestId, started, started_at: new Date(started).toISOString(), signal: controller.signal, deadline: started + config.PNCP_OPERATION_TIMEOUT_SECONDS * 1000, requests: 0, bytes: 0, itemCount: 0,
    check() { if (Date.now() >= this.deadline && !controller.signal.aborted) controller.abort(new AppError('OPERATION_TIMEOUT', 'Tempo total da operação esgotado. Delimite a pesquisa.', 504, {}, true)); if (controller.signal.aborted) throw controller.signal.reason; },
    finish() { clearTimeout(timeout); parentSignal?.removeEventListener('abort', abort); },
  };
}
