import { loadConfig } from '../src/config.js';
import { PncpClient } from '../src/pncp.js';
import { QueryService } from '../src/query.js';
export const config = (extra={}) => ({...loadConfig({}),PNCP_PAGE_SIZE:10,PNCP_REQUESTS_PER_SECOND:100000,PNCP_MAX_RETRIES:0,PNCP_OPERATION_TIMEOUT_SECONDS:10,...extra});
export const document = (index,extra={})=>({id:String(index),doc_type:'_doc',document_type:'edital',numero_controle_pncp:`test-${index}`,description:`Objeto ${index}`,orgao_cnpj:'00000000000000',orgao_nome:'Órgão sintético',esfera_id:'F',modalidade_licitacao_id:'6',modalidade_licitacao_nome:'Pregão - Eletrônico',situacao_id:'1',situacao_nome:'Divulgada no PNCP',ano:'2026',numero_sequencial:String(index),data_publicacao_pncp:'2026-09-30T10:00:00',valor_total_estimado:'2.00',...extra});
export const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
export function fixture(documents,options={}) {
  const requests=[];
  const fetcher=async(url,init)=>{
    const u=new URL(url);requests.push(u);
    if(options.handler){const response=await options.handler(u,requests.length,init);if(response)return response;}
    if(u.pathname.endsWith('/filters'))return json({filters:{modalidades:[{id:6,nome:'Pregão - Eletrônico'}],situacoes:[{id:1,nome:'Divulgada no PNCP'},{id:2,nome:'Revogada'}]}});
    if(u.pathname.endsWith('/itens')) {
      const sequence=u.pathname.match(/compras\/\d+\/(\d+)\/itens/)[1],page=Number(u.searchParams.get('pagina'));
      return json(options.items?options.items(sequence,page):page===1?[{numeroItem:1,materialOuServico:'S',situacaoCompraItemId:2,catalogoCodigoItem:'25852',catalogo:{id:1}}]:[]);
    }
    const page=Number(u.searchParams.get('pagina')),size=Number(u.searchParams.get('tam_pagina'));
    return json({items:documents.slice((page-1)*size,page*size),total:documents.length});
  };
  return {fetcher,requests};
}
export function service(documents,options={},extra={}) {
  const fake=fixture(documents,options),cfg=config(extra),client=new PncpClient(cfg,{fetcher:fake.fetcher});
  return {...fake,config:cfg,client,service:new QueryService(cfg,client)};
}
export const query = extra=>({api_version:'2.0',mode:'native',preset:'all',size:10,...extra});
