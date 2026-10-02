import data from './business-data.json' with { type: 'json' };
import { assert } from './errors.js';

export const OPERATORS = ['like', 'not_like', '=', '!=', 'starts', 'ends', 'regex', 'empty', 'not_empty'];
const column = (field, title, type = 'text', extra = {}) => ({ field, title, type, filter_modes: type === 'text' ? ['refined'] : [], operators: type === 'text' ? OPERATORS : [], sortable: true, ...extra });
export const columns = [
  column('id', 'ID'), column('tipo_documento', 'Tipo'), column('numero_controle_pncp', 'Controle PNCP'),
  column('objeto_compra', 'Objeto', 'text', { visible: true, width: 470 }),
  column('titulo', 'Título', 'text', { visible: true, width: 260 }), column('orgao_cnpj', 'CNPJ do órgão'),
  column('orgao_nome', 'Órgão', 'text', { visible: true, width: 285, domain: 'orgaos', filter_modes: ['native', 'refined'] }),
  column('unidade_orgao_nome_unidade', 'Unidade', 'text', { visible: true, width: 240, domain: 'unidades', filter_modes: ['native', 'refined'] }),
  column('unidade_orgao_codigo_unidade', 'Código da unidade'),
  column('orgao_entidade_esfera_id', 'Esfera', 'text', { domain: 'esferas', filter_modes: ['native', 'refined'] }),
  column('orgao_entidade_poder_id', 'Poder', 'text', { domain: 'poderes', filter_modes: ['native', 'refined'] }),
  column('uf', 'UF', 'text', { visible: true, width: 85, domain: 'ufs', filter_modes: ['native', 'refined'] }),
  column('municipio_nome', 'Município', 'text', { visible: true, width: 180, domain: 'municipios', filter_modes: ['native', 'refined'] }),
  column('modalidade_nome', 'Modalidade', 'text', { visible: true, width: 195, domain: 'modalidades', filter_modes: ['native', 'refined'] }),
  column('situacao_compra_nome_pncp', 'Situação', 'text', { visible: true, width: 195, domain: 'situacoes', filter_modes: ['native', 'refined'] }),
  column('data_publicacao_pncp', 'Publicação', 'date', { visible: true, width: 145, native_order: { asc: 'data', desc: '-data' }, native_range: ['data_publicacao_inicio', 'data_publicacao_fim'] }),
  column('data_atualizacao_pncp', 'Atualização', 'date'),
  column('valor_total_estimado', 'Valor estimado', 'decimal', { visible: true, width: 175, native_range: ['valor_total_estimado_min', 'valor_total_estimado_max'] }),
  column('valor_total_homologado', 'Valor homologado', 'decimal', { native_range: ['valor_total_homologado_min', 'valor_total_homologado_max'] }),
  column('tem_resultado', 'Tem resultado', 'boolean'), column('link_sistema_origem', 'Sistema de origem'),
  column('url_pncp', 'Link PNCP'), column('categorizacao', 'Categorias', 'text', { visible: true, width: 235 }),
];
export const columnMap = Object.fromEntries(columns.map(c => [c.field, c]));
export const domainAliases = {
  situacoes_item: 'item_situacoes', tipos_item: 'item_tipos', categorias_leilao: 'item_categorias_leilao',
  beneficios: 'item_beneficios', unidades_medida: 'item_unidades_medida', situacoes_resultado: 'resultado_item_situacoes',
};
export const reserved = ['tipos_documento', 'q', 'status', 'ordenacao', 'pagina', 'tam_pagina', 'total'];
// Enabled core filters are grounded in the supplied PNCP reference examples.
// Other portal arguments are catalogued, but deliberately require verification.
export const initialEnabled = ['ufs', 'orgaos', 'unidades', 'municipios', 'esferas', 'poderes', 'modalidades', 'situacoes', 'anos', 'data_publicacao_inicio', 'data_publicacao_fim', 'valor_total_estimado_min', 'valor_total_estimado_max', 'valor_total_homologado_min', 'valor_total_homologado_max'];
export function capabilities(config) {
  const additional = config.PNCP_VALIDATED_FILTERS.split(',').map(s => s.trim()).filter(Boolean);
  for (const name of additional) assert(data.arguments.some(a => a.name === name) && !reserved.includes(name), 'INVALID_CONFIG', `Filtro validado desconhecido ou reservado: ${name}.`);
  return data.arguments.map(a => {
    const isReserved = reserved.includes(a.name);
    const type = a.format.includes('lista') ? 'list' : a.format.includes('booleano') ? 'boolean' : a.format === 'data' ? 'date' : a.format.includes('decimal') ? 'decimal' : a.format.includes('inteiro') ? 'integer' : 'text';
    const documents = a.context === 'Geral' ? ['edital', 'contrato', 'ata', 'pcaorgao', 'irp'] : ['E', 'C', 'A', 'P', 'I'].filter(k => a.context.split(' ').includes(k)).map(k => ({ E: 'edital', C: 'contrato', A: 'ata', P: 'pcaorgao', I: 'irp' })[k]);
    const enabled = isReserved || ((initialEnabled.includes(a.name) || additional.includes(a.name)) && documents.includes('edital'));
    return { ...a, type, cardinality: type === 'list' ? 'multiple' : 'single', documents, reserved: isReserved, domain: type === 'list' ? (domainAliases[a.name] || a.name) : null, state: enabled ? 'enabled' : 'pending_validation', evidence: additional.includes(a.name) ? 'server_configuration:PNCP_VALIDATED_FILTERS' : isReserved || initialEnabled.includes(a.name) ? 'supplied_reference:2.0.0; live_integration_not_verified_in_build_environment' : 'portal_bundle:buildCurrentQueryParams', reason: enabled ? null : 'Aplicação e domínio ainda não verificados para editais.' };
  });
}
const names = { all: 'Todas as contratações', personalizado: 'Pesquisa personalizada', desenvolvimento: 'Desenvolvimento', infraestrutura: 'Infraestrutura', oracle: 'Oracle', microsoft: 'Microsoft', adobe: 'Adobe', symantec: 'Symantec / Broadcom', antivirus: 'Antivírus e proteção', graebert: 'Graebert / CAD', mongodb: 'MongoDB' };
export const categorizePresets = ['all', 'desenvolvimento', 'infraestrutura', 'antivirus', 'graebert', 'mongodb'];
export function presets(config) {
  return Object.entries(data.presets).map(([id, rules]) => ({ id, name: names[id], mode: ['all', 'personalizado'].includes(id) ? 'native' : 'refined', categorize: categorizePresets.includes(id), available: !['desenvolvimento', 'infraestrutura'].includes(id) || !!config.PNCP_PRESET_CATALOG_ID, reason: ['desenvolvimento', 'infraestrutura'].includes(id) && !config.PNCP_PRESET_CATALOG_ID ? 'CATALOG_MAPPING_REQUIRED: associe os códigos a um catálogo oficial verificado.' : null, rules, catalog_id: ['desenvolvimento', 'infraestrutura'].includes(id) ? config.PNCP_PRESET_CATALOG_ID || null : null }));
}
export function schema(config) {
  return { source: config.DEMO_MODE ? 'demo' : 'pncp', api_version: '2.0', live: !config.DEMO_MODE, demo: config.DEMO_MODE, document_types: [{ id: 'edital', name: 'Contratações', enabled: true }, ...['ata', 'contrato', 'irp', 'pcaorgao'].map(id => ({ id, enabled: false, reason: 'Projeção ainda não implementada.' }))], columns, presets: presets(config), capabilities: capabilities(config), categories: Object.keys(data.categories).sort(), statuses: ['todos', 'recebendo_proposta', 'propostas_encerradas'], orders: ['-data', 'data', 'relevancia'], limits: { page_sizes: [10, 25, 50, 100], default_page_size: config.PNCP_PAGE_SIZE, search_window: 10000, refinement_candidates: config.PNCP_MAX_REFINEMENT_CANDIDATES, export_documents: config.PNCP_MAX_EXPORT_DOCUMENTS, max_rules: 60, max_sorters: 10, max_q_length: 128 }, regex: { engine: 'ECMAScript /iu in isolated worker with timeout', unsupported: ['Python inline flags and groups', 'backreferences', 'lookbehind', '\\b within a character class', 'Unicode IGNORECASE cases with dotless/dotted I'], timeout_ms: config.REGEX_TIMEOUT_MS } };
}
