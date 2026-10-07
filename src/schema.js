import argumentsList from './pncp-arguments.json' with { type: 'json' };
import { assert } from './errors.js';
import { domainAliases, catalogDomains, referenceDomains, partialDomains, closedDomains, filterPresentation } from './filter-domains.js';
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
export const documentStatuses={edital:['todos','recebendo_proposta','propostas_encerradas'],contrato:['todos','vigente','nao_vigente']};
const contractColumns=[...columns.filter(c=>!['valor_total_estimado','valor_total_homologado','tem_resultado'].includes(c.field)),
  column('tipo_contrato_nome','Tipo de contrato','text',{visible:true,domain:'tipos_contrato'}),
  column('fornecedor_nome','Fornecedor','text',{visible:true,domain:'fornecedores'}),column('fornecedor_ni','CPF/CNPJ do fornecedor'),
  column('valor_global','Valor global','decimal',{visible:true,native_range:['valor_global_min','valor_global_max']}),
  column('data_assinatura','Assinatura','date',{visible:true,native_range:['data_assinatura_inicio','data_assinatura_fim']}),
  column('data_inicio_vigencia','Início da vigência','date',{visible:true,native_range:['data_inicio_vigencia_inicio','data_inicio_vigencia_fim']}),
  column('data_fim_vigencia','Fim da vigência','date'),column('possui_nfe','Possui nota fiscal','boolean')];
export const columnsFor=type=>type==='contrato'?contractColumns:columns;
// Implementation availability and sampled live evidence are separate metadata.
export const documentaryEnabled=['srp','codigo_ibge','tipos','normativos_base','amparos_legais','fontes_orcamentarias',
  'fontes','modos_disputa','indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional','possui_emenda_parlamentar'];
export const itemEnabled=['criterios_julgamento','categorias_leilao','beneficios','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'];
const previouslyEnabled = ['ufs', 'orgaos', 'unidades', 'municipios', 'esferas', 'poderes', 'modalidades', 'situacoes', 'situacoes_item', 'tipos_item', 'anos', 'data_publicacao_inicio', 'data_publicacao_fim', 'valor_total_estimado_min', 'valor_total_estimado_max', 'valor_total_homologado_min', 'valor_total_homologado_max',...documentaryEnabled,...itemEnabled];
export const initialEnabled=argumentsList.filter(a=>!reserved.includes(a.name) && (a.context==='Geral' || /\b[EC]\b/.test(a.context))).map(a=>a.name);
export function capabilities(config) {
  const additional = config.PNCP_VALIDATED_FILTERS.split(',').map(s => s.trim()).filter(Boolean);
  for (const name of additional) assert(argumentsList.some(a => a.name === name) && !reserved.includes(name), 'INVALID_CONFIG', `Filtro validado desconhecido ou reservado: ${name}.`);
  return argumentsList.map(a => {
    const isReserved = reserved.includes(a.name);
    const type = ['tipos_item','tipos_margens_preferencia'].includes(a.name) ? 'enum' : a.format.includes('lista') ? 'list' : a.format.includes('booleano') ? 'boolean' : a.format === 'data' ? 'date' : a.format.includes('decimal') ? 'decimal' : a.format.includes('inteiro') ? 'integer' : 'text';
    const documents = a.context === 'Geral' ? ['edital', 'contrato', 'ata', 'pcaorgao', 'irp'] : ['E', 'C', 'A', 'P', 'I'].filter(k => a.context.split(' ').includes(k)).map(k => ({ E: 'edital', C: 'contrato', A: 'ata', P: 'pcaorgao', I: 'irp' })[k]);
    const enabled = isReserved || initialEnabled.includes(a.name);
    const domain=['list','enum'].includes(type) ? (domainAliases[a.name] || a.name) : null;
    return { ...a, ...filterPresentation(a.name,documents), type, cardinality: type === 'list' ? 'multiple' : 'single', documents, reserved: isReserved, domain,
      domain_source:domain ? (catalogDomains[a.name] ? 'catalog' : referenceDomains[a.name] ? 'reference' : 'search') : null,
      domain_kind:domain ? (partialDomains.includes(domain) || partialDomains.includes(a.name) ? 'suggest' : closedDomains.includes(a.name) ? 'closed' : 'options') : null,
      state:enabled ? 'enabled' : 'unsupported_document',
      validation_status:documentaryEnabled.includes(a.name) || itemEnabled.includes(a.name) || ['tipos_item','situacoes_item'].includes(a.name) ? 'sampled_live' : additional.includes(a.name) ? 'operator_declared' : 'integration_tested',
      evidence:documentaryEnabled.includes(a.name) || itemEnabled.includes(a.name) ? 'live_api:2026-10-06; docs/viabilidade-filtros-pncp.md' : ['tipos_item','situacoes_item'].includes(a.name) ? 'live_api:2026-10-05; docs/consultas-pncp.md' : previouslyEnabled.includes(a.name) || isReserved ? 'supplied_reference:2.0.0' : 'portal_bundle:buildCurrentQueryParams; automated_integration_tests; docs/viabilidade-filtros-pncp.md',
      reason:enabled ? null : 'Tipo documental ainda não implementado.' };
  });
}
export function schema(config) {
  return { source: config.DEMO_MODE ? 'demo' : 'pncp', api_version: '2.0', live: !config.DEMO_MODE, demo: config.DEMO_MODE, document_types: [{ id: 'edital', name: 'Contratações', enabled: true },{id:'contrato',name:'Contratos',enabled:true}, ...['ata', 'irp', 'pcaorgao'].map(id => ({ id, enabled: false, reason: 'Projeção ainda não implementada.' }))], columns, columns_by_document:{edital:columns,contrato:contractColumns}, capabilities: capabilities(config), statuses: documentStatuses.edital, statuses_by_document:documentStatuses, orders: ['-data', 'data', 'relevancia'], limits: { page_sizes: [10, 25, 50, 100], default_page_size: config.PNCP_PAGE_SIZE, search_window: 10000, export_documents: config.PNCP_MAX_EXPORT_DOCUMENTS, max_q_length: 128 } };
}
