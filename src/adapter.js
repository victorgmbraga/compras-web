import { isLosslessNumber } from 'lossless-json';
import { assert, fail } from './errors.js';

export const scalarText = value => value === null || value === undefined ? null : isLosslessNumber(value) ? value.toString() : typeof value === 'string' || typeof value === 'number' ? String(value) : null;
export const plain = value => isLosslessNumber(value) ? (/^-?\d+$/.test(value.toString()) && Number.isSafeInteger(Number(value.toString())) ? Number(value.toString()) : value.toString()) : Array.isArray(value) ? value.map(plain) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v)])) : value;
export function decimalText(value) {
  if(value!==null && value!==undefined && scalarText(value)===null)fail('INVALID_UPSTREAM','Campo monetário com tipo incompatível no PNCP.',502);
  const s = scalarText(value);
  if (s === null) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return s;
  const match = s.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match || Math.abs(Number(match[4])) > 1000) fail('INVALID_UPSTREAM', 'Valor monetário inválido no PNCP.', 502);
  const digits = match[2] + (match[3] || ''); const at = match[2].length + Number(match[4]);
  return match[1] + (at <= 0 ? '0.' + '0'.repeat(-at) + digits : at >= digits.length ? digits + '0'.repeat(at-digits.length) : digits.slice(0,at)+'.'+digits.slice(at));
}
export function safeLink(value, portal = false) {
  if (typeof value !== 'string' || !value) return portal ? 'https://pncp.gov.br/app' : null;
  try {
    let url;
    if (portal && /^\/(?:app\/)?(?:compras|editais|atas|contratos|irp|pca)\//.test(value)) {
      url = new URL(value.startsWith('/app/') ? value : '/app' + value, 'https://pncp.gov.br');
      if (!/^\/app\/(?:compras|editais|atas|contratos|irp|pca)\//.test(url.pathname)) return 'https://pncp.gov.br/app';
    }
    else url = new URL(value);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || (portal && url.origin !== 'https://pncp.gov.br')) return portal ? 'https://pncp.gov.br/app' : null;
    return url.href;
  } catch { return portal ? 'https://pncp.gov.br/app' : null; }
}
export function itemSituation(item) {
  // The live read endpoint uses situacaoCompraItem; the manual uses ...Id.
  const fields=['situacaoCompraItem','situacaoCompraItemId'];
  const values=fields.map(field=>{
    const value=item[field];
    assert(value==null || scalarText(value)!==null,'INVALID_UPSTREAM',`Campo ${field} com tipo incompatível no PNCP.`,502,{field});
    return scalarText(value);
  });
  assert(!values[0] || !values[1] || values[0]===values[1],'INVALID_UPSTREAM','Situações conflitantes nos campos de situação do item PNCP.',502,{fields});
  return values[0] || values[1] || null;
}
export function identity(raw) {
  const type = scalarText(raw.document_type); const control = scalarText(raw.numero_controle_pncp); const id = scalarText(raw.id);
  return type && (control || id) ? `${type}:${control || id}` : null;
}
export function purchaseIdentity(raw) {
  // Only the original identifiers supplied by the source are used.
  const cnpj = scalarText(raw.orgao_cnpj), year = scalarText(raw.ano), sequence = scalarText(raw.numero_sequencial);
  return /^\d{14}$/.test(cnpj || '') && /^\d{4}$/.test(year || '') && /^\d+$/.test(sequence || '') && BigInt(sequence) > 0n ? { cnpj, ano: year, sequencial: sequence } : null;
}
export function project(raw) {
  const mapping = { id:'id',tipo_documento:'document_type',numero_controle_pncp:'numero_controle_pncp',objeto_compra:'description',titulo:'title',orgao_cnpj:'orgao_cnpj',orgao_nome:'orgao_nome',unidade_orgao_nome_unidade:'unidade_nome',unidade_orgao_codigo_unidade:'unidade_codigo',orgao_entidade_esfera_id:'esfera_id',orgao_entidade_poder_id:'poder_id',uf:'uf',municipio_nome:'municipio_nome',modalidade_nome:'modalidade_licitacao_nome',situacao_compra_nome_pncp:'situacao_nome',data_publicacao_pncp:'data_publicacao_pncp',data_atualizacao_pncp:'data_atualizacao_pncp' };
  const identifierFields=['id','numero_controle_pncp','orgao_cnpj','unidade_codigo','esfera_id','poder_id'];
  const result = Object.fromEntries(Object.entries(mapping).map(([key, origin]) => {
    const value=raw[origin];
    if(value!==undefined && value!==null && (identifierFields.includes(origin)?scalarText(value)===null:typeof value!=='string'))fail('INVALID_UPSTREAM',`Campo ${origin} com tipo incompatível no PNCP.`,502);
    return [key,scalarText(value)];
  }));
  if(raw.tem_resultado!==undefined && raw.tem_resultado!==null && typeof raw.tem_resultado!=='boolean')fail('INVALID_UPSTREAM','tem_resultado não é booleano no PNCP.',502);
  Object.assign(result, { valor_total_estimado: decimalText(raw.valor_total_estimado), valor_total_homologado: decimalText(raw.valor_total_homologado), tem_resultado: typeof raw.tem_resultado === 'boolean' ? raw.tem_resultado : null, link_sistema_origem: safeLink(raw.link_sistema_origem), url_pncp: safeLink(raw.item_url, true), categorizacao: '', _identity: identity(raw), _purchase: purchaseIdentity(raw), _raw: plain(raw), matching_item_numbers: [] });
  return result;
}
