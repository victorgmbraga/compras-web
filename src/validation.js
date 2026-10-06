import { assert, checkKeys } from './errors.js';
import { capabilities, reserved } from './schema.js';

export const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const validDecimal = s => typeof s === 'string' && /^\d+(?:\.\d+)?$/.test(s) && s.length <= 100;
export function compareDecimal(a, b) {
  const parts = s => { const neg = s.startsWith('-'); const [i, f = ''] = (neg ? s.slice(1) : s).split('.'); return { neg, i: i.replace(/^0+(?=\d)/, ''), f }; };
  const x = parts(a), y = parts(b);
  if (x.neg !== y.neg) return x.neg ? -1 : 1;
  const l = Math.max(x.f.length, y.f.length);
  const out = x.i.length === y.i.length ? (x.i + x.f.padEnd(l, '0')).localeCompare(y.i + y.f.padEnd(l, '0'), 'en') : x.i.length - y.i.length;
  return x.neg ? -Math.sign(out) : Math.sign(out);
}
export function validateFilters(filters, config) {
  checkKeys(filters, capabilities(config).filter(c => !c.reserved).map(c => c.name), 'pncp_filters');
  const map = Object.fromEntries(capabilities(config).map(c => [c.name, c]));
  const out = {};
  for (const [name, value] of Object.entries(filters)) {
    assert(!reserved.includes(name), 'RESERVED_PARAMETER', `${name} é reservado ao adaptador.`);
    const cap = map[name];
    assert(cap.state === 'enabled' && cap.documents.includes('edital'), 'CAPABILITY_PENDING', `Filtro ${name} ainda não validado para contratações.`, 409, { field: name, reason: cap.reason });
    if (cap.type === 'list') {
      assert(Array.isArray(value) && value.length >= 1 && value.length <= 100 && value.every(v => typeof v === 'string' && v.length > 0 && v.length <= 256 && !v.includes('|') && !/[\u0000-\u001f]/u.test(v)), 'INVALID_TYPE', `${name} exige lista de strings, sem pipe.`);
      if (name === 'ufs') assert(value.every(v => ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(v)), 'INVALID_DOMAIN', 'UF inválida.');
      if (name === 'esferas') assert(value.every(v => ['F','E','M','D','N'].includes(v)), 'INVALID_DOMAIN', 'Esfera inválida.');
      if (name === 'poderes') assert(value.every(v => ['E','L','J','N'].includes(v)), 'INVALID_DOMAIN', 'Poder inválido.');
      if (name === 'anos') assert(value.every(v => /^\d{4}$/.test(v)), 'INVALID_DOMAIN', 'Ano inválido.');
      if (!['ufs', 'esferas', 'poderes', 'anos', 'unidades_medida'].includes(name)) assert(value.every(v => /^\d+$/.test(v)), 'INVALID_DOMAIN', `${name} exige IDs do domínio, não nomes ou códigos administrativos.`);
    } else if (cap.type === 'boolean') assert(typeof value === 'boolean', 'INVALID_TYPE', `${name} exige booleano.`);
    else if (cap.type === 'date') assert(validDate(value), 'INVALID_DATE', `${name} exige data real AAAA-MM-DD.`);
    else if (cap.type === 'decimal') assert(validDecimal(value), 'INVALID_DECIMAL', `${name} exige decimal como string com ponto.`);
    else if (cap.type === 'integer') assert(Number.isSafeInteger(value) && value >= 0, 'INVALID_TYPE', `${name} exige inteiro não negativo.`);
    else assert(typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('|'), 'INVALID_TYPE', `${name} exige string única.`);
    if (name === 'codigo_ibge') assert(/^\d{7}$/.test(value), 'INVALID_DOMAIN', 'codigo_ibge exige sete dígitos.');
    if (name === 'tipos_item') assert(['S', 'M'].includes(value), 'INVALID_DOMAIN', 'tipos_item exige S ou M.');
    out[name] = value;
  }
  for (const key of Object.keys(out)) {
    const pair = key.endsWith('_inicio') ? key.slice(0, -7) + '_fim' : key.endsWith('_min') ? key.slice(0, -4) + '_max' : null;
    if (pair && out[pair] !== undefined) assert(map[key].type === 'decimal' ? compareDecimal(out[key], out[pair]) <= 0 : out[key] <= out[pair], 'INVERTED_RANGE', `Intervalo invertido: ${key} / ${pair}.`);
  }
  return out;
}
export function validateQuery(input, config) {
  checkKeys(input, ['api_version','document_type','q','status','pncp_filters','order','page','size'], 'query');
  const q = { api_version: '2.0', document_type: 'edital', q: '', status: 'todos', pncp_filters: {}, order: '-data', page: 1, size: config.PNCP_PAGE_SIZE, ...input };
  assert(q.api_version === '2.0', 'INCOMPATIBLE_VERSION', 'Use api_version 2.0.');
  assert(q.document_type === 'edital', 'DOCUMENT_TYPE_UNAVAILABLE', 'Somente contratações (edital) estão habilitadas.', 409);
  assert(typeof q.q === 'string' && q.q.length <= 128, 'INVALID_QUERY_TEXT', 'A busca textual permite até 128 caracteres.');
  assert(['todos','recebendo_proposta','propostas_encerradas'].includes(q.status), 'INVALID_STATUS', 'Status temporal inválido.');
  assert(['-data','data','relevancia'].includes(q.order) && (q.order !== 'relevancia' || q.q.trim()), 'INVALID_ORDER', 'Ordenação não habilitada ou relevância sem busca textual.');
  assert(Number.isSafeInteger(q.page) && q.page > 0, 'INVALID_PAGE', 'page deve ser inteiro positivo.');
  assert([10,25,50,100].includes(q.size), 'INVALID_SIZE', 'size deve ser 10, 25, 50 ou 100.');
  q.pncp_filters = validateFilters(q.pncp_filters, config);
  assert(q.page * q.size <= 10000, 'PAGE_OUT_OF_RANGE', 'Página além da janela de 10000 documentos.', 422, { last_page: Math.floor(10000/q.size) });
  return q;
}
