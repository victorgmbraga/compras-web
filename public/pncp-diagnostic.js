import { createWorkerService } from '../src/browser/service.js';
import { catalogDomains } from '../src/filter-domains.js';

const samples = [
  ...['edital','ata','contrato'].map(type => ({ name: 'Busca ' + type, method: 'execute', payload: { query: { document_type: type, q: 'software', size: 10 } } })),
  { name: 'Paginação', method: 'execute', payload: { query: { q: 'software', page: 2, size: 10 } } },
  { name: 'Filtros', method: 'domains', payload: { type: 'edital' } },
  { name: 'Sugestões', method: 'suggest', payload: { type: 'edital', field: 'orgaos', q: 'universidade', size: 5 } },
  { name: 'Ordenação e filtro', method: 'execute', payload: { query: { q: 'software', order: 'data', pncp_filters: { ufs: ['DF'] }, size: 10 } } },
  ...Object.keys(catalogDomains).map(field => ({ name: 'Catálogo / ' + field, method: 'domains', payload: { type: 'edital', field } })),
];
const purchase = { type: 'edital', cnpj: '00394452000103', ano: '2026', sequencial: '21678' };
const ata = { type: 'ata', cnpj: '88585518000185', ano: '2026', sequencial_compra: '469', sequencial: '1' };
const contract = { type: 'contrato', cnpj: '10870883000144', ano: '2021', sequencial: '30' };
samples.push({ name: 'Itens e quantidade', method: 'details', payload: { document: purchase, page: 1, size: 10 } });
for (const document of [purchase, ata, contract]) {
  if (document.type !== 'edital') samples.push({ name: 'Detalhe ' + document.type, method: 'documentDetails', payload: { document } });
  const resources = { edital: ['arquivos','atas','contratos','historico'], ata: ['partesenvolvidas','contratos','arquivos','historico'], contrato: ['empenhos','instrumentocobranca','termos','arquivos','historico'] }[document.type];
  for (const resource of resources) samples.push({ name: document.type + ' / ' + resource, method: 'documentRelated', payload: { document, resource, page: 1, size: 10 } });
}
for (const resource of ['termos','empenhos','instrumentocobranca']) samples.push({ name: 'Registro filho / ' + resource, method: 'contractChild', payload: { document: contract, resource, sequence: '1' } });
samples.push(
  { name: 'Contratação com atas vinculadas', method: 'documentRelated', payload: { document: { type: 'edital', cnpj: '88585518000185', ano: '2026', sequencial: '469' }, resource: 'atas', page: 1, size: 10 } },
  { name: 'Contratação com contrato vinculado', method: 'documentRelated', payload: { document: { type: 'edital', cnpj: '18629840000183', ano: '2026', sequencial: '51' }, resource: 'contratos', page: 1, size: 10 } },
);
let controller, evidence;
const $ = id => document.getElementById(id);
$('diagnostic-run').addEventListener('click', async () => {
  const service = createWorkerService({ PNCP_MAX_RETRIES: 0, PNCP_READ_TIMEOUT_SECONDS: 15 });
  controller = new AbortController(); evidence = { date: new Date().toISOString(), origin: location.origin, user_agent: navigator.userAgent, direct_worker_requests: true, samples: [] };
  const children = new Map();
  $('diagnostic-run').disabled = true; $('diagnostic-cancel').disabled = false; $('diagnostic-save').disabled = true;
  try {
    // A direct window fetch records only statuses and headers actually exposed by CORS.
    try {
      const response = await fetch('https://pncp.gov.br/api/search/?tipos_documento=edital&status=todos&ordenacao=-data&pagina=1&tam_pagina=10&q=software', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
      const text = await response.text(); let readableJSON = false; try { JSON.parse(text); readableJSON = true; } catch {}
      evidence.window_fetch = { status: response.status, type: response.type, readable_json: readableJSON, visible_headers: Object.fromEntries(response.headers) };
    } catch (error) { evidence.window_fetch = { error: error.name, message: error.message }; }
    for (const sample of samples) {
      if (controller.signal.aborted) break;
      $('diagnostic-status').textContent = 'Consultando: ' + sample.name;
      const payload = sample.method === 'contractChild' && children.has(sample.payload.resource) ? { ...sample.payload, sequence: children.get(sample.payload.resource) } : sample.payload;
      try {
        const result = await service.call(sample.method, payload, { signal: controller.signal });
        if (sample.method === 'documentRelated' && sample.payload.document.type === 'contrato') {
          const sequence = result.data?.find(row => row.sequencial)?.sequencial;
          if (sequence) children.set(sample.payload.resource, sequence);
        }
        evidence.samples.push({ name: sample.name, method: sample.method, payload, ok: true, source: result.source, total: result.total ?? result.total_items ?? result.files?.length, fields: result.fields?.length, upstream_requests: result.upstream_requests });
      } catch (error) { evidence.samples.push({ name: sample.name, method: sample.method, payload, ok: false, code: error.code, message: error.message, upstream_status: error.details?.upstream_status }); }
      $('diagnostic-output').textContent = JSON.stringify(evidence, null, 2);
    }
    $('diagnostic-status').textContent = controller.signal.aborted ? 'Verificação cancelada.' : 'Verificação concluída. Falhas de transporte não identificam automaticamente CORS ou indisponibilidade.';
  } finally { service.close(); $('diagnostic-run').disabled = false; $('diagnostic-cancel').disabled = true; $('diagnostic-save').disabled = false; }
});
$('diagnostic-cancel').addEventListener('click', () => controller?.abort());
$('diagnostic-save').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'pncp-browser-evidence.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
});
