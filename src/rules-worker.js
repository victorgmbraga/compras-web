import { parentPort, workerData } from 'node:worker_threads';
import { applyRules, compileRegex } from './rules.js';
try {
  const result = workerData.validateOnly ? (workerData.patterns.forEach(compileRegex), true) : applyRules(workerData.documents,workerData.query);
  parentPort.postMessage({ channel:'compras-rules-v2',requestId:workerData.requestId,result });
} catch(error) { parentPort.postMessage({ channel:'compras-rules-v2',requestId:workerData.requestId,error:{ code:error.code || 'RULE_ERROR', message:error.message, status:error.status || 400, details:error.details || {} } }); }
