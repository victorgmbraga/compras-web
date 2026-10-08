import { parse } from 'lossless-json';
import { AppError, assert, fail } from './errors.js';
import { scalarText, plain, itemSituation } from './adapter.js';
import { domainAliases, catalogDomains, referenceDomains, partialDomains } from './filter-domains.js';
import { relatedResources, projectRelated } from './related.js';
import { documentResources, nativeDocumentPath, projectDocument, recordFields, controlLink } from './document-details.js';

import { delay } from './operation.js';
export { delay, operation } from './operation.js';

export function serializeSearch(query, page, size) {
  const params = new URLSearchParams({ tipos_documento: query.document_type, status: query.status, ordenacao: query.order, pagina: String(page), tam_pagina: String(size) });
  if (query.q !== '') params.set('q', query.q);
  for (const [key, value] of Object.entries(query.pncp_filters)) params.set(key, Array.isArray(value) ? value.join('|') : String(value));
  return params;
}
function integer(value, name) {
  const text = scalarText(value);
  assert(text !== null && /^\d+$/.test(text) && Number.isSafeInteger(Number(text)), 'INVALID_UPSTREAM', `${name} inválido na resposta PNCP.`, 502);
  return Number(text);
}
export function normalizeOptions(value, domain = null) {
  const list = Array.isArray(value) ? value : value?.items;
  if (!Array.isArray(list)) return [];
  return list.map(option => {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const id=scalarText(domain==='anos' ? option.ano ?? option.id : option.id);
      return { id, label: scalarText(option.nome ?? option.name ?? option.label ?? option.text ?? option.descricao ?? option.title) ?? id };
    }
    const s = scalarText(option); return s === null ? null : { id: s, label: s };
  }).filter(option => option && option.id !== null && option.id !== '' && (domain!=='anos' || /^\d{4}$/.test(option.id)));
}
export function normalizeCatalog(value) {
  assert(Array.isArray(value), 'INVALID_UPSTREAM', 'Catálogo PNCP não retornou uma lista.',502);
  return value.map(option=>{
    assert(option && typeof option==='object' && !Array.isArray(option), 'INVALID_UPSTREAM', 'Opção de catálogo PNCP inválida.',502);
    const id=scalarText(option.id),label=scalarText(option.nome);
    assert(id && label && (option.statusAtivo===undefined || typeof option.statusAtivo==='boolean'), 'INVALID_UPSTREAM', 'Identidade, nome ou estado da opção PNCP inválido.',502);
    return {id,label,...(option.statusAtivo===undefined?{}:{active:option.statusAtivo})};
  });
}
export class PncpClient {
  constructor(config, { fetcher, logger = () => {}, fetchOptions = {} } = {}) {
    assert(typeof fetcher === 'function', 'INVALID_CONFIG', 'Transporte PNCP não configurado.');
    this.config = config; this.logger = logger; this.active = 0; this.queue = []; this.nextSlot = 0; this.lastCall = null;
    this.fetcher = fetcher; this.fetchOptions = fetchOptions;
  }
  async acquire(signal) {
    if (signal.aborted) throw signal.reason;
    if (this.active < this.config.PNCP_MAX_CONCURRENT_REQUESTS) { this.active++; return; }
    await new Promise((resolve,reject) => {
      const waiter = { resolve: () => { signal.removeEventListener('abort', abort); resolve(); } };
      const abort = () => { this.queue = this.queue.filter(w => w !== waiter); reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true }); this.queue.push(waiter);
    });
  }
  release() { const next = this.queue.shift(); if (next) next.resolve(); else this.active--; }
  async readBody(response, op, signal = op.signal) {
    const reader = response.body?.getReader(); if (!reader) return '';
    const decoder = new TextDecoder(), chunks = [];
    const abort = () => { reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      for (;;) {
        op.check(); signal.throwIfAborted();
        const { done, value } = await reader.read();
        op.check(); signal.throwIfAborted(); if (done) break;
        op.bytes += value.byteLength;
        assert(op.bytes <= this.config.PNCP_MAX_OPERATION_BYTES, 'OPERATION_BYTES_LIMIT', 'Limite de volume da operação excedido. Delimite a pesquisa.', 422);
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode()); return chunks.join('');
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  }
  async get(url, op, allowNoContent = false) {
    const origin = new URL(url).origin;
    for (let attempt = 0; attempt <= this.config.PNCP_MAX_RETRIES; attempt++) {
      op.check(); await this.acquire(op.signal);
      let retryDelay = 0;
      const started = Date.now(); let status = null;
      try {
        const slot = Math.max(Date.now(), this.nextSlot);
        this.nextSlot = slot + 1000 / this.config.PNCP_REQUESTS_PER_SECOND;
        await delay(Math.max(0, slot - Date.now()), op.signal);
        const signal = AbortSignal.any([op.signal, AbortSignal.timeout(this.config.PNCP_READ_TIMEOUT_SECONDS * 1000)]);
        let current = url; let response;
        for (let redirects = 0; redirects <= 3; redirects++) {
          op.check(); assert(++op.requests <= this.config.PNCP_MAX_REQUESTS_PER_OPERATION, 'REQUEST_BUDGET', 'Limite de chamadas da operação excedido.', 422);
          response = await this.fetcher(current, { signal, redirect: 'manual', headers: { Accept: 'application/json' }, ...this.fetchOptions });
          if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) {
            await response.body?.cancel();
            fail('PNCP_TRANSPORT_ERROR', 'A resposta do PNCP não pôde ser lida pelo navegador.', 503, { origin: 'pncp' }, true);
          }
          status = response.status;
          if (![301,302,303,307,308].includes(status)) break;
          await response.body?.cancel();
          const next = new URL(response.headers.get('location') || '', current);
          assert(next.origin === origin && next.protocol === 'https:' && !next.username && !next.password && redirects < 3, 'UNSAFE_REDIRECT', 'Redirecionamento PNCP para origem não autorizada.', 502);
          current = next.href;
        }
        if ([429,502,503,504].includes(status)) {
          const after = response.headers.get('retry-after');
          const seconds = after && /^\d+(?:\.\d+)?$/.test(after) ? Number(after)*1000 : after ? Math.max(0, Date.parse(after)-Date.now()) : 0;
          retryDelay = Math.max(Number.isFinite(seconds) ? seconds : 0, 500 * 2**attempt + Math.random()*200);
          if (status === 429) this.nextSlot = Math.max(this.nextSlot, Date.now()+retryDelay);
          await response.body?.cancel();
          if (attempt < this.config.PNCP_MAX_RETRIES) { await delay(retryDelay,op.signal); continue; }
          fail('PNCP_UNAVAILABLE', 'PNCP indisponível ou limitando requisições. Tente novamente.', 503, { origin: 'pncp', upstream_status: status, retry_after_seconds: Math.ceil(retryDelay/1000) }, true);
        }
        if (status === 204) { if (allowNoContent) return null; fail('INVALID_UPSTREAM', 'Busca PNCP retornou 204 sem conteúdo; não foi interpretado como zero resultados.', 502); }
        if (status < 200 || status >= 300) { await response.body?.cancel(); fail('PNCP_HTTP_ERROR', `PNCP retornou HTTP ${status}.`, 502, { upstream_status: status, origin:'pncp' }); }
        if (!(response.headers.get('content-type') || '').toLowerCase().includes('json')) {
          await response.body?.cancel();
          fail('INVALID_UPSTREAM', 'PNCP retornou conteúdo diferente de JSON.', 502);
        }
        const body = await this.readBody(response, op, signal);
        let result;
        try { result = parse(body); } catch { fail('INVALID_UPSTREAM', 'PNCP retornou JSON inválido.', 502); }
        op.check(); return result;
      } catch (error) {
        if (op.signal.aborted) throw op.signal.reason;
        if (error instanceof AppError) throw error;
        if (attempt < this.config.PNCP_MAX_RETRIES) { retryDelay = 500 * 2**attempt + Math.random()*200; }
        else {
          const timeout=error.name==='TimeoutError' || typeof error.cause?.code==='string' && error.cause.code.includes('TIMEOUT');
          fail(timeout?'PNCP_TIMEOUT':'PNCP_TRANSPORT_ERROR','Não foi possível concluir a chamada ao PNCP.',timeout?504:503,{origin:'pncp'},true);
        }
      } finally {
        this.release(); this.lastCall = { at: new Date().toISOString(), status, elapsed_ms: Date.now()-started, endpoint: new URL(url).pathname };
        this.logger({ event:'upstream', request_id:op.id, ...this.lastCall, attempt });
      }
      if (retryDelay) await delay(retryDelay, op.signal);
    }
  }
  async search(query, page, size, op) {
    const result = await this.get(`${this.config.PNCP_SEARCH_BASE_URL}/?${serializeSearch(query,page,size)}`,op);
    assert(result && typeof result === 'object' && Array.isArray(result.items) && result.items.every(v => v && typeof v === 'object' && !Array.isArray(v)), 'INVALID_UPSTREAM', 'Resposta da busca PNCP não contém items válidos.', 502);
    const total = integer(result.total, 'total');
    assert(result.items.length <= size, 'INVALID_UPSTREAM', 'Busca PNCP retornou mais documentos do que o tamanho solicitado.', 502, { requested_size: size, received_size: result.items.length });
    // doc_type is search-index metadata (e.g. "_doc"), not the business type.
    assert(result.items.every(v => v.document_type === query.document_type), 'INVALID_UPSTREAM', 'Busca PNCP retornou document_type incompatível com o tipo solicitado.', 502, { field: 'document_type', expected_document_type: query.document_type, received_document_types: [...new Set(result.items.map(v => scalarText(v.document_type)))].slice(0,20) });
    return { items: result.items, total };
  }
  async domains(type, normatives, op, field = null) {
    if(Object.hasOwn(referenceDomains,field))return {filters:{[field]:referenceDomains[field].map(o=>({...o}))},warnings:[],raw:{},partial_domains:[],domain_source:'reference'};
    if(Object.hasOwn(catalogDomains,field)) {
      const result=await this.get(`${this.config.PNCP_DETAIL_BASE_URL}/${catalogDomains[field]}`,op);
      const domain=domainAliases[field] || field;
      return {filters:{[domain]:normalizeCatalog(result)},warnings:[],raw:{[domain]:plain(result)},partial_domains:[]};
    }
    const params = new URLSearchParams({ tipos_documento: type }); if (normatives) params.set('normativos_base',normatives.join('|'));
    const result = await this.get(`${this.config.PNCP_SEARCH_BASE_URL}/filters?${params}`,op);
    assert(result?.filters && typeof result.filters === 'object' && !Array.isArray(result.filters), 'INVALID_UPSTREAM', 'PNCP não retornou o objeto filters.', 502);
    const filters=Object.fromEntries(Object.entries(result.filters).map(([k,v])=>[k,normalizeOptions(v,k)]));
    const years=Array.isArray(result.filters.anos) ? result.filters.anos : result.filters.anos?.items;
    const omitted=Array.isArray(years) ? years.length-filters.anos.length : 0;
    const warnings=omitted>0 ? [{code:'INVALID_DOMAIN_OPTIONS',domain:'anos',omitted_options:omitted,message:`${omitted} opção(ões) de ano fornecida(s) pelo PNCP não atende(m) ao formato AAAA e foi(ram) omitida(s).`}] : [];
    return { filters, warnings, raw: plain(result.filters), partial_domains: partialDomains };
  }
  async suggest(type, field, q, size, op) {
    const params = new URLSearchParams({ tipos_documento:type, campo:field, q, tam_pagina:String(size) });
    const result = await this.get(`${this.config.PNCP_SEARCH_BASE_URL}/suggest?${params}`,op);
    assert(Array.isArray(result?.items), 'INVALID_UPSTREAM', 'PNCP não retornou sugestões válidas.', 502);
    return { items:normalizeOptions(result.items,field).slice(0,size) };
  }
  async itemQuantity(purchase, op) {
    const result = await this.get(`${this.config.PNCP_DETAIL_BASE_URL}/orgaos/${purchase.cnpj}/compras/${purchase.ano}/${purchase.sequencial}/itens/quantidade`,op);
    return integer(result, 'Quantidade de itens');
  }
  async itemPage(purchase, page, size, op) {
    const params = new URLSearchParams({ pagina:String(page), tamanhoPagina:String(size) });
    const result = await this.get(`${this.config.PNCP_DETAIL_BASE_URL}/orgaos/${purchase.cnpj}/compras/${purchase.ano}/${purchase.sequencial}/itens?${params}`,op,true);
    assert(result === null || Array.isArray(result) && result.every(v=>v && typeof v === 'object' && !Array.isArray(v)), 'INVALID_UPSTREAM', 'Serviço de itens retornou formato inesperado.', 502);
    const items = result || []; op.itemCount += items.length;
    assert(op.itemCount <= this.config.PNCP_MAX_DETAIL_ITEMS, 'DETAIL_ITEM_LIMIT', 'Limite de itens da operação excedido.', 422);
    for(const item of items) {
      itemSituation(item);
      for(const field of ['materialOuServico','descricao','situacaoCompraItemNome'])assert(item[field]==null || typeof item[field]==='string','INVALID_UPSTREAM',`Campo ${field} com tipo incompatível no PNCP.`,502,{field});
      assert(item.catalogo==null || typeof item.catalogo==='object' && !Array.isArray(item.catalogo),'INVALID_UPSTREAM','Catálogo do item com tipo incompatível no PNCP.',502);
    }
    return items;
  }
  async relatedPage(purchase, resource, page, size, op) {
    assert(relatedResources.includes(resource), 'NOT_FOUND', 'Listagem não encontrada.', 404);
    const base = `${this.config.PNCP_DETAIL_BASE_URL}/orgaos/${purchase.cnpj}`;
    const path = resource === 'contratos' ? `${base}/contratos/contratacao/${purchase.ano}/${purchase.sequencial}` : `${base}/compras/${purchase.ano}/${purchase.sequencial}/${resource}`;
    const counted = ['arquivos', 'historico'].includes(resource);
    let total = counted ? integer(await this.get(`${path}/quantidade`, op), 'Quantidade de registros') : null;
    if (counted) assert(page <= Math.max(1, Math.ceil(total / size)), 'PAGE_OUT_OF_RANGE', 'Página além da listagem atual.', 422, { last_page: Math.max(1, Math.ceil(total / size)) });
    const params = new URLSearchParams({ pagina: String(page), tamanhoPagina: String(size) });
    let result;
    try { result = total === 0 ? [] : await this.get(`${path}?${params}`, op, true); }
    catch (error) {
      if (resource !== 'contratos' || !(error instanceof AppError) || error.code !== 'PNCP_HTTP_ERROR' || error.details.upstream_status !== 404) throw error;
      result = null;
    }
    const data = counted ? result || [] : result === null ? [] : result?.data;
    if (!counted) total = result === null ? 0 : integer(result?.totalRegistros, 'Total de registros');
    assert(Array.isArray(data) && data.every(v => v && typeof v === 'object' && !Array.isArray(v)), 'INVALID_UPSTREAM', 'Listagem PNCP retornou formato inesperado.', 502);
    const pages = Math.max(1, Math.ceil(total / size));
    assert(page <= pages, 'PAGE_OUT_OF_RANGE', 'Página além da listagem atual.', 422, { last_page: pages });
    if (!counted && result !== null && result.numeroPagina != null) assert(integer(result.numeroPagina, 'Número da página') === page, 'INVALID_UPSTREAM', 'PNCP retornou outra página da listagem.', 502);
    assert(data.length === Math.min(size, Math.max(0, total - (page - 1) * size)), 'SOURCE_CHANGED', 'A página não corresponde ao total informado pelo PNCP. Repita a consulta.', 409, {}, true);
    return { data: data.map(record => projectRelated(resource, record, purchase)), total, total_pages: pages };
  }
  async document(document,op) {
    assert(['ata','contrato'].includes(document.type),'NOT_FOUND','Tipo de detalhe não disponível.',404);
    const record=await this.get(nativeDocumentPath(document,this.config.PNCP_DETAIL_BASE_URL),op);
    const expected=`https://pncp.gov.br/app/${document.type==='ata'?'atas':'contratos'}/${document.cnpj}/${document.ano}/${document.type==='ata'?`${BigInt(document.sequencial_compra)}/`:''}${BigInt(document.sequencial)}`;
    assert(record && typeof record==='object' && !Array.isArray(record) && controlLink(record.numeroControlePNCP)===expected,'INVALID_UPSTREAM','PNCP retornou detalhes de outro documento ou sem identidade válida.',502);
    return projectDocument(document.type,record);
  }
  async documentRelatedPage(document,resource,page,size,op) {
    assert(documentResources[document.type]?.includes(resource),'NOT_FOUND','Listagem não disponível para este documento.',404);
    if(document.type==='edital')return this.relatedPage(document,resource,page,size,op);
    const path=`${nativeDocumentPath(document,this.config.PNCP_DETAIL_BASE_URL)}/${resource}`;
    const counted=['arquivos','historico','termos'].includes(resource),unpaged=resource==='instrumentocobranca';
    let total=counted?integer(await this.get(`${path}/quantidade`,op),'Quantidade de registros'):null;
    if(counted)assert(page<=Math.max(1,Math.ceil(total/size)),'PAGE_OUT_OF_RANGE','Página além da listagem atual.',422,{last_page:Math.max(1,Math.ceil(total/size))});
    const params=new URLSearchParams({pagina:String(page),tamanhoPagina:String(size)});
    let result;
    try { result=total===0?[]:await this.get(unpaged?path:`${path}?${params}`,op,true); }
    catch(error) {
      if(document.type!=='contrato' || !['empenhos','instrumentocobranca'].includes(resource) || !(error instanceof AppError) || error.code!=='PNCP_HTTP_ERROR' || error.details.upstream_status!==404)throw error;
      result=null;
    }
    let data=counted || unpaged?result || []:result===null?[]:result?.data;
    if(!counted)total=unpaged?(Array.isArray(data)?data.length:0):result===null?0:integer(result?.totalRegistros,'Total de registros');
    assert(Array.isArray(data) && data.every(v=>v && typeof v==='object' && !Array.isArray(v)),'INVALID_UPSTREAM','Listagem PNCP retornou formato inesperado.',502);
    assert(total<=this.config.PNCP_MAX_DETAIL_ITEMS,'DETAIL_ITEM_LIMIT','Limite de registros da operação excedido.',422);
    const pages=Math.max(1,Math.ceil(total/size));
    assert(page<=pages,'PAGE_OUT_OF_RANGE','Página além da listagem atual.',422,{last_page:pages});
    if(!counted && !unpaged && result!==null && result.numeroPagina!=null)assert(integer(result.numeroPagina,'Número da página')===page,'INVALID_UPSTREAM','PNCP retornou outra página da listagem.',502);
    if(unpaged)data=data.slice((page-1)*size,page*size);
    assert(data.length===Math.min(size,Math.max(0,total-(page-1)*size)),'SOURCE_CHANGED','A página não corresponde ao total informado pelo PNCP. Repita a consulta.',409,{},true);
    return {data:data.map(record=>{
      if(resource==='partesenvolvidas')return {fields:recordFields(resource,record)};
      if(['termos','empenhos','instrumentocobranca'].includes(resource)){
        const sequence=scalarText(record[{termos:'sequencialTermoContrato',empenhos:'sequencialEmpenho',instrumentocobranca:'sequencialInstrumentoCobranca'}[resource]]);
        return {fields:recordFields(resource,record),sequencial:/^\d+$/.test(sequence || '') && BigInt(sequence)>0n?sequence:null};
      }
      return projectRelated(resource,record,document);
    }),total,total_pages:pages,pagination_source:unpaged?'local_slice':'pncp'};
  }
  async contractChild(document,resource,sequence,op) {
    assert(document.type==='contrato' && ['termos','empenhos','instrumentocobranca'].includes(resource) && typeof sequence==='string' && sequence.length<=256 && /^\d+$/.test(sequence) && BigInt(sequence)>0n,'NOT_FOUND','Detalhe não encontrado.',404);
    const path=`${nativeDocumentPath(document,this.config.PNCP_DETAIL_BASE_URL)}/${resource}/${sequence}`;
    if(resource==='termos'){
      const files=await this.get(`${path}/arquivos`,op,true);
      assert(files===null || Array.isArray(files) && files.every(v=>v && typeof v==='object' && !Array.isArray(v)),'INVALID_UPSTREAM','Arquivos do termo retornaram formato inesperado.',502);
      assert((files?.length ?? 0)<=this.config.PNCP_MAX_DETAIL_ITEMS,'DETAIL_ITEM_LIMIT','Limite de arquivos da operação excedido.',422);
      return {files:(files || []).map(record=>projectRelated('arquivos',record,document))};
    }
    return {fields:recordFields(resource,await this.get(path,op))};
  }
  async close() {}
}
