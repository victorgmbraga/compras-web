import argumentsList from './pncp-arguments.json' with { type: 'json' };
import { assert } from './errors.js';
import { domainAliases, catalogDomains, partialDomains, closedDomains, filterPresentation } from './filter-domains.js';
export { domainAliases } from './filter-domains.js';

const column = (field, title, type = 'text', extra = {}) => ({ field, title, type, ...extra });
export const columns = [
  column('id', 'ID'), column('tipo_documento', 'Tipo'), column('numero_controle_pncp', 'Controle PNCP'),
  column('objeto_compra', 'Objeto', 'text', { visible: true, width: 470 }),
  column('titulo', 'Título', 'text', { visible: true, width: 260 }), column('orgao_cnpj', 'CNPJ do órgão'),
  column('orgao_nome', 'Órgão', 'text', { visible: true, width: 285, domain: 'orgaos' }),
  column('unidade_orgao_nome_unidade', 'Unidade', 'text', { visible: true, width: 240, domain: 'unidades' }),
  column('unidade_orgao_codigo_unidade', 'Código da unidade'),
  column('orgao_entidade_esfera_id', 'Esfera', 'text', { domain: 'esferas' }),
  column('orgao_entidade_poder_id', 'Poder', 'text', { domain: 'poderes' }),
  column('uf', 'UF', 'text', { visible: true, width: 85, domain: 'ufs' }),
  column('municipio_nome', 'Município', 'text', { visible: true, width: 180, domain: 'municipios' }),
  column('modalidade_nome', 'Modalidade', 'text', { visible: true, width: 195, domain: 'modalidades' }),
  column('situacao_compra_nome_pncp', 'Situação', 'text', { visible: true, width: 195, domain: 'situacoes' }),
  column('data_publicacao_pncp', 'Publicação', 'date', { visible: true, width: 145, native_order: { asc: 'data', desc: '-data' }, native_range: ['data_publicacao_inicio', 'data_publicacao_fim'] }),
  column('data_atualizacao_pncp', 'Atualização', 'date'),
  column('valor_total_estimado', 'Valor estimado', 'decimal', { visible: true, width: 175, native_range: ['valor_total_estimado_min', 'valor_total_estimado_max'] }),
  column('valor_total_homologado', 'Valor homologado', 'decimal', { native_range: ['valor_total_homologado_min', 'valor_total_homologado_max'] }),
  column('tem_resultado', 'Tem resultado', 'boolean'), column('link_sistema_origem', 'Sistema de origem'),
  column('url_pncp', 'Link PNCP'),
];
export const reserved = ['tipos_documento', 'q', 'status', 'ordenacao', 'pagina', 'tam_pagina', 'total'];
// Enabled core filters are grounded in the supplied PNCP reference examples.
// Other portal arguments are catalogued, but deliberately require verification.
export const documentaryEnabled=['srp','codigo_ibge','tipos','normativos_base','amparos_legais','fontes_orcamentarias',
  'fontes','modos_disputa','indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional','possui_emenda_parlamentar'];
export const itemEnabled=['criterios_julgamento','categorias_leilao','beneficios','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'];
export const initialEnabled = ['ufs', 'orgaos', 'unidades', 'municipios', 'esferas', 'poderes', 'modalidades', 'situacoes', 'situacoes_item', 'tipos_item', 'anos', 'data_publicacao_inicio', 'data_publicacao_fim', 'valor_total_estimado_min', 'valor_total_estimado_max', 'valor_total_homologado_min', 'valor_total_homologado_max',...documentaryEnabled,...itemEnabled];
export function capabilities(config) {
  const additional = config.PNCP_VALIDATED_FILTERS.split(',').map(s => s.trim()).filter(Boolean);
  for (const name of additional) assert(argumentsList.some(a => a.name === name) && !reserved.includes(name), 'INVALID_CONFIG', `Filtro validado desconhecido ou reservado: ${name}.`);
  return argumentsList.map(a => {
    const isReserved = reserved.includes(a.name);
    const type = ['tipos_item','tipos_margens_preferencia'].includes(a.name) ? 'enum' : a.format.includes('lista') ? 'list' : a.format.includes('booleano') ? 'boolean' : a.format === 'data' ? 'date' : a.format.includes('decimal') ? 'decimal' : a.format.includes('inteiro') ? 'integer' : 'text';
    const documents = a.context === 'Geral' ? ['edital', 'contrato', 'ata', 'pcaorgao', 'irp'] : ['E', 'C', 'A', 'P', 'I'].filter(k => a.context.split(' ').includes(k)).map(k => ({ E: 'edital', C: 'contrato', A: 'ata', P: 'pcaorgao', I: 'irp' })[k]);
    const enabled = isReserved || ((initialEnabled.includes(a.name) || additional.includes(a.name)) && documents.includes('edital'));
    const domain=['list','enum'].includes(type) ? (domainAliases[a.name] || a.name) : null;
    const compatible=documents.includes('edital');
    return { ...a, ...filterPresentation(a.name,documents), type, cardinality: type === 'list' ? 'multiple' : 'single', documents, reserved: isReserved, domain,
      domain_source:domain ? (catalogDomains[a.name] ? 'catalog' : 'search') : null,
      domain_kind:domain ? (partialDomains.includes(domain) || partialDomains.includes(a.name) ? 'suggest' : closedDomains.includes(a.name) ? 'closed' : 'options') : null,
      state:enabled ? 'enabled' : compatible ? 'pending_validation' : 'unsupported_document',
      evidence:documentaryEnabled.includes(a.name) || itemEnabled.includes(a.name) ? 'live_api:2026-10-06; docs/viabilidade-filtros-pncp.md' : ['tipos_item','situacoes_item'].includes(a.name) ? 'live_api:2026-10-05; docs/consultas-pncp.md' : additional.includes(a.name) ? 'server_configuration:PNCP_VALIDATED_FILTERS' : isReserved || initialEnabled.includes(a.name) ? 'supplied_reference:2.0.0; live_integration_not_verified_in_build_environment' : 'portal_bundle:buildCurrentQueryParams',
      reason:enabled ? null : compatible ? (a.name==='paises_fornecedor' ? 'Identidade do país exigida pela busca ainda não comprovada.' : 'Efeito na busca ainda não comprovado para contratações.') : 'Disponível somente para contratos; este tipo documental ainda não está habilitado.' };
  });
}
export function schema(config) {
  return { source: config.DEMO_MODE ? 'demo' : 'pncp', api_version: '2.0', live: !config.DEMO_MODE, demo: config.DEMO_MODE, document_types: [{ id: 'edital', name: 'Contratações', enabled: true }, ...['ata', 'contrato', 'irp', 'pcaorgao'].map(id => ({ id, enabled: false, reason: 'Projeção ainda não implementada.' }))], columns, capabilities: capabilities(config), statuses: ['todos', 'recebendo_proposta', 'propostas_encerradas'], orders: ['-data', 'data', 'relevancia'], limits: { page_sizes: [10, 25, 50, 100], default_page_size: config.PNCP_PAGE_SIZE, search_window: 10000, export_documents: config.PNCP_MAX_EXPORT_DOCUMENTS, max_q_length: 128 } };
}
