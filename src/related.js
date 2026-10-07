import { scalarText, decimalText, safeLink } from './adapter.js';
import { assert } from './errors.js';

export const relatedResources = ['arquivos', 'atas', 'contratos', 'historico'];
const text = (record, field) => {
  assert(record[field] == null || scalarText(record[field]) !== null, 'INVALID_UPSTREAM', `Campo ${field} inválido na listagem PNCP.`, 502, { field });
  return scalarText(record[field]);
};
const positive = value => /^\d+$/.test(value || '') && BigInt(value) > 0n;
function portalLink(kind, cnpj, year, sequence, purchaseSequence = null) {
  if (!/^\d{14}$/.test(cnpj || '') || !/^\d{4}$/.test(year || '') || !positive(sequence) || (kind === 'atas' && !positive(purchaseSequence))) return null;
  return `https://pncp.gov.br/app/${kind}/${cnpj}/${year}/${kind === 'atas' ? purchaseSequence + '/' : ''}${sequence}`;
}
export function projectRelated(resource, record, purchase) {
  if (resource === 'arquivos') return {
    titulo: text(record, 'titulo'), tipo: text(record, 'tipoDocumentoNome'),
    data_publicacao: text(record, 'dataPublicacaoPncp'), url: safeLink(text(record, 'url')),
  };
  if (resource === 'historico') return {
    evento: [text(record, 'tipoLogManutencaoNome'), text(record, 'categoriaLogManutencaoNome')].filter(Boolean).join(' - ') || null,
    nome: text(record, 'documentoTitulo') ?? text(record, 'documentoAtaTitulo') ?? text(record, 'tituloDocumentoContrato'),
    data_evento: text(record, 'logManutencaoDataInclusao'), justificativa: text(record, 'justificativa')?.trim() || 'Exigência Legal',
  };
  const ata = resource === 'atas', control = text(record, 'numeroControlePNCP');
  const year = ata ? control?.match(/\/(\d{4})(?:-\d+)?$/)?.[1] : text(record, 'anoContrato');
  const sequence = text(record, ata ? 'sequencialAta' : 'sequencialContrato');
  assert(ata || record.orgaoEntidade == null || typeof record.orgaoEntidade === 'object' && !Array.isArray(record.orgaoEntidade), 'INVALID_UPSTREAM', 'Órgão do contrato inválido.', 502);
  const cnpj = ata ? purchase.cnpj : text(record.orgaoEntidade || {}, 'cnpj');
  return {
    numero: text(record, ata ? 'numeroAtaRegistroPreco' : 'numeroContratoEmpenho'), numero_controle_pncp: control,
    data_assinatura: text(record, 'dataAssinatura'), vigencia_inicio: text(record, 'dataVigenciaInicio'), vigencia_fim: text(record, 'dataVigenciaFim'),
    ...(ata ? { data_cancelamento: text(record, 'dataCancelamento') } : { valor_global: decimalText(record.valorGlobal), fornecedor_nome: text(record, 'nomeRazaoSocialFornecedor') }),
    url: portalLink(resource, cnpj, year, sequence, purchase.sequencial),
  };
}
