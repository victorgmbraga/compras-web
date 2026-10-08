import { assert } from '../errors.js';
import { validateQuery } from '../validation.js';

const controls = { tipos_documento: 'document_type', q: 'q', status: 'status', ordenacao: 'order', pagina: 'page' };
const filterCapabilities = schema => schema.capabilities.filter(cap => !cap.reserved);

function single(params, name) {
  const values = params.getAll(name);
  assert(values.length <= 1, 'INVALID_URL_PARAMETERS', `O parâmetro ${name} não pode ser repetido.`);
  return values[0];
}
function integer(value, name) {
  assert(/^\d+$/.test(value) && Number.isSafeInteger(Number(value)), 'INVALID_URL_PARAMETERS', `O parâmetro ${name} exige um inteiro válido.`);
  return Number(value);
}

export function readQueryUrl(href, schema, size = 100) {
  const params = new URL(href).searchParams, input = { size, pncp_filters: {} };
  for (const [name, field] of Object.entries(controls)) {
    const value = single(params, name);
    if (value !== undefined) input[field] = field === 'page' ? integer(value, name) : value;
  }
  const type = input.document_type ?? 'edital';
  assert(schema.document_types.some(document => document.enabled && document.id === type), 'DOCUMENT_TYPE_UNAVAILABLE', 'Escolha edital, ata ou contrato.');
  for (const cap of filterCapabilities(schema)) {
    if (!params.has(cap.name)) continue;
    assert(cap.state === 'enabled' && cap.documents.includes(type), 'DOCUMENT_FILTER_UNAVAILABLE', `Filtro ${cap.name} não está disponível para ${type}.`);
    let value;
    if (cap.type === 'list') value = params.getAll(cap.name).flatMap(text => text.split('|'));
    else {
      value = single(params, cap.name);
      if (cap.type === 'boolean') {
        assert(value === 'true' || value === 'false', 'INVALID_URL_PARAMETERS', `O parâmetro ${cap.name} exige true ou false.`);
        value = value === 'true';
      } else if (cap.type === 'integer') value = integer(value, cap.name);
    }
    input.pncp_filters[cap.name] = value;
  }
  return validateQuery(input, { PNCP_PAGE_SIZE: size, PNCP_VALIDATED_FILTERS: '' });
}

export function writeQueryUrl(href, query, schema) {
  const url = new URL(href);
  for (const name of [...Object.keys(controls), ...filterCapabilities(schema).map(cap => cap.name)]) url.searchParams.delete(name);
  url.searchParams.set('tipos_documento', query.document_type);
  if (query.q) url.searchParams.set('q', query.q);
  if (query.status !== 'todos') url.searchParams.set('status', query.status);
  url.searchParams.set('ordenacao', query.order);
  url.searchParams.set('pagina', String(query.page));
  for (const name of Object.keys(query.pncp_filters).sort()) {
    const value = query.pncp_filters[name];
    url.searchParams.set(name, Array.isArray(value) ? value.join('|') : String(value));
  }
  return url.href;
}
