import { assert } from './errors.js';
import { validateQuery } from './validation.js';
import { project, identity, plain } from './adapter.js';
import { operation } from './pncp.js';
import { columnsFor, capabilities } from './schema.js';

export class QueryService {
  constructor(config, client) { this.config=config; this.client=client; }
  async verifyDomains(query, op) {
    const short=capabilities(this.config).filter(c=>c.domain_kind==='closed' && Object.hasOwn(query.pncp_filters,c.name));
    if(!short.length)return;
    const search=short.some(c=>c.domain_source==='search') ? await this.client.domains(query.document_type,query.pncp_filters.normativos_base,op) : null;
    for(const cap of short) {
      const key=cap.name,domains=cap.domain_source==='search' ? search : await this.client.domains(query.document_type,null,op,key);
      const options=domains.filters[cap.domain];
      assert(options?.length,'DOMAIN_UNAVAILABLE',`PNCP não forneceu o domínio necessário para ${key}.`,409);
      const values=cap.cardinality==='single' ? [query.pncp_filters[key]] : query.pncp_filters[key];
      assert(values.every(v=>options.some(o=>o.id===v)),'INVALID_DOMAIN',`ID inválido no domínio ${key}.`);
    }
  }
  async collect(query, op) {
    const size=this.config.PNCP_PAGE_SIZE,head=await this.client.search(query,1,size,op),limit=this.config.PNCP_MAX_EXPORT_DOCUMENTS;
    const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
    assert(head.total<=limit && head.total<=10000,'EXPORT_TOO_BROAD',`A busca retornou ${fmt(head.total)} ${query.document_type==='contrato'?'contratos':'contratações'}; o limite de exportação é ${fmt(limit)}. Delimite a pesquisa por texto, período de publicação, UF ou órgão.`,422,{source_total:head.total,limit});
    const documents=[],seen=new Set(),pages=Math.max(1,Math.ceil(head.total/size));
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
    return {documents,source_total:head.total};
  }
  async process(query,op,{allRows=false}={}) {
    await this.verifyDomains(query,op);
    let documents,sourceTotal;
    if(allRows) {
      const collected=await this.collect(query,op);documents=collected.documents;sourceTotal=collected.source_total;
    } else {
      const page=await this.client.search(query,query.page,query.size,op);sourceTotal=page.total;documents=page.items.map(project);
      const last=Math.max(1,Math.ceil(Math.min(sourceTotal,10000)/query.size));
      assert(query.page<=last,'PAGE_OUT_OF_RANGE','Página além do resultado atual.',422,{last_page:last});
      assert(documents.length===Math.min(query.size,Math.max(0,sourceTotal-(query.page-1)*query.size)),'INVALID_UPSTREAM','O PNCP retornou uma página incompatível com o total e o tamanho solicitado.',502);
    }
    const accessible=Math.min(sourceTotal,10000),lastPage=Math.max(1,Math.ceil(accessible/query.size)),warnings=[];
    if(sourceTotal>10000)warnings.push({code:'WINDOW_LIMITED',message:'Refine a pesquisa para acessar todos os resultados. A janela acessível é de 10000 documentos.'});
    if(documents.some(d=>!d._identity))warnings.push({code:'MISSING_IDENTITY',message:'Há documentos sem identidade de negócio na página.'});
    const now=Date.now();
    return {api_version:'2.0',document_type:query.document_type,source:this.config.DEMO_MODE?'demo':'pncp',demo:this.config.DEMO_MODE,request_id:op.id,data:documents,page:query.page,size:query.size,last_page:lastPage,last_row:accessible,source_total:sourceTotal,accessible_total:accessible,total:sourceTotal,window_limited:sourceTotal>10000,collection_complete:allRows,snapshot_guaranteed:false,started_at:op.started_at,finished_at:new Date(now).toISOString(),elapsed_ms:now-op.started,upstream_requests:op.requests,effective_filters:{tipos_documento:query.document_type,status:query.status,...(query.q?{q:query.q}:{}),ordenacao:query.order,...query.pncp_filters},warnings};
  }
  async execute(input,signal,requestId) {
    const query=validateQuery(input,this.config),op=operation(this.config,signal,requestId);
    try{return await this.process(query,op);}finally{op.finish();}
  }
  async export(input,signal,requestId) {
    const query=validateQuery({...input,page:1,size:this.config.PNCP_PAGE_SIZE},this.config),op=operation(this.config,signal,requestId);
    try {
      const result=await this.process(query,op,{allRows:true});
      const columns=columnsFor(query.document_type);
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
  async domains(type,normatives,signal,requestId,field=null) {const op=operation(this.config,signal,requestId);try{return {...await this.client.domains(type,normatives,op,field),request_id:op.id,queried_at:new Date().toISOString()};}finally{op.finish();}}
  async suggest(type,field,q,size,signal,requestId) {const op=operation(this.config,signal,requestId);try{return {...await this.client.suggest(type,field,q,size,op),request_id:op.id,queried_at:new Date().toISOString()};}finally{op.finish();}}
  async details(purchase,page,size,signal,requestId) {
    const op=operation(this.config,signal,requestId);
    try {
      const total=await this.client.itemQuantity(purchase,op),pages=Math.max(1,Math.ceil(total/size));
      assert(page<=pages,'PAGE_OUT_OF_RANGE','Página além da quantidade atual de itens.',422,{last_page:pages,total_items:total});
      const items=total===0?[]:await this.client.itemPage(purchase,page,size,op);
      assert(items.length===Math.min(size,total-(page-1)*size),'SOURCE_CHANGED','A página de itens não corresponde à quantidade informada pelo PNCP. Atualize os itens.',409,{},true);
      return {api_version:'2.0',request_id:op.id,source:this.config.DEMO_MODE?'demo':'pncp',data:plain(items),page,size,total_items:total,total_pages:pages,has_more:page<pages,complete:page===pages,snapshot_guaranteed:false,queried_at:new Date().toISOString(),upstream_requests:op.requests,pagination_note:'Paginação baseada na quantidade de itens informada pelo PNCP nesta consulta.'};
    }finally{op.finish();}
  }
  async related(purchase,resource,page,size,signal,requestId) {
    const op=operation(this.config,signal,requestId);
    try {
      const result=await this.client.relatedPage(purchase,resource,page,size,op);
      return {api_version:'2.0',request_id:op.id,source:this.config.DEMO_MODE?'demo':'pncp',resource,...result,page,size,has_more:page<result.total_pages,complete:page===result.total_pages,snapshot_guaranteed:false,queried_at:new Date().toISOString(),upstream_requests:op.requests};
    }finally{op.finish();}
  }
}
