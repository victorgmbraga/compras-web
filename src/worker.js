import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
export function runRules(payload, config, signal) {
  return new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(signal.reason);
    const requestId=randomUUID();
    const worker=new Worker(new URL('./rules-worker.js',import.meta.url),{workerData:{...payload,requestId},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32}});
    let settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate().catch(()=>{});error?reject(error):resolve(result);};
    const abort=()=>finish(signal.reason);
    const timer=setTimeout(()=>finish(new AppError('REGEX_TIMEOUT','Tempo limite das regras excedido. Simplifique a expressão regular.',422)),config.REGEX_TIMEOUT_MS);
    signal.addEventListener('abort',abort,{once:true});
    worker.on('message',message=>{
      if(message?.channel!=='compras-rules-v2' || message.requestId!==requestId)return;
      finish(message.error?new AppError(message.error.code,message.error.message,message.error.status,message.error.details):null,message.result);
    });
    worker.once('error',error=>finish(new AppError('RULE_WORKER_ERROR','Falha ao avaliar regras isoladas.',502,{message:error.message})));
    worker.once('exit',code=>{if(!settled)finish(new AppError('RULE_WORKER_ERROR',`Avaliador encerrado (código ${code}).`,502));});
  });
}
