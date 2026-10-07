import {domainAliases} from './filter-domains.js';
import {compareDecimal} from './validation.js';
const objects = [
  'Contratação de solução de firewall com licenciamento, implantação e suporte técnico.',
  'Subscrição Microsoft 365, Azure e licenças de uso de software para 36 meses.',
  'Serviço de consultoria especializada em banco de dados Oracle e MySQL.',
  'Contratação de software Adobe Creative Cloud e Acrobat para comunicação institucional.',
  'Serviços gerenciados de segurança de endpoint e solução de antivirus Kaspersky.',
  'Serviços de desenvolvimento de software, práticas ágeis e fábrica de sistemas.',
  'Operação e sustentação de infraestrutura, service desk e backup em nuvem.',
  'Locação de software CAD Graebert Ares Commander com suporte especializado.',
  'Subscrição MongoDB e consultoria em banco de dados para aplicações.',
  'Serviços de manutenção de licenças Symantec / Broadcom para datacenter.',
  'Aquisição de equipamentos de videoconferência, switches e servidores de rede.',
  'Contratação de serviços de impressão e central telefônica VoIP.',
];
const orgs = ['Ministério da Gestão e da Inovação','Universidade Federal de Goiás','Tribunal Regional Eleitoral do Distrito Federal','Instituto Federal do Rio de Janeiro'];
const itemCondition=i=>i%4===0?true:i%4===1?false:null;
export const demoItems=Array.from({length:64},(_,i)=>[
  {numeroItem:1,descricao:objects[i%objects.length],materialOuServico:'S',situacaoCompraItem:2,situacaoCompraItemNome:'Homologado',catalogoCodigoItem:'25852',catalogo:{id:1,nome:'Catálogo sintético de demonstração'},quantidade:'1',unidadeMedida:['UNIDADE','Unidade ','SERVIÇO'][i%3],valorUnitarioEstimado:'120000.25',valorTotal:'120000.25',temResultado:true,
    criterioJulgamentoId:i%2===0?1:2,itemCategoriaId:i%3+1,tipoBeneficio:[1,3,4,5][i%4],
    incentivoProdutivoBasico:itemCondition(i),aplicabilidadeMargemPreferenciaNormal:itemCondition(i),aplicabilidadeMargemPreferenciaAdicional:itemCondition(i)},
  {numeroItem:2,descricao:'Item complementar de demonstração.',materialOuServico:'M',situacaoCompraItem:1,situacaoCompraItemNome:'Em andamento',catalogo:null,quantidade:String(i%3+2),unidadeMedida:'PACOTE',valorUnitarioEstimado:i%8===7?null:`${i%4+10}.50`,valorTotal:i%8===7?null:((i%3+2)*(i%4+10.5)).toFixed(2),temResultado:false,
    criterioJulgamentoId:7,itemCategoriaId:3,tipoBeneficio:5,
    incentivoProdutivoBasico:itemCondition(i)===true?false:null,aplicabilidadeMargemPreferenciaNormal:itemCondition(i)===true?false:null,aplicabilidadeMargemPreferenciaAdicional:itemCondition(i)===true?false:null},
]);
export const demoResults=Array.from({length:64},(_,i)=>[
  {numeroItem:1,situacaoCompraItemResultadoId:i%4+1,ordemClassificacaoSrp:i%3+1,tipoCadastroReserva:i%3+1,
    dataResultado:`2026-09-${String(i%28+1).padStart(2,'0')}`,quantidadeHomologada:i%4===3?null:String(i%8+1),
    valorUnitarioHomologado:i%4===3?null:`${i*1000}.50`,valorTotalHomologado:i%4===3?null:`${i*8000}.00`,percentualDesconto:i%4===3?null:['0','5.25','100'][i%3],
    indicadorSubcontratacao:itemCondition(i),indicadorAplicacaoMargemPreferencia:itemCondition(i),indicadorAplicacaoBeneficioMeEpp:itemCondition(i),indicadorAplicacaoCriterioDesempate:itemCondition(i),
    fornecedorId:i%2===0?'15566':'40491',municipioFornecedorId:i%2===0?'5300108':'3550308',codigoPais:i%2===0?'BRA':'ABW',porteFornecedorId:i%2===0?'1':'2',naturezaJuridicaId:i%2===0?'0000':'2062'},
  {numeroItem:1,situacaoCompraItemResultadoId:1,ordemClassificacaoSrp:0,tipoCadastroReserva:3,dataResultado:null,quantidadeHomologada:null,valorUnitarioHomologado:null,valorTotalHomologado:null,percentualDesconto:null,
    indicadorSubcontratacao:null,indicadorAplicacaoMargemPreferencia:null,indicadorAplicacaoBeneficioMeEpp:null,indicadorAplicacaoCriterioDesempate:null,
    fornecedorId:'200',municipioFornecedorId:null,codigoPais:null,porteFornecedorId:null,naturezaJuridicaId:null},
]);
export const demoDocuments = Array.from({length:64},(_,i)=>({
  id:`demo-${i+1}`,doc_type:'_doc',document_type:'edital',numero_controle_pncp:`00000000000000-1-${String(i+1).padStart(6,'0')}/2026`,
  description:objects[i%objects.length],title:`Edital de demonstração nº ${i+1}/2026`,orgao_cnpj:'00000000000000',orgao_id:String(i%4+1),orgao_nome:orgs[i%4],
  unidade_nome:`Unidade de Tecnologia ${i%4+1}`,unidade_codigo:`DEMO-${i%4+1}`,unidade_id:String(i%4+1),
  esfera_id:'F',poder_id:i%4===2?'J':'E',uf:['DF','GO','DF','RJ'][i%4],municipio_nome:['Brasília','Goiânia','Brasília','Rio de Janeiro'][i%4],municipio_id:String(i%4+1),
  codigo_ibge:['5300108','5208707','5300108','3304557'][i%4],srp:i%2===0,tipo_id:i%2===0?'1':'3',
  normativo_base_id:[i%2===0?'1':'5'],amparo_legal_id:[i%2===0?(i%3===0?'19':'1'):'98'],fonte_orcamentaria_id:[i%2===0?'4':'2'],
  usuario_id:['3','5','13'][i%3],usuario_nome:['Compras.gov.br','BLL Compras','Sistema sintético 13'][i%3],
  modo_disputa_id:['1','2','3'][i%3],modo_disputa_nome:['Aberto','Fechado','Aberto-Fechado'][i%3],
  indicador_orcamento_sigiloso:i%4===0?true:i%4===1?false:null,
  tem_ata_registro_preco:i%4===0?true:i%4===1?false:null,
  tem_contrato_empenho:i%4===0?true:i%4===1?false:null,
  tem_nfe_contrato:i%4===0?true:i%4===1?false:null,
  exigencia_conteudo_nacional:i%4===0?true:i%4===1?false:null,
  possui_emenda_parlamentar:itemCondition(i),
  permite_adesao:itemCondition(i),tipo_margem_preferencia_id:i%2===0?'1':'2',
  orgao_subrogado_id:i%4===3?null:String(i%2+5007),unidade_subrogada_id:i%4===3?null:String(i%2+24550),
  criterio_julgamento_id:demoItems[i].map(item=>String(item.criterioJulgamentoId)),
  incentivo_produtivo_basico:itemCondition(i),aplicabilidade_margem_preferencia_normal:itemCondition(i),aplicabilidade_margem_preferencia_adicional:itemCondition(i),
  modalidade_licitacao_nome:'Pregão - Eletrônico',modalidade_licitacao_id:'6',situacao_id:'1',situacao_nome:'Divulgada no PNCP',
  data_publicacao_pncp:`2026-09-${String(30-i%28).padStart(2,'0')}T10:00:00`,data_atualizacao_pncp:'2026-10-01T09:00:00',
  valor_total_estimado:`${120000+i*47813}.25`,valor_total_homologado:i%3===0?`${108000+i*45342}.50`:null,
  tem_resultado:i%3===0,item_url:null,link_sistema_origem:null,ano:'2026',numero_sequencial:String(i+1),
}));
export const demoContracts=demoDocuments.slice(0,32).map((doc,i)=>({...doc,id:`demo-contract-${i+1}`,document_type:'contrato',numero_controle_pncp:`00000000000000-2-${String(i+1).padStart(6,'0')}/2026`,
  title:`Contrato de demonstração nº ${i+1}/2026`,item_url:`/contratos/00000000000000/2026/${i+1}`,tipo_contrato_id:i%2===0?'1':'7',tipo_contrato_nome:i%2===0?'Contrato (termo inicial)':'Empenho',
  fornecedor_id:i%2===0?'15566':'40491',fornecedor_nome:i%2===0?'Fornecedor sintético A':'Fornecedor sintético B',fornecedor_ni:i%2===0?'01234567000189':'12345678901',fornecedor_subcontratado_id:i%4===3?null:'200',
  data_assinatura:`2026-08-${String(i%28+1).padStart(2,'0')}`,data_inicio_vigencia:`2026-09-${String(i%28+1).padStart(2,'0')}`,data_fim_vigencia:i%2===0?'2027-09-30':'2026-09-30',
  valor_global:i===31?'9007199254740993.12345':i===30?null:`${10000+i*1000}.50`,possui_nfe:itemCondition(i)}));
const options=(values)=>values.map(([id,nome])=>({id,nome}));
const filters={
  orgaos:options(orgs.map((o,i)=>[String(i+1),o])),unidades:options(orgs.map((_,i)=>[String(i+1),`Unidade de Tecnologia ${i+1}`])),
  municipios:options([['1','Brasília'],['2','Goiânia'],['3','Brasília'],['4','Rio de Janeiro']]),
  ufs:options([['DF','Distrito Federal'],['GO','Goiás'],['RJ','Rio de Janeiro']]),esferas:options([['F','Federal'],['E','Estadual'],['M','Municipal'],['D','Distrital'],['N','Não se aplica']]),
  poderes:options([['E','Executivo'],['L','Legislativo'],['J','Judiciário'],['N','Não se aplica']]),modalidades:options([['6','Pregão - Eletrônico'],['8','Dispensa']]),
  situacoes:options([['1','Divulgada no PNCP'],['2','Revogada'],['3','Anulada'],['4','Suspensa']]),anos:[{ano:'2026',total:64}],
  item_situacoes:options([['1','Em andamento'],['2','Homologado']]),item_tipos:options([['S','Serviço'],['M','Material']]),
  tipos:options([['1','Edital'],['3','Ato que autoriza a Contratação Direta']]),fontes_orcamentarias:options([['2','Municipal'],['4','Fonte sintética 4']]),
  tipos_contrato:options([['1','Contrato (termo inicial)'],['7','Empenho']]),
  orgaos_subrogados:options([['5007','Órgão sub-rogado A'],['5008','Órgão sub-rogado B']]),unidades_subrogadas:options([['24550','Unidade sub-rogada A'],['24551','Unidade sub-rogada B']]),
  fornecedores:options([['15566','Fornecedor sintético A'],['40491','Fornecedor sintético B'],['200','Fornecedor sintético C']]),fornecedores_subcontratados:options([['200','Fornecedor sintético C']]),
  municipios_fornecedor:options([['5300108','Brasília'],['3550308','São Paulo']]),
  fontes:options([['3','Compras.gov.br'],['5','BLL Compras'],['13','Sistema sintético 13']]),
  modos_disputa:options([['1','Aberto'],['2','Fechado'],['3','Aberto-Fechado'],['4','Dispensa Com Disputa'],['5','Não se aplica'],['6','Fechado-Aberto']]),
  criterios_julgamento:options([['1','Menor preço'],['2','Maior desconto'],['7','Não se aplica']]),
  item_categorias_leilao:options([['1','Bens Imóveis'],['2','Bens Móveis'],['3','Não se aplica']]),
  item_beneficios:options([['1','Participação exclusiva para ME/EPP'],['2','Subcontratação para ME/EPP'],['3','Cota reservada para ME/EPP'],['4','Sem benefício'],['5','Não se aplica']]),
  item_unidades_medida:options([['UNIDADE','UNIDADE'],['Unidade ','Unidade '],['SERVIÇO','SERVIÇO'],['PACOTE','PACOTE']]),resultado_item_situacoes:options([['1','Informado'],['2','Cancelado'],['3','Informado cadastro de reserva'],['4','Informado remanescente']]),
  normativos_base:options([['1','Lei 14.133/2021'],['5','Normativo sintético 5']]),
  amparos_legais:[{id:'1',nome:'Amparo sintético 1',normativo:'1'},{id:'19',nome:'Lei 14.133/2021, Art. 75, II',normativo:'1'},{id:'98',nome:'Amparo sintético 98',normativo:'5'}],
  tipos_margens_preferencia:options([['1','Resolução CIIA-PAC'],['2','Resolução CICS']]),
};
const catalogs={
  'situacoes-compra-item-resultado':[{id:1,nome:'Informado'},{id:2,nome:'Cancelado'},{id:3,nome:'Informado cadastro de reserva'},{id:4,nome:'Informado remanescente'}],
  paises:[{id:'BRA',nome:'Brasil',statusAtivo:true},{id:'ABW',nome:'Aruba',statusAtivo:true}],
  'portes-empresa':[{id:1,nome:'ME',statusAtivo:true},{id:2,nome:'EPP',statusAtivo:true}],
  'naturezas-juridicas':[{id:'0000',nome:'Natureza Jurídica não informada',statusAtivo:false},{id:'1015',nome:'Órgão Público do Poder Executivo Federal',statusAtivo:true},{id:'2062',nome:'Sociedade Empresária Limitada',statusAtivo:true}],
};
export function demoRelated(purchase,resource) {
  const index=Number(purchase.sequencial)-1;
  if(index<0 || index>=demoItems.length || index%5===4)return [];
  const count=resource==='arquivos' || resource==='historico'?12:resource==='atas'?3:2;
  return Array.from({length:count},(_,i)=>{
    const number=i+1,day=String(number).padStart(2,'0');
    if(resource==='arquivos')return {sequencialDocumento:number,titulo:`${number===1?'Edital':'Anexo'} ${number} — demonstração.pdf`,tipoDocumentoNome:number===1?'Edital':'Outros documentos',dataPublicacaoPncp:`2026-09-${day}T10:00:00`,url:`https://pncp.gov.br/api/pncp/v1/orgaos/${purchase.cnpj}/compras/${purchase.ano}/${purchase.sequencial}/arquivos/${number}`};
    if(resource==='historico')return {tipoLogManutencaoNome:number===1?'Inclusão':'Retificação',categoriaLogManutencaoNome:number%2?'Contratação':'Documento de contratação',documentoTitulo:number%2?null:`Anexo ${number}`,logManutencaoDataInclusao:`2026-09-${day}T10:00:00`,justificativa:number%2?'Atualização de informações sintéticas.':null};
    const common={numeroControlePNCP:resource==='atas'?`${purchase.cnpj}-1-${String(purchase.sequencial).padStart(6,'0')}/${purchase.ano}-${String(number).padStart(6,'0')}`:`${purchase.cnpj}-2-${String(number).padStart(6,'0')}/${purchase.ano}`,dataAssinatura:'2026-09-01',dataVigenciaInicio:'2026-09-01',dataVigenciaFim:'2027-09-01'};
    return resource==='atas'?{...common,sequencialAta:number,numeroAtaRegistroPreco:`${purchase.sequencial}/${number}`,dataCancelamento:number===3?'2026-10-01T12:00:00':null}:{...common,sequencialContrato:number,anoContrato:purchase.ano,numeroContratoEmpenho:`${purchase.sequencial}/${number}`,orgaoEntidade:{cnpj:purchase.cnpj},nomeRazaoSocialFornecedor:'Fornecedor de demonstração',valorGlobal:number===1?'10000.5000':'9007199254740993.12345'};
  });
}
export function demoFetch(url) {
  const u=new URL(url),p=u.searchParams;let result;
  const catalog=u.pathname.split('/').at(-1);
  if(Object.hasOwn(catalogs,catalog))result=catalogs[catalog];
  else if(u.pathname.endsWith('/filters'))result={filters:{...filters,amparos_legais:p.has('normativos_base')?filters.amparos_legais.filter(o=>p.get('normativos_base').split('|').includes(o.normativo)):filters.amparos_legais}};
  else if(u.pathname.endsWith('/suggest'))result={items:(filters[domainAliases[p.get('campo')] || p.get('campo')] || []).filter(o=>String(o.nome ?? o.ano ?? o.id).toLowerCase().includes(p.get('q').toLowerCase()))};
  else if(/\/(arquivos|atas|historico)(\/quantidade)?$/.test(u.pathname) || /\/contratos\/contratacao\/\d{4}\/\d+$/.test(u.pathname)) {
    const match=u.pathname.match(/\/orgaos\/(\d{14})\/(?:compras|contratos\/contratacao)\/(\d{4})\/(\d+)/);
    const resource=u.pathname.includes('/contratos/contratacao/')?'contratos':u.pathname.match(/\/(arquivos|atas|historico)(?:\/quantidade)?$/)[1];
    const records=demoRelated({cnpj:match[1],ano:match[2],sequencial:match[3]},resource),size=Number(p.get('tamanhoPagina') || 10),page=Number(p.get('pagina') || 1);
    result=u.pathname.endsWith('/quantidade')?records.length:['arquivos','historico'].includes(resource)?records.slice((page-1)*size,page*size):{data:records.slice((page-1)*size,page*size),totalRegistros:records.length,totalPaginas:Math.max(1,Math.ceil(records.length/size)),numeroPagina:page};
  }
  else if(u.pathname.endsWith('/itens/quantidade')) {
    const index=Number(u.pathname.match(/compras\/\d+\/(\d+)\/itens/)[1])-1;result=demoItems[index]?.length ?? 0;
  }
  else if(u.pathname.endsWith('/itens')) {
    const index=Number(u.pathname.match(/compras\/\d+\/(\d+)\/itens/)[1])-1;
    const page=Number(p.get('pagina')),size=Number(p.get('tamanhoPagina'));result=(demoItems[index] || []).slice((page-1)*size,page*size);
  } else {
    let docs=p.get('tipos_documento')==='contrato'?demoContracts:demoDocuments;
    // Contract status is simulated at the dataset's fixed reference date.
    if(p.get('tipos_documento')==='contrato' && ['vigente','nao_vigente'].includes(p.get('status')))docs=docs.filter(d=>(d.data_inicio_vigencia<='2026-10-07' && d.data_fim_vigencia>='2026-10-07')===(p.get('status')==='vigente'));
    const fieldMap={ufs:'uf',orgaos:'orgao_id',unidades:'unidade_id',municipios:'municipio_id',esferas:'esfera_id',poderes:'poder_id',modalidades:'modalidade_licitacao_id',situacoes:'situacao_id',anos:'ano',tipos:'tipo_id',codigo_ibge:'codigo_ibge',fontes:'usuario_id',modos_disputa:'modo_disputa_id',orgaos_subrogados:'orgao_subrogado_id',unidades_subrogadas:'unidade_subrogada_id',tipos_contrato:'tipo_contrato_id',fornecedores_subcontratados:'fornecedor_subcontratado_id',tipos_margens_preferencia:'tipo_margem_preferencia_id'};
    for(const [key,field]of Object.entries(fieldMap))if(p.has(key))docs=docs.filter(d=>p.get(key).split('|').includes(d[field]));
    for(const [key,field]of Object.entries({normativos_base:'normativo_base_id',amparos_legais:'amparo_legal_id',fontes_orcamentarias:'fonte_orcamentaria_id'}))if(p.has(key))docs=docs.filter(d=>d[field].some(id=>p.get(key).split('|').includes(id)));
    for(const key of ['srp','indicador_orcamento_sigiloso','tem_ata_registro_preco','tem_contrato_empenho','tem_nfe_contrato','exigencia_conteudo_nacional','possui_emenda_parlamentar','permite_adesao','possui_nfe','incentivo_produtivo_basico','aplicabilidade_margem_preferencia_normal','aplicabilidade_margem_preferencia_adicional'])if(p.has(key))docs=docs.filter(d=>d[key]===(p.get(key)==='true'));
    for(const [key,field]of Object.entries({criterios_julgamento:'criterioJulgamentoId',categorias_leilao:'itemCategoriaId',beneficios:'tipoBeneficio',unidades_medida:'unidadeMedida',tipos_item:'materialOuServico',situacoes_item:'situacaoCompraItem'}))if(p.has(key))docs=docs.filter(d=>demoItems[Number(d.numero_sequencial)-1].some(item=>p.get(key).split('|').includes(String(item[field]))));
    const resultFields={situacoes_resultado:'situacaoCompraItemResultadoId',reservas_remanescentes:'tipoCadastroReserva',municipios_fornecedor:'municipioFornecedorId',paises_fornecedor:'codigoPais',portes_fornecedor:'porteFornecedorId',naturezas_juridicas:'naturezaJuridicaId',fornecedores:'fornecedorId'};
    for(const [key,field]of Object.entries(resultFields))if(p.has(key))docs=docs.filter(d=>d.document_type==='contrato' && key==='fornecedores'?p.get(key).split('|').includes(d.fornecedor_id):demoResults[Number(d.numero_sequencial)-1].some(r=>r[field]!=null && p.get(key).split('|').includes(String(r[field]))));
    for(const [key,field]of Object.entries({indicador_subcontratacao:'indicadorSubcontratacao',indicador_aplicacao_margem_preferencia:'indicadorAplicacaoMargemPreferencia',indicador_aplicacao_beneficio_me_epp:'indicadorAplicacaoBeneficioMeEpp',indicador_aplicacao_criterio_desempate:'indicadorAplicacaoCriterioDesempate'}))if(p.has(key))docs=docs.filter(d=>demoResults[Number(d.numero_sequencial)-1].some(r=>r[field]===(p.get(key)==='true')));
    if(p.has('q'))docs=docs.filter(d=>(d.description+' '+d.orgao_nome).toLowerCase().includes(p.get('q').toLowerCase()));
    if(p.has('data_publicacao_inicio'))docs=docs.filter(d=>d.data_publicacao_pncp.slice(0,10)>=p.get('data_publicacao_inicio'));
    if(p.has('data_publicacao_fim'))docs=docs.filter(d=>d.data_publicacao_pncp.slice(0,10)<=p.get('data_publicacao_fim'));
    const ranges={valor_total_estimado:['document','valor_total_estimado'],valor_total_homologado:['document','valor_total_homologado'],valor_global:['document','valor_global'],
      item_quantidade:['item','quantidade'],item_valor_unitario_estimado:['item','valorUnitarioEstimado'],item_valor_total_estimado:['item','valorTotal'],
      ordem_classificacao:['result','ordemClassificacaoSrp'],resultado_quantidade_homologado:['result','quantidadeHomologada'],resultado_valor_unitario_homologado:['result','valorUnitarioHomologado'],resultado_valor_total_homologado:['result','valorTotalHomologado'],resultado_percentual_desconto:['result','percentualDesconto'],
      data_assinatura:['document','data_assinatura'],data_inicio_vigencia:['document','data_inicio_vigencia'],data_homologacao:['result','dataResultado']};
    for(const [name,[source,field]]of Object.entries(ranges))for(const [suffix,direction]of name.startsWith('data_')?[['inicio',1],['fim',-1]]:[['min',1],['max',-1]]) {
      if(!p.has(name+'_'+suffix))continue;const value=p.get(name+'_'+suffix);
      docs=docs.filter(d=>{const rows=source==='document'?[d]:source==='item'?demoItems[Number(d.numero_sequencial)-1]:demoResults[Number(d.numero_sequencial)-1];return rows.some(row=>row[field]!=null && (name.startsWith('data_')?String(row[field]).slice(0,10).localeCompare(value)*direction>=0:compareDecimal(String(row[field]),value)*direction>=0));});
    }
    docs=[...docs].sort((a,b)=>(a.data_publicacao_pncp<b.data_publicacao_pncp?-1:a.data_publicacao_pncp>b.data_publicacao_pncp?1:0)*(p.get('ordenacao')==='data'?1:-1));
    const size=Number(p.get('tam_pagina')),page=Number(p.get('pagina'));result={items:docs.slice((page-1)*size,page*size),total:docs.length};
  }
  return Promise.resolve(new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}}));
}
