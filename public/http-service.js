export function createHttpService({ fetcher = globalThis.fetch.bind(globalThis) } = {}) {
  const documentPath = d => `/api/${{ edital: 'contratacoes', ata: 'atas', contrato: 'contratos' }[d.type || 'edital']}/${d.cnpj}/${d.ano}/${d.type === 'ata' ? d.sequencial_compra + '/' : ''}${d.sequencial}`;
  return { async call(method, p = {}, { signal } = {}) {
    let url, body;
    switch (method) {
      case 'schema': url = '/api/schema'; break;
      case 'execute': url = '/api/query'; body = p.query; break;
      case 'export': url = '/api/export'; body = { query: p.query }; break;
      case 'domains': {
        const params = new URLSearchParams({ tipos_documento: p.type });
        if (p.normatives?.length) params.set('normativos_base', p.normatives.join('|'));
        if (p.field) params.set('campo', p.field);
        url = '/api/pncp/filters?' + params; break;
      }
      case 'suggest': url = '/api/pncp/suggest?' + new URLSearchParams({ tipos_documento: p.type, campo: p.field, q: p.q, tam_pagina: p.size }); break;
      case 'documentDetails': url = documentPath(p.document); break;
      case 'contractChild': url = `${documentPath(p.document)}/${p.resource}/${p.sequence}`; break;
      default: url = `${documentPath(p.document)}/${method === 'details' ? 'itens' : p.resource}?pagina=${p.page}&tamanhoPagina=${p.size}`;
    }
    const response = await fetcher(url, { cache: 'no-store', signal, ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      let payload; try { payload = await response.json(); } catch {}
      throw Object.assign(new Error(payload?.error?.message || `Erro HTTP ${response.status}.`), payload?.error);
    }
    if (method !== 'export') return response.json();
    return { chunks: [await response.arrayBuffer()], mime: 'text/csv; charset=utf-8', filename: response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'compras-pncp.csv', metadata: {
      exported_rows: Number(response.headers.get('x-exported-rows')), started_at: response.headers.get('x-pncp-started-at'), finished_at: response.headers.get('x-pncp-finished-at'),
    } };
  }, close() {} };
}
