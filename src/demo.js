import {domainAliases} from './schema.js';
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
export const demoDocuments = Array.from({length:64},(_,i)=>({
  id:`demo-${i+1}`,doc_type:'_doc',document_type:'edital',numero_controle_pncp:`00000000000000-1-${String(i+1).padStart(6,'0')}/2026`,
  description:objects[i%objects.length],title:`Edital de demonstração nº ${i+1}/2026`,orgao_cnpj:'00000000000000',orgao_id:String(i%4+1),orgao_nome:orgs[i%4],
  unidade_nome:`Unidade de Tecnologia ${i%4+1}`,unidade_codigo:`DEMO-${i%4+1}`,unidade_id:String(i%4+1),
  esfera_id:'F',poder_id:i%4===2?'J':'E',uf:['DF','GO','DF','RJ'][i%4],municipio_nome:['Brasília','Goiânia','Brasília','Rio de Janeiro'][i%4],municipio_id:String(i%4+1),
  modalidade_licitacao_nome:'Pregão - Eletrônico',modalidade_licitacao_id:'6',situacao_id:'1',situacao_nome:'Divulgada no PNCP',
  data_publicacao_pncp:`2026-09-${String(30-i%28).padStart(2,'0')}T10:00:00`,data_atualizacao_pncp:'2026-10-01T09:00:00',
  valor_total_estimado:`${120000+i*47813}.25`,valor_total_homologado:i%3===0?`${108000+i*45342}.50`:null,
  tem_resultado:i%3===0,item_url:null,link_sistema_origem:null,ano:'2026',numero_sequencial:String(i+1),
}));
const options=(values)=>values.map(([id,nome])=>({id,nome}));
const filters={
  orgaos:options(orgs.map((o,i)=>[String(i+1),o])),unidades:options(orgs.map((_,i)=>[String(i+1),`Unidade de Tecnologia ${i+1}`])),
  municipios:options([['1','Brasília'],['2','Goiânia'],['3','Brasília'],['4','Rio de Janeiro']]),
  ufs:options([['DF','Distrito Federal'],['GO','Goiás'],['RJ','Rio de Janeiro']]),esferas:options([['F','Federal'],['E','Estadual'],['M','Municipal'],['D','Distrital'],['N','Não se aplica']]),
  poderes:options([['E','Executivo'],['L','Legislativo'],['J','Judiciário'],['N','Não se aplica']]),modalidades:options([['6','Pregão - Eletrônico'],['8','Dispensa']]),
  situacoes:options([['1','Divulgada no PNCP'],['2','Revogada'],['3','Anulada'],['4','Suspensa']]),anos:[{ano:'2026',total:64}],
  item_situacoes:options([['1','Em andamento'],['2','Homologado']]),item_tipos:options([['S','Serviço'],['M','Material']]),
};
export function demoFetch(url) {
  const u=new URL(url),p=u.searchParams;let result;
  if(u.pathname.endsWith('/filters'))result={filters};
  else if(u.pathname.endsWith('/suggest'))result={items:(filters[domainAliases[p.get('campo')] || p.get('campo')] || []).filter(o=>String(o.nome ?? o.ano ?? o.id).toLowerCase().includes(p.get('q').toLowerCase()))};
  else if(u.pathname.endsWith('/itens')) {
    const index=Number(u.pathname.match(/compras\/\d+\/(\d+)\/itens/)[1])-1;
    result=p.get('pagina')==='1'?[{numeroItem:1,descricao:objects[index%objects.length],materialOuServico:'S',situacaoCompraItem:2,situacaoCompraItemNome:'Homologado',catalogoCodigoItem:'25852',catalogo:{id:1,nome:'Catálogo sintético de demonstração'},quantidade:'1',valorUnitarioEstimado:'120000.25',temResultado:true}]:[];
  } else {
    let docs=demoDocuments;
    const fieldMap={ufs:'uf',orgaos:'orgao_id',unidades:'unidade_id',municipios:'municipio_id',esferas:'esfera_id',poderes:'poder_id',modalidades:'modalidade_licitacao_id',situacoes:'situacao_id',anos:'ano'};
    for(const [key,field]of Object.entries(fieldMap))if(p.has(key))docs=docs.filter(d=>p.get(key).split('|').includes(d[field]));
    if(p.has('q'))docs=docs.filter(d=>(d.description+' '+d.orgao_nome).toLowerCase().includes(p.get('q').toLowerCase()));
    if(p.has('data_publicacao_inicio'))docs=docs.filter(d=>d.data_publicacao_pncp.slice(0,10)>=p.get('data_publicacao_inicio'));
    if(p.has('data_publicacao_fim'))docs=docs.filter(d=>d.data_publicacao_pncp.slice(0,10)<=p.get('data_publicacao_fim'));
    for(const key of ['valor_total_estimado','valor_total_homologado']) {
      if(p.has(key+'_min'))docs=docs.filter(d=>d[key]!==null && Number(d[key])>=Number(p.get(key+'_min')));
      if(p.has(key+'_max'))docs=docs.filter(d=>d[key]!==null && Number(d[key])<=Number(p.get(key+'_max')));
    }
    docs=[...docs].sort((a,b)=>(a.data_publicacao_pncp<b.data_publicacao_pncp?-1:a.data_publicacao_pncp>b.data_publicacao_pncp?1:0)*(p.get('ordenacao')==='data'?1:-1));
    const size=Number(p.get('tam_pagina')),page=Number(p.get('pagina'));result={items:docs.slice((page-1)*size,page*size),total:docs.length};
  }
  return Promise.resolve(new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}}));
}
