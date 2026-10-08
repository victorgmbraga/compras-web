import { scalarText, decimalText, safeLink } from './adapter.js';
import { assert } from './errors.js';

export const documentResources={edital:['arquivos','atas','contratos','historico'],ata:['partesenvolvidas','contratos','arquivos','historico'],contrato:['empenhos','instrumentocobranca','termos','arquivos','historico']};
export function nativeDocumentPath(document,base) {
  const {type,cnpj,ano,sequencial,sequencial_compra}=document;
  const positive=v=>/^\d+$/.test(v || '') && BigInt(v)>0n;
  assert(Object.hasOwn(documentResources,type) && /^\d{14}$/.test(cnpj || '') && /^\d{4}$/.test(ano || '') && positive(sequencial) && (type!=='ata' || positive(sequencial_compra)), 'INVALID_DOCUMENT_IDENTITY','Identificadores originais do documento inválidos.');
  return `${base}/orgaos/${cnpj}/${type==='contrato'?'contratos':'compras'}/${ano}/${type==='ata'?`${sequencial_compra}/atas/`:''}${sequencial}`;
}
export function controlLink(control) {
  const match=scalarText(control)?.match(/^(\d{14})-([12])-(\d+)\/(\d{4})(?:-(\d+))?$/);
  if(!match || BigInt(match[3])===0n || match[5] && (match[2]!=='1' || BigInt(match[5])===0n))return null;
  return `https://pncp.gov.br/app/${match[5]?'atas':match[2]==='2'?'contratos':'editais'}/${match[1]}/${match[4]}/${BigInt(match[3])}${match[5]?`/${BigInt(match[5])}`:''}`;
}
const field=(path,title,type='text',required=false)=>({path,title,type,required});
const organizationFields=[field('numeroControlePNCP','Controle PNCP','text',true),field('orgaoEntidade.razaoSocial','Órgão','text',true),field('orgaoEntidade.cnpj','CNPJ do órgão','text',true),field('unidadeOrgao.nomeUnidade','Unidade','text',true),field('unidadeOrgao.codigoUnidade','Código da unidade'),field('unidadeOrgao.ufSigla','UF','text',true),field('unidadeOrgao.municipioNome','Município','text',true),field('orgaoEntidade.esferaId','Esfera'),field('orgaoEntidade.poderId','Poder'),field('orgaoSubRogado.razaoSocial','Órgão sub-rogado'),field('orgaoSubRogado.cnpj','CNPJ do órgão sub-rogado'),field('unidadeSubRogada.nomeUnidade','Unidade sub-rogada'),field('unidadeSubRogada.codigoUnidade','Código da unidade sub-rogada'),field('unidadeSubRogada.municipioNome','Município da unidade sub-rogada'),field('unidadeSubRogada.ufSigla','UF da unidade sub-rogada')];
const dates=[field('dataAssinatura','Assinatura','date',true),field('dataVigenciaInicio','Início da vigência','date',true),field('dataVigenciaFim','Fim da vigência','date',true),field('dataPublicacaoPncp','Publicação','date',true),field('dataAtualizacao','Atualização','date',true),field('usuarioNome','Sistema publicador')];
const definitions={
  partesenvolvidas:[field('tipoParteEnvolvida.nome','Tipo','text',true),field('orgao.nome','Órgão','text',true),field('orgao.cnpj','CNPJ do órgão','text',true),field('unidade.nomeUnidade','Unidade','text',true),field('unidade.codigo','Código da unidade','text',true),field('unidade.localidade.nomeMunicipio','Município','text',true),field('unidade.localidade.uf','UF','text',true),field('dataInclusao','Inclusão','datetime',true)],
  ata:[...organizationFields,field('numeroAtaRegistroPreco','Número da ata','text',true),field('anoAta','Ano da ata'),field('modalidadeNome','Modalidade','text',true),...dates,field('cancelado','Cancelada','boolean',true),field('dataCancelamento','Cancelamento','date'),field('possibilidadeAdesao','Permite adesão','boolean',true),field('numeroControlePncpCompra','Contratação de origem','control'),field('informacaoComplementarCompra','Informações complementares')],
  contrato:[...organizationFields,field('numeroContratoEmpenho','Número do contrato/empenho','text',true),field('anoContrato','Ano do contrato'),field('tipoContrato.nome','Tipo de contrato','text',true),field('processo','Processo'),field('categoriaProcesso.nome','Categoria do processo'),field('receita','Receita','boolean'),...dates,
    field('nomeRazaoSocialFornecedor','Fornecedor','text',true),field('niFornecedor','CPF/CNPJ do fornecedor','text',true),field('tipoPessoa','Tipo de pessoa do fornecedor'),field('codigoPaisFornecedor','País do fornecedor'),field('nomeFornecedorSubContratado','Fornecedor subcontratado'),field('niFornecedorSubContratado','CPF/CNPJ do subcontratado'),field('tipoPessoaSubContratada','Tipo de pessoa do subcontratado'),
    field('valorInicial','Valor inicial','decimal',true),field('valorGlobal','Valor global','decimal',true),field('valorAcumulado','Valor acumulado','decimal'),field('valorParcela','Valor da parcela','decimal'),field('numeroParcelas','Número de parcelas'),field('frutoAdesao','Fruto de adesão','boolean'),field('temRemanejamento','Tem remanejamento','boolean'),field('emendaParlamentar','Emenda parlamentar','boolean'),field('numeroRetificacao','Número de retificações'),field('tipoParteEnvolvida.nome','Tipo de parte envolvida'),field('orgaoParteEnvolvida.razaoSocial','Órgão participante'),field('orgaoParteEnvolvida.cnpj','CNPJ do órgão participante'),field('unidadeOrgaoParteEnvolvida.nomeUnidade','Unidade participante'),
    field('numeroControlePncpCompra','Contratação de origem','control'),field('numeroControlePncpAta','Ata de origem','control'),field('identificadorCipi','Identificador CIPI'),field('urlCipi','Link CIPI','link'),field('informacaoComplementar','Informações complementares')],
  termos:[field('numeroTermoContrato','Número','text',true),field('tipoTermoContratoNome','Tipo','text',true),field('dataAssinatura','Assinatura','date',true),field('objetoTermoContrato','Objeto'),field('dataVigenciaInicio','Início da vigência','date'),field('dataVigenciaFim','Fim da vigência','date'),field('prazoAditadoDias','Prazo aditado (dias)'),field('valorAcrescido','Valor acrescido','decimal'),field('valorGlobal','Valor global','decimal'),field('valorParcela','Valor da parcela','decimal'),field('numeroParcelas','Número de parcelas'),field('informativoObservacao','Observações'),field('informacaoComplementar','Informações complementares'),field('dataAtualizacao','Atualização','date')],
  empenhos:[field('sequencialEmpenho','Sequencial'),field('numeroEmpenho','Número','text',true),field('valorTotal','Valor total','decimal',true),field('codigoEmenda','Emenda'),field('dataEmissaoEmpenho','Emissão','date',true),field('dataInclusao','Inclusão','datetime'),field('situacaoEmpenhoNome','Situação'),field('dataSituacaoEmpenho','Data da situação','datetime'),field('niCredorFornecedor','CPF/CNPJ do credor/fornecedor'),field('nomeRazaoSocialCredorFornecedor','Credor/fornecedor'),field('objetoEmpenho','Objeto'),field('observacao','Observações')],
  instrumentocobranca:[field('sequencialInstrumentoCobranca','Sequencial'),field('numeroInstrumentoCobranca','Número','text',true),field('tipoInstrumentoCobranca.nome','Tipo','text',true),field('dataInclusao','Inclusão','datetime'),field('dataEmissaoDocumento','Emissão','date'),field('valorTotal','Valor total','decimal'),field('chaveNFe','Chave da nota fiscal eletrônica'),field('observacao','Observações'),field('notaFiscalEletronica.numero','Número da NF-e'),field('notaFiscalEletronica.serie','Série da NF-e'),field('notaFiscalEletronica.valorTotal','Valor total da NF-e','decimal')],
};
function read(record,path) {
  let value=record;
  for(const part of path.split('.')){
    if(value==null)return null;
    assert(typeof value==='object' && !Array.isArray(value),'INVALID_UPSTREAM',`Campo ${path} inválido no PNCP.`,502);
    value=value[part];
  }
  return value;
}
export function recordFields(kind,record) {
  assert(record && typeof record==='object' && !Array.isArray(record),'INVALID_UPSTREAM','Documento PNCP inválido.',502);
  return definitions[kind].flatMap(({path,title,type,required})=>{
    let value=read(record,path);
    if(value==null && !required)return [];
    if(type==='boolean')assert(value==null || typeof value==='boolean','INVALID_UPSTREAM',`Campo ${path} não é booleano no PNCP.`,502);
    else if(type==='decimal')value=decimalText(value);
    else {
      assert(value==null || scalarText(value)!==null,'INVALID_UPSTREAM',`Campo ${path} inválido no PNCP.`,502);
      value=scalarText(value);
    }
    return [{field:path,title,type,value,...(type==='control'?{url:controlLink(value)}:type==='link'?{url:safeLink(value)}:{})}];
  });
}
export function projectDocument(type,record) {
  const object=type==='ata'?record?.objetoCompra:record?.objetoContrato;
  assert(object==null || typeof object==='string','INVALID_UPSTREAM','Objeto do documento inválido no PNCP.',502);
  return {fields:recordFields(type,record),objeto:scalarText(object),link_sistema_origem:safeLink(record.linkSistemaOrigem)};
}
