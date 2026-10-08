import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { createFilterOptionsCache, FILTER_OPTIONS_TTL, FILTER_OPTIONS_PREFIX } from '../src/browser/filter-options-cache.js';
import { schema } from '../src/schema.js';
import { config, memoryStorage } from './helpers.js';

const catalog=schema(config({DEMO_MODE:true}));
function fixture({storage=memoryStorage(),now=()=>1000,handler,definition=catalog}={}) {
  const calls=[];
  const service={async call(method,payload,options){
    calls.push(payload);assert.equal(method,'domains');
    if(handler)return handler(payload,options);
    const caps=definition.capabilities.filter(cap=>cap.domain && cap.documents.includes(payload.type) && !cap.reserved && (payload.field?cap.name===payload.field:cap.domain_source==='search'));
    return {filters:Object.fromEntries(caps.map(cap=>[cap.domain,[{id:'0001',label:`${payload.type}: ${cap.name}`,active:false}]])),warnings:[],partial_domains:['orgaos'],raw:{secret:'not stored'}};
  }};
  const cache=createFilterOptionsCache(service,definition,{getStorage:()=>storage,now});
  return {cache,calls,storage};
}

test('OPTIONS-01: pré-carrega os três tipos, quatro catálogos e referência sem repetir por campo',async()=>{
  const f=fixture(),results=await f.cache.preload();assert(results.every(result=>result.status==='fulfilled'));assert.equal(f.calls.length,8);
  assert.deepEqual(f.calls.filter(call=>call.field===null).map(call=>call.type),['edital','ata','contrato']);
  for(const field of ['paises_fornecedor','portes_fornecedor','naturezas_juridicas','situacoes_resultado','reservas_remanescentes'])assert.equal(f.calls.filter(call=>call.field===field).length,1);
  await f.cache.preload();
  for(const cap of catalog.capabilities.filter(cap=>cap.domain && !cap.reserved))for(const type of ['edital','ata','contrato'].filter(type=>cap.documents.includes(type)))await f.cache.get({type,field:cap.name});
  assert.equal(f.calls.length,8);assert.equal(f.storage.data.size,8);
  for(const value of f.storage.data.values()){const entry=JSON.parse(value);assert.equal(entry.expires_at-entry.fetched_at,FILTER_OPTIONS_TTL);assert(!Object.hasOwn(entry.value,'raw'));assert(!value.includes('not stored'));}
});

test('OPTIONS-02: reutiliza localStorage após reabrir e expira exatamente em quatro horas, sem renovar leituras',async()=>{
  const storage=memoryStorage();let time=1000;
  const first=fixture({storage,now:()=>time});await first.cache.preload();
  const before=[...storage.data.values()];time+=FILTER_OPTIONS_TTL-1;
  const restored=fixture({storage,now:()=>time});await restored.cache.preload();assert.equal(restored.calls.length,0);assert.deepEqual([...storage.data.values()],before);
  time++;await restored.cache.get({type:'edital',field:'ufs'});assert.equal(restored.calls.length,1);
  const expired=fixture({storage,now:()=>time});await expired.cache.preload();assert.equal(expired.calls.length,7);
});

test('OPTIONS-03: a memória também expira e uma falha de atualização não reusa listas vencidas',async()=>{
  let time=1000,failed=false;const f=fixture({now:()=>time,handler:()=>{if(failed)throw new Error('PNCP indisponível');return {filters:{ufs:[{id:'SP',label:'São Paulo'}]}};}});
  await f.cache.get({type:'edital'});time+=FILTER_OPTIONS_TTL;failed=true;
  await assert.rejects(f.cache.get({type:'edital'}),/PNCP indisponível/);assert.equal(f.storage.data.size,0);
  failed=false;await f.cache.get({type:'edital'});assert.equal(f.calls.length,3);
});

test('OPTIONS-04: entradas corrompidas, futuras ou de outra versão são descartadas sem limpar dados alheios',async()=>{
  const storage=memoryStorage(),valid=fixture({storage});await valid.cache.get({type:'edital'});
  const [key,text]=[...storage.data.entries()][0],entry=JSON.parse(text);storage.setItem('user-preference','preservar');
  for(const bad of ['invalid',JSON.stringify({...entry,version:2}),JSON.stringify({...entry,fetched_at:-1,expires_at:FILTER_OPTIONS_TTL-1}),JSON.stringify({...entry,fetched_at:2000,expires_at:2000+FILTER_OPTIONS_TTL}),JSON.stringify({...entry,expires_at:entry.expires_at+1}),JSON.stringify({...entry,value:{filters:{ufs:[{id:1,label:'Inválido'}]}}})]){
    storage.setItem(key,bad);const f=fixture({storage});await f.cache.get({type:'edital'});assert.equal(f.calls.length,1);assert.equal(storage.getItem('user-preference'),'preservar');
  }
  assert(key.startsWith(FILTER_OPTIONS_PREFIX));
});

test('OPTIONS-05: armazenamento bloqueado ou sem quota mantém cache em memória e filtros funcionais',async()=>{
  for(const getStorage of [()=>{throw new Error('SecurityError');},()=>({getItem(){throw new Error('SecurityError');},setItem(){throw new Error('QuotaExceededError');},removeItem(){throw new Error('SecurityError');}}),()=>({getItem:()=>null,setItem(){throw new Error('QuotaExceededError');}})]){
    let calls=0;const cache=createFilterOptionsCache({call:async()=>{calls++;return {filters:{ufs:[{id:'SP',label:'São Paulo'}]}};}},catalog,{getStorage});
    assert.equal((await cache.get({type:'edital'})).filters.ufs[0].id,'SP');await cache.get({type:'edital'});assert.equal(calls,1);
  }
});

test('OPTIONS-06: leitores compartilham a chamada, cancelamento não interrompe pré-carga e valores são isolados',async()=>{
  let resolve,signal;const f=fixture({handler:(_payload,options)=>{signal=options.signal;return new Promise(done=>{resolve=done;});}}),cancel=new AbortController();
  const cancelled=f.cache.get({type:'edital',field:'ufs'},{signal:cancel.signal}),other=f.cache.get({type:'edital',field:'anos'});
  await tick();assert.equal(f.calls.length,1);cancel.abort();await assert.rejects(cancelled,e=>e.name==='AbortError');assert.equal(signal.aborted,false);
  resolve({filters:{ufs:[{id:'SP',label:'São Paulo'}]}});const result=await other;result.filters.ufs[0].label='Modificado';
  assert.equal((await f.cache.get({type:'edital'})).filters.ufs[0].label,'São Paulo');assert.equal(f.calls.length,1);
});

test('OPTIONS-07: falhas e formatos inválidos não persistem nem impedem pré-carregar as outras listas',async()=>{
  let failed=true;const f=fixture({handler:payload=>{if(payload.type==='ata' && failed)throw new Error('Indisponível');return {filters:{ufs:[{id:'SP',label:'São Paulo'}]}};}});
  const result=await f.cache.preload();assert.equal(result.filter(result=>result.status==='rejected').length,1);assert.equal(f.storage.data.size,7);
  failed=false;await f.cache.get({type:'ata'});assert.equal(f.calls.length,9);
  for(const bad of [{filters:{}},{filters:{ufs:'invalid'}},{filters:{ufs:[{id:'SP',label:3}]}},{filters:{ufs:[]},warnings:[{}]},{filters:{ufs:[]},partial_domains:[{}]},{filters:{ufs:[]},domain_source:{}}]){
    const invalid=fixture({handler:()=>bad});await assert.rejects(invalid.cache.get({type:'edital'}),e=>e.code==='INVALID_UPSTREAM');assert.equal(invalid.storage.data.size,0);
  }
});

test('OPTIONS-08: amparos são separados por tipo e conjunto de normativos, demais campos reusam a lista inicial',async()=>{
  const f=fixture();await f.cache.preload();
  await f.cache.get({type:'edital',field:'amparos_legais',normatives:['1']});assert.equal(f.calls.length,9);assert.deepEqual(f.calls.at(-1).normatives,['1']);assert.equal(f.calls.at(-1).field,'amparos_legais');
  await f.cache.get({type:'edital',field:'amparos_legais',normatives:['1']});await f.cache.get({type:'edital',field:'ufs',normatives:['1']});assert.equal(f.calls.length,9);
  await f.cache.get({type:'edital',field:'amparos_legais',normatives:['2','1']});await f.cache.get({type:'edital',field:'amparos_legais',normatives:['1','2','1']});assert.equal(f.calls.length,10);
  await f.cache.get({type:'contrato',field:'amparos_legais',normatives:['1']});assert.equal(f.calls.length,11);
});

test('OPTIONS-09: fonte real e demonstração não compartilham listas e contexto inválido não faz chamada',async()=>{
  const storage=memoryStorage(),demo=fixture({storage});await demo.cache.preload();
  const live=fixture({storage,definition:schema(config())});await live.cache.preload();assert.equal(live.calls.length,8);assert.equal(storage.data.size,16);
  for(const payload of [{type:'unknown'},{type:'ata',field:'paises_fornecedor'},{type:'edital',field:'invalid'},{type:'edital',normatives:['not-an-id']}])await assert.rejects(live.cache.get(payload),e=>e.code==='INVALID_DOMAIN');assert.equal(live.calls.length,8);
});

test('OPTIONS-10: encerramento cancela a chamada ativa e os trabalhos enfileirados sem persistir respostas',async()=>{
  const f=fixture({handler:(_payload,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
  const first=f.cache.get({type:'edital'}),second=f.cache.get({type:'ata'});await tick();f.cache.close();
  for(const result of await Promise.allSettled([first,second]))assert.equal(result.reason.name,'AbortError');assert.equal(f.calls.length,1);assert.equal(f.storage.data.size,0);
});

const largeOptions=()=>({filters:{orgaos:Array.from({length:15000},(_,i)=>({id:String(i).padStart(14,'0'),label:`Órgão público ${i} — unidade de aquisição e contratação`,active:i%2===0})),ufs:[{id:'SP',label:'São Paulo'}]},warnings:[{domain:'orgaos',message:'Lista parcial'}],partial_domains:['orgaos']});

test('OPTIONS-11: listas grandes comprimidas preservam todas as opções e são reutilizadas após reinicialização',async()=>{
  const storage=memoryStorage(),value=largeOptions(),first=fixture({storage,handler:()=>value});
  assert.deepEqual(await first.cache.get({type:'contrato'}),value);
  const [key,text]=[...storage.data.entries()][0],entry=JSON.parse(text);
  assert.equal(entry.encoding,'gzip-base64');assert(text.length<JSON.stringify(value).length/3);
  const restored=fixture({storage});assert.deepEqual(await restored.cache.get({type:'contrato',field:'orgaos'}),value);assert.equal(restored.calls.length,0);
  assert.equal(JSON.parse(storage.getItem(key)).expires_at,entry.expires_at);
});

test('OPTIONS-12: migra listas antigas grandes antes de carregar contrato, sem estender a validade ou exceder a quota',async()=>{
  const storage=memoryStorage(),value=largeOptions();
  for(const type of ['edital','ata'])await fixture({storage,handler:()=>({filters:{ufs:[{id:'SP',label:'São Paulo'}]}})}).cache.get({type});
  for(const [key,text] of storage.data){const entry=JSON.parse(text);storage.setItem(key,JSON.stringify({...entry,value}));}
  const limit=[...storage.data.values()].reduce((total,text)=>total+text.length,0),quotaStorage={...storage,setItem(key,text){
    const usage=[...storage.data.entries()].reduce((total,[storedKey,value])=>total+(storedKey===key?0:value.length),text.length);
    if(usage>limit)throw new Error('QuotaExceededError');storage.setItem(key,text);
  }};
  let time=2000;const first=fixture({storage:quotaStorage,now:()=>time,handler:()=>value});
  await first.cache.preload();assert.equal(first.calls.filter(call=>call.field===null).length,1);assert.equal(first.calls.find(call=>call.field===null).type,'contrato');assert.equal(storage.data.size,8);
  for(const [key,text] of storage.data){const entry=JSON.parse(text),context=JSON.parse(decodeURIComponent(key.slice(key.indexOf('%5B'))));assert.equal(entry.encoding,'gzip-base64');if(context[0]==='search' && ['edital','ata'].includes(context[1]))assert.equal(entry.fetched_at,1000);}
  const restored=fixture({storage:quotaStorage,now:()=>time});await restored.cache.preload();assert.equal(restored.calls.length,0);
  time=1000+FILTER_OPTIONS_TTL;await restored.cache.get({type:'edital'});assert.equal(restored.calls.length,1);
});

test('OPTIONS-13: cache comprimido corrompido é substituído e mantém a expiração de quatro horas',async()=>{
  const storage=memoryStorage();let time=1000;const first=fixture({storage,now:()=>time,handler:largeOptions});await first.cache.get({type:'contrato'});
  const [key,text]=[...storage.data.entries()][0],entry=JSON.parse(text);
  for(const bad of [{...entry,encoding:'unknown'},{...entry,value:'not-base64!'},{...entry,value:btoa('not gzip')}]){
    storage.setItem(key,JSON.stringify(bad));const restored=fixture({storage,now:()=>time,handler:largeOptions});await restored.cache.get({type:'contrato'});assert.equal(restored.calls.length,1);
  }
  time+=FILTER_OPTIONS_TTL;const expired=fixture({storage,now:()=>time,handler:largeOptions});await expired.cache.get({type:'contrato'});assert.equal(expired.calls.length,1);
});

test('OPTIONS-14: navegador sem compactação nativa mantém opções completas no formato JSON compatível',async()=>{
  const original=globalThis.CompressionStream;globalThis.CompressionStream=undefined;
  try {
    const storage=memoryStorage(),value=largeOptions(),first=fixture({storage,handler:()=>value});await first.cache.get({type:'contrato'});
    assert.equal(JSON.parse([...storage.data.values()][0]).encoding,undefined);
    const restored=fixture({storage});assert.deepEqual(await restored.cache.get({type:'contrato'}),value);assert.equal(restored.calls.length,0);
  } finally {globalThis.CompressionStream=original;}
});
