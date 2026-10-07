// Domain providers are explicit: a partial Search list is not an exhaustive catalog.
export const domainAliases = {
  situacoes_item:'item_situacoes', tipos_item:'item_tipos', categorias_leilao:'item_categorias_leilao',
  beneficios:'item_beneficios', unidades_medida:'item_unidades_medida', situacoes_resultado:'resultado_item_situacoes',
};
export const catalogDomains = {
  paises_fornecedor:'paises', portes_fornecedor:'portes-empresa', naturezas_juridicas:'naturezas-juridicas',
  situacoes_resultado:'situacoes-compra-item-resultado',
};
// Fixed enumeration from the PNCP portal's result category control.
export const referenceDomains={reservas_remanescentes:[{id:'1',label:'Não se aplica'},{id:'2',label:'Remanescente'},{id:'3',label:'Cadastro de reserva'}]};
export const partialDomains = ['orgaos','unidades','municipios','fornecedores','fornecedores_subcontratados','orgaos_subrogados','unidades_subrogadas','municipios_fornecedor','item_unidades_medida','unidades_medida'];
export const closedDomains = ['modalidades','situacoes','fontes','fontes_orcamentarias','tipos','tipos_contrato','normativos_base','amparos_legais','modos_disputa','criterios_julgamento','situacoes_item','tipos_item','beneficios','categorias_leilao','situacoes_resultado','tipos_margens_preferencia',...Object.keys(catalogDomains),...Object.keys(referenceDomains)];

const labels = {
  ufs:'UF',orgaos:'Órgão',unidades:'Unidade',municipios:'Município',esferas:'Esfera',poderes:'Poder',modalidades:'Modalidade',
  situacoes:'Situação administrativa',anos:'Ano',tipos_item:'Tipo de item',situacoes_item:'Situação dos itens',srp:'Sistema de Registro de Preços',
  codigo_ibge:'Código IBGE do município',fontes:'Sistema de origem',fontes_orcamentarias:'Fonte orçamentária',tipos:'Instrumento convocatório',
  normativos_base:'Normativo legal',amparos_legais:'Amparo legal',modos_disputa:'Modo de disputa',criterios_julgamento:'Critério de julgamento',
  categorias_leilao:'Categoria de leilão',beneficios:'Benefício do item',situacoes_resultado:'Situação do resultado',reservas_remanescentes:'Reserva ou remanescente',
  orgaos_subrogados:'Órgão sub-rogado',unidades_subrogadas:'Unidade sub-rogada',fornecedores:'Fornecedor',fornecedores_subcontratados:'Fornecedor subcontratado',
  municipios_fornecedor:'Município do fornecedor',paises_fornecedor:'País do fornecedor',portes_fornecedor:'Porte do fornecedor',naturezas_juridicas:'Natureza jurídica do fornecedor',
  unidades_medida:'Unidade de medida',tipos_margens_preferencia:'Tipo de margem de preferência',tipos_contrato:'Tipo de contrato',
  indicador_orcamento_sigiloso:'Orçamento sigiloso',tem_ata_registro_preco:'Ata de registro de preços vinculada',tem_contrato_empenho:'Contrato ou empenho vinculado',
  tem_nfe_contrato:'Nota fiscal vinculada ao contrato',possui_nfe:'Contrato com nota fiscal',exigencia_conteudo_nacional:'Exigência de conteúdo nacional',
  possui_emenda_parlamentar:'Emenda parlamentar vinculada',permite_adesao:'Permite adesão',indicador_subcontratacao:'Subcontratação no resultado',
  incentivo_produtivo_basico:'Incentivo produtivo básico',aplicabilidade_margem_preferencia_normal:'Margem de preferência normal aplicável',
  aplicabilidade_margem_preferencia_adicional:'Margem de preferência adicional aplicável',indicador_aplicacao_margem_preferencia:'Margem de preferência aplicada',
  indicador_aplicacao_beneficio_me_epp:'Benefício ME/EPP aplicado',indicador_aplicacao_criterio_desempate:'Critério de desempate aplicado',
};
const ranges = {
  valor_total_estimado:'Valor estimado da contratação',valor_total_homologado:'Valor homologado da contratação',valor_global:'Valor global do contrato',
  item_quantidade:'Quantidade estimada do item',item_valor_unitario_estimado:'Valor unitário estimado do item',item_valor_total_estimado:'Valor total estimado do item',
  ordem_classificacao:'Ordem de classificação',resultado_quantidade_homologado:'Quantidade homologada',resultado_valor_unitario_homologado:'Valor unitário homologado',
  resultado_valor_total_homologado:'Valor total homologado do resultado',resultado_percentual_desconto:'Percentual de desconto',
  data_publicacao:'Publicação',data_homologacao:'Homologação do resultado',data_assinatura:'Assinatura do contrato',data_inicio_vigencia:'Início da vigência',
};
export function filterPresentation(name, documents) {
  const range=name.match(/^(.*)_(min|max|inicio|fim)$/);
  const suffix={min:'mínimo',max:'máximo',inicio:'a partir de',fim:'até'};
  const label=labels[name] || (range && ranges[range[1]] ? `${ranges[range[1]]} ${suffix[range[2]]}` : name);
  const result=name.startsWith('resultado_') || name.startsWith('indicador_aplicacao_') || ['situacoes_resultado','ordem_classificacao_min','ordem_classificacao_max','reservas_remanescentes','indicador_subcontratacao','data_homologacao_inicio','data_homologacao_fim'].includes(name);
  const item=name.startsWith('item_') || ['tipos_item','situacoes_item','criterios_julgamento','categorias_leilao','beneficios','unidades_medida','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'].includes(name);
  const supplier=['fornecedores','municipios_fornecedor','paises_fornecedor','portes_fornecedor','naturezas_juridicas'].includes(name);
  const group=!documents.includes('edital')?'Contrato':supplier?'Fornecedor':result?'Resultado do item':item?'Item':'Contratação';
  const documentaryBoolean=['srp','indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','possui_nfe','exigencia_conteudo_nacional','possui_emenda_parlamentar','permite_adesao','indicador_subcontratacao','indicador_aplicacao_margem_preferencia','indicador_aplicacao_beneficio_me_epp','indicador_aplicacao_criterio_desempate','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'].includes(name);
  const input_hint=documentaryBoolean?'Não informado não equivale a Não. Remova este filtro para não restringir por esta condição.':name==='codigo_ibge'?'Ex.: 5300108':name.includes('percentual')?'Ex.: 5.25 (sem %)':name.includes('quantidade')?'Ex.: 10.5 (na unidade do item)':name.includes('valor')?'Ex.: 1000.50 (reais)':null;
  return {label,group,input_hint};
}
