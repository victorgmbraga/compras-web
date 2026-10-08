import assert from 'node:assert/strict';
import { launchTestBrowser } from './browser-launch.js';
import { createStaticServer } from './static-server.js';

// Exercise native storage quotas and compression with large synthetic PNCP lists.
const app=createStaticServer(new URL('../',import.meta.url));
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const browser=await launchTestBrowser(),page=await browser.newPage();
try {
  await page.goto(`http://127.0.0.1:${app.server.address().port}/package.json`);
  const result=await page.evaluate(async()=>{
    const {createFilterOptionsCache,FILTER_OPTIONS_PREFIX,FILTER_OPTIONS_TTL}=await import('/src/browser/filter-options-cache.js');
    const types=['edital','ata','contrato'],schema={source:'pncp',api_version:'2.0',document_types:types.map(id=>({id,enabled:true})),capabilities:[{name:'orgaos',domain:'orgaos',domain_source:'search',documents:types}]};
    const values=Object.fromEntries(types.map(type=>{
      const list=Array.from({length:type==='contrato'?15000:2500},(_,i)=>({id:String(i).padStart(14,'0'),label:`Órgão, fornecedor ou unidade pública de contratação ${type} número ${i} — São Paulo`,active:i%2===0}));
      return [type,{filters:{orgaos:list,unidades:list,fornecedores:list,ufs:[{id:'SP',label:'São Paulo'}]},warnings:[],partial_domains:['orgaos','unidades','fornecedores']}];
    }));
    const prefix=`${FILTER_OPTIONS_PREFIX}pncp:2.0:`,keyFor=type=>prefix+encodeURIComponent(JSON.stringify(['search',type,[]]));
    const legacyTypes=[],quotaErrors=[];
    localStorage.setItem('filter-test-preference','preservar');
    for(const type of types){
      try{localStorage.setItem(keyFor(type),JSON.stringify({version:1,fetched_at:1000,expires_at:1000+FILTER_OPTIONS_TTL,value:values[type]}));legacyTypes.push(type);}
      catch(error){quotaErrors.push({type,name:error.name});}
    }
    const legacyContractStored=localStorage.getItem(keyFor('contrato'))!==null;
    let time=2000;const calls=[],service={async call(method,{type}){calls.push({method,type});return values[type];}};
    const cache=createFilterOptionsCache(service,schema,{now:()=>time});
    const initial=await cache.preload();
    const entries=types.map(type=>JSON.parse(localStorage.getItem(keyFor(type))));
    const loadedCounts=[];
    for(const type of types){const value=await cache.get({type,field:'orgaos'});loadedCounts.push(value.filters.orgaos.length);if(JSON.stringify(value)!==JSON.stringify(values[type]))throw new Error('Opções alteradas durante compactação');}
    const restoredCalls=[],restored=createFilterOptionsCache({call:async(method,payload)=>{restoredCalls.push(payload);return values[payload.type];}},schema,{now:()=>time});
    await restored.preload();
    for(const type of types){const value=await restored.get({type,field:'orgaos'});if(JSON.stringify(value)!==JSON.stringify(values[type]))throw new Error('Opções não preservadas após reinicialização');}
    const callsBeforeExpiry=restoredCalls.length;
    time=entries[2].expires_at;await restored.get({type:'contrato'});
    return {quotaErrors,legacyTypes,legacyContractStored,initial:initial.map(result=>result.status),calls,entries:entries.map(entry=>({encoding:entry.encoding,fetched_at:entry.fetched_at,expires_at:entry.expires_at,characters:entry.value.length})),loadedCounts,callsBeforeExpiry,callsAfterExpiry:restoredCalls,preference:localStorage.getItem('filter-test-preference')};
  });
  assert(result.quotaErrors.some(error=>error.type==='contrato' && error.name==='QuotaExceededError'));assert.equal(result.legacyContractStored,false);
  assert(result.initial.every(status=>status==='fulfilled'));assert(result.entries.every(entry=>entry.encoding==='gzip-base64'));
  assert.deepEqual(result.loadedCounts,[2500,2500,15000]);assert.deepEqual(result.legacyTypes,['edital','ata']);assert.equal(result.preference,'preservar');
  for(const type of result.legacyTypes)assert.equal(result.entries[['edital','ata','contrato'].indexOf(type)].fetched_at,1000);
  assert.deepEqual(result.calls.map(call=>call.type),['edital','ata','contrato'].filter(type=>!result.legacyTypes.includes(type)));
  assert.equal(result.callsBeforeExpiry,0);assert.deepEqual(result.callsAfterExpiry,[{type:'contrato',field:null}]);
  console.log('PASS Quota real do localStorage reproduz falha dos contratos; compactação preserva todas as opções, migra cache antigo, reutiliza após reinicialização e expira em quatro horas',JSON.stringify(result));
} finally {await browser.close();await app.close();}
