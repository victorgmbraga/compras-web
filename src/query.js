import { assert, fail } from './errors.js';
import { validateQuery } from './validation.js';
import { project, identity, plain } from './adapter.js';
import { operation, normalizeOptions } from './pncp.js';
import { categorize, documentPresetState, itemPresetState } from './rules.js';
import { categorizePresets, columns, domainAliases } from './schema.js';
import { runRules } from './worker.js';

export class QueryService {
  constructor(config, client) { this.config=config; this.client=client; }
  async verifyDomains(query, op) {
    const short = Object.keys(query.pncp_filters).filter(k=>['modalidades','situacoes','tipos','normativos_base','amparos_legais','situacoes_item','beneficios','categorias_leilao','situacoes_resultado'].includes(k));
    if(!short.length)return;
    const domains=await this.client.domains(query.document_type,query.pncp_filters.normativos_base,op);
    for(const key of short) {
      const options=domains.filters[domainAliases[key] || key];
      assert(options?.length,'DOMAIN_UNAVAILABLE',`PNCP não forneceu o domínio necessário para ${key}.`,409);
      assert(query.pncp_filters[key].every(v=>options.some(o=>o.id===v)),'INVALID_DOMAIN',`ID inválido no domínio ${key}.`);
    }
  }
  async collect(query, op, limit, first = null) {
    const size=this.config.PNCP_PAGE_SIZE;
    const head=first || await this.client.search(query,1,size,op);
    assert(head.total<=limit && head.total<=10000,query.mode==='refined'?'QUERY_TOO_BROAD':'EXPORT_TOO_BROAD','Delimite datas, UF ou órgão para consultar integralmente os resultados.',422,{source_total:head.total,limit});
    const documents=[],seen=new Set();
    const pages=Math.max(1,Math.ceil(head.total/size));
    for(let page=1;page<=pages;page++) {
      op.check();const current=page===1?head:await this.client.search(query,page,size,op);
      assert(current.total===head.total,'SOURCE_CHANGED','O total do PNCP mudou durante a coleta. Repita a consulta.',409,{},true);
      assert(current.items.length===Math.min(size,Math.max(0,head.total-(page-1)*size)),'SOURCE_CHANGED','Página incompleta ou inesperadamente vazia na coleta PNCP.',409,{},true);
      for(const raw of current.items) {
        const key=identity(raw);
        assert(key && !seen.has(key),'SOURCE_CHANGED','Documento duplicado ou sem identidade durante a coleta. Repita a consulta.',409,{},true);
        seen.add(key);documents.push(project(raw));
      }
    }
    assert(seen.size===head.total,'SOURCE_CHANGED','Quantidade de documentos únicos não corresponde ao total.',409,{},true);
    return {documents,source_total:head.total};
  }
  async process(query,op,{allRows=false}={}) {
    const patterns=[...query.filters,...query.header_filters].filter(r=>r.type==='regex').map(r=>r.value);
    if(patterns.length)await runRules({validateOnly:true,patterns},this.config,op.signal);
    await this.verifyDomains(query,op);
    let documents,sourceTotal,matched=null,unverifiable=null,complete=false,ruleComplete=null;
    if(query.mode==='native' && !allRows) {
      const page=await this.client.search(query,query.page,query.size,op);
      sourceTotal=page.total;documents=page.items.map(project);
      const last=Math.max(1,Math.ceil(Math.min(sourceTotal,10000)/query.size));
      assert(query.page<=last,'PAGE_OUT_OF_RANGE','Página além do resultado atual.',422,{last_page:last});
      assert(documents.length===Math.min(query.size,Math.max(0,sourceTotal-(query.page-1)*query.size)),'INVALID_UPSTREAM','O PNCP retornou uma página incompatível com o total e o tamanho solicitado.',502);
      if(categorizePresets.includes(query.preset))documents=documents.map(d=>({...d,categorizacao:categorize(d.objeto_compra)}));
    } else {
      const collected=await this.collect(query,op,query.mode==='refined'?this.config.PNCP_MAX_REFINEMENT_CANDIDATES:this.config.PNCP_MAX_EXPORT_DOCUMENTS);
      sourceTotal=collected.source_total;documents=collected.documents;complete=true;
      if(query.mode==='refined') {
        // Evaluate document-only rules before expensive item fetches. No hidden q.
        const first=await runRules({documents,query:{...query,deduplicate:'none',sorters:[]}},this.config,op.signal);
        documents=first.documents;unverifiable=0;
        if(!['all','personalizado'].includes(query.preset)) {
          const matchedDocs=[];
          for(const doc of documents) {
            op.check();const documentState=documentPresetState(doc,query.preset);
            if(documentState==='no_match')continue;
            if(documentState==='unknown'){unverifiable++;continue;}
            if(!doc._purchase){unverifiable++;continue;}
            const items=await this.client.allItems(doc._purchase,op);
            const result=itemPresetState(items,query.preset,this.config.PNCP_PRESET_CATALOG_ID);
            if(result.state==='unknown'){unverifiable++;continue;}
            if(result.state==='match')matchedDocs.push({...doc,matching_item_numbers:result.matching});
          }
          documents=matchedDocs;
        }
        const refined=await runRules({documents,query},this.config,op.signal);
        documents=refined.documents;matched=refined.matched_documents;ruleComplete=unverifiable===0;
      } else if(categorizePresets.includes(query.preset))documents=documents.map(d=>({...d,categorizacao:categorize(d.objeto_compra)}));
    }
    const total=query.mode==='native'?sourceTotal:documents.length;
    const accessible=query.mode==='native'?Math.min(sourceTotal,10000):total;
    const lastPage=Math.max(1,Math.ceil(accessible/query.size));
    assert(query.page<=lastPage,'PAGE_OUT_OF_RANGE','Página além do resultado atual.',422,{last_page:lastPage});
    const warnings=[];
    if(sourceTotal>10000)warnings.push({code:'WINDOW_LIMITED',message:'Refine a pesquisa para acessar todos os resultados. A janela acessível é de 10000 documentos.'});
    if(unverifiable)warnings.push({code:'UNVERIFIABLE_DOCUMENTS',message:`${unverifiable} contratação(ões) excluída(s) por informação insuficiente para confirmar a regra.`});
    if(documents.some(d=>!d._identity))warnings.push({code:'MISSING_IDENTITY',message:'Há documentos sem identidade de negócio na página.'});
    const now=Date.now();
    return {api_version:'2.0',source:this.config.DEMO_MODE?'demo':'pncp',demo:this.config.DEMO_MODE,mode:query.mode,request_id:op.id,data:allRows?documents:query.mode==='refined'?documents.slice((query.page-1)*query.size,query.page*query.size):documents,page:query.page,size:query.size,last_page:lastPage,last_row:accessible,source_total:sourceTotal,accessible_total:accessible,matched_documents:matched,total,unverifiable_documents:unverifiable,window_limited:sourceTotal>10000,collection_complete:complete,complete_for_rule:ruleComplete,snapshot_guaranteed:false,started_at:op.started_at,finished_at:new Date(now).toISOString(),elapsed_ms:now-op.started,upstream_requests:op.requests,effective_filters:{tipos_documento:query.document_type,status:query.status,...(query.q?{q:query.q}:{}),ordenacao:query.order,...query.pncp_filters,preset:query.preset,preset_verification:!['all','personalizado'].includes(query.preset)?'same_service_item_in_situation_1_or_2':null,filters:query.filters,header_filters:query.header_filters,filter_join:query.filter_join,deduplicate:query.deduplicate,sorters:query.sorters},warnings};
  }
  async execute(input,signal,requestId) {
    const query=validateQuery(input,this.config),op=operation(this.config,signal,requestId);
    try{return await this.process(query,op);}finally{op.finish();}
  }
  async export(input,scope,signal,requestId) {
    assert(['all','confirmed_only'].includes(scope),'INVALID_EXPORT_SCOPE','Escopo de exportação inválido.');
    const query=validateQuery({...input,page:1,size:this.config.PNCP_PAGE_SIZE},this.config);
    assert(scope!=='confirmed_only' || query.mode==='refined','INVALID_EXPORT_SCOPE','confirmed_only exige consulta refinada.');
    const op=operation(this.config,signal,requestId);
    try {
      const result=await this.process(query,op,{allRows:true});
      if(result.unverifiable_documents && scope==='all')fail('INCOMPLETE_RULE_COVERAGE','Há candidatos não verificáveis. Selecione explicitamente exportar somente confirmados.',422,{unverifiable_documents:result.unverifiable_documents});
      const csvCell=value=>'"'+(value===null || value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value)).replace(/"/g,'""')+'"';
      const chunks=['\ufeff'+columns.map(c=>csvCell(c.field)).join(',')+'\r\n'];let bytes=Buffer.byteLength(chunks[0]);
      assert(bytes<=this.config.PNCP_MAX_EXPORT_BYTES,'EXPORT_BYTES_LIMIT','Limite do buffer CSV excedido. Delimite a pesquisa.',422);
      for(const doc of result.data) {
        op.check();const line=columns.map(c=>csvCell(doc[c.field])).join(',')+'\r\n';bytes+=Buffer.byteLength(line);
        assert(bytes<=this.config.PNCP_MAX_EXPORT_BYTES,'EXPORT_BYTES_LIMIT','Limite do buffer CSV excedido. Delimite a pesquisa.',422);chunks.push(line);
      }
      result.finished_at=new Date().toISOString();result.elapsed_ms=Date.now()-op.started;
      return {csv:Buffer.from(chunks.join(''),'utf8'),metadata:result};
    }finally{op.finish();}
  }
  async domains(type,normatives,signal,requestId) {const op=operation(this.config,signal,requestId);try{return {...await this.client.domains(type,normatives,op),request_id:op.id,queried_at:new Date().toISOString()};}finally{op.finish();}}
  async suggest(type,field,q,size,signal,requestId) {const op=operation(this.config,signal,requestId);try{return {...await this.client.suggest(type,field,q,size,op),request_id:op.id,queried_at:new Date().toISOString()};}finally{op.finish();}}
  async details(purchase,page,size,signal,requestId) {
    const op=operation(this.config,signal,requestId);
    try {const items=await this.client.itemPage(purchase,page,size,op);return {api_version:'2.0',request_id:op.id,source:this.config.DEMO_MODE?'demo':'pncp',data:plain(items),page,size,has_more:items.length>0,complete:items.length===0,queried_at:new Date().toISOString(),upstream_requests:op.requests,pagination_note:'O fim é confirmado por uma próxima página vazia; páginas curtas não garantem conclusão.'};}finally{op.finish();}
  }
}
