import { assert } from './errors.js';

const cell = value => '"' + (value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)).replace(/"/g, '""') + '"';

export function csvWriter(columns, limit) {
  const encoder = new TextEncoder(), chunks = [];
  let bytes = 0;
  function append(text) {
    const chunk = encoder.encode(text);
    assert(bytes + chunk.byteLength <= limit, 'EXPORT_BYTES_LIMIT', 'Limite do buffer CSV excedido. Delimite a pesquisa.', 422);
    bytes += chunk.byteLength; chunks.push(chunk);
  }
  append('\ufeff' + columns.map(c => cell(c.field)).join(',') + '\r\n');
  return { chunks, get bytes() { return bytes; }, append(documents) {
    append(documents.map(doc => columns.map(c => cell(doc[c.field])).join(',') + '\r\n').join(''));
  } };
}
