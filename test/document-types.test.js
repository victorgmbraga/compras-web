import { csvBytes } from './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'lossless-json';
import {schema,capabilities,columnsFor} from '../src/schema.js';
import {project,documentIdentity} from '../src/adapter.js';
import {recordFields,projectDocument,controlLink,nativeDocumentPath} from '../src/document-details.js';
import {PncpClient} from '../src/pncp-core.js';
import {QueryService} from '../src/query-core.js';
import {demoFetch,demoAtas,demoContracts} from '../src/demo.js';
import {config,query,json,service,document} from './helpers.js';

const ata={type:'ata',cnpj:'01234567000189',ano:'2025',sequencial_compra:'57',sequencial:'9'},contract={type:'contrato',cnpj:ata.cnpj,ano:'2026',sequencial:'44'};
const fixture=handler=>{const cfg=config(),requests=[],client=new PncpClient(cfg,{fetcher:async(url,init)=>{const u=new URL(url);requests.push(u);return handler(u,init);}});return {client,requests,service:new QueryService(cfg,client)};};
const demo=()=>{const cfg=config({DEMO_MODE:true});return new QueryService(cfg,new PncpClient(cfg,{fetcher:demoFetch}));};

test('DOCUMENTS-01: os três tipos publicam colunas, status e os 16 filtros compatíveis com atas',async()=>{
  const catalog=schema(config());assert.deepEqual(catalog.document_types.filter(d=>d.enabled).map(d=>d.id),['edital','ata','contrato']);
  assert.deepEqual(catalog.statuses_by_document.ata,['todos','vigente','nao_vigente']);
  assert.deepEqual(columnsFor('ata'),catalog.columns_by_document.ata);
  for(const type of ['ata','contrato'])assert(!columnsFor(type).some(c=>['situacao_compra_nome_pncp','valor_total_estimado','valor_total_homologado'].includes(c.field)));
  assert.equal(capabilities(config()).filter(c=>!c.reserved && c.documents.includes('ata')).length,16);
  const s=demo(),result=await s.execute(query({document_type:'ata'}));assert.equal(result.total,24);assert.equal(result.data[0].tipo_documento,'ata');
  const csv=await s.export(query({document_type:'ata'})),header=csvBytes(csv).toString().split('\r\n')[0];assert.equal(csv.metadata.exported_rows,24);
  assert(header.includes('"permite_adesao"'));assert(header.includes('"cancelado"'));assert(!header.includes('"valor_global"'));assert(!header.includes('"valor_total_estimado"'));
  for(const status of ['vigente','nao_vigente'])assert.equal((await s.export(query({document_type:'ata',status}))).metadata.exported_rows,12);
});

test('DOCUMENTS-02: a ata conserva sequenciais distintos e nunca deriva identificadores da contratação pelo título ou controle',()=>{
  const raw={document_type:'ata',orgao_cnpj:ata.cnpj,ano:ata.ano,numero_sequencial:ata.sequencial,numero_sequencial_compra_ata:ata.sequencial_compra,item_url:'/atas/01234567000189/2025/57/9',cancelado:false,permite_adesao:false};
  const row=project(raw);assert.deepEqual(row._document,ata);assert.equal(row._purchase,null);assert.equal(row.url_pncp,'https://pncp.gov.br/app/atas/01234567000189/2025/57/9');assert.equal(row.cancelado,false);
  for(const name of ['orgao_cnpj','ano','numero_sequencial','numero_sequencial_compra_ata'])assert.equal(documentIdentity({...raw,[name]:null}),null);
  assert.equal(documentIdentity({...raw,numero_sequencial_compra_ata:'0'}),null);
  assert.deepEqual(documentIdentity({...raw,ano:'2026'}),ata);
  assert.equal(documentIdentity({...raw,item_url:'/atas/01234567000189/2025/44/9'}),null);
  assert.deepEqual(documentIdentity({...raw,document_type:'contrato',ano:contract.ano,numero_sequencial:contract.sequencial}),contract);
  assert.throws(()=>project({...raw,cancelado:'false'}),e=>e.code==='INVALID_UPSTREAM');
});

test('DOCUMENTS-03: filtros de atas chegam à fonte em pesquisa e CSV; contextos inválidos são recusados antes da rede',async()=>{
  const caps=capabilities(config()).filter(c=>!c.reserved && c.documents.includes('ata'));
  const domains=Object.fromEntries(caps.filter(c=>c.domain_source==='search').map(c=>[c.domain,[{id:c.name==='ufs'?'DF':c.name==='anos'?'2026':c.name==='esferas'?'F':c.name==='poderes'?'E':'1'}]]));
  for(const cap of caps){const value=cap.type==='date'?'2026-09-01':cap.type==='boolean'?false:cap.name==='ufs'?['DF']:cap.name==='anos'?['2026']:cap.name==='esferas'?['F']:cap.name==='poderes'?['E']:['1'];
    const s=service([document(1,{document_type:'ata',numero_sequencial_compra_ata:'57',cancelado:false,permite_adesao:false})],{handler:u=>u.pathname.endsWith('/filters')?json({filters:domains}):null});
    const input=query({document_type:'ata',pncp_filters:{[cap.name]:value}});
    await s.service.execute(input);await s.service.export(input);assert.equal(s.requests.at(-1).searchParams.get(cap.name),Array.isArray(value)?value.join('|'):String(value));assert(s.requests.every(u=>!u.pathname.includes('/orgaos/')));
  }
  const s=service([]);for(const input of [query({document_type:'ata',status:'recebendo_proposta'}),query({document_type:'ata',pncp_filters:{valor_global_min:'1'}}),query({document_type:'ata',pncp_filters:{situacoes_item:['1']}})])await assert.rejects(s.service.execute(input));assert.equal(s.requests.length,0);
});

test('DOCUMENTS-04: detalhes completos mantêm datas, booleanos, códigos, valores exatos e vínculos seguros',()=>{
  const raw=parse('{"numeroControlePNCP":"01234567000189-2-000044/2026","orgaoEntidade":{"cnpj":"01234567000189","razaoSocial":"Órgão"},"unidadeOrgao":{"codigoUnidade":"0001"},"valorInicial":9007199254740993.12345,"valorGlobal":0.0000,"niFornecedor":"00123456789012","numeroParcelas":0,"frutoAdesao":false,"receita":false,"numeroControlePncpCompra":"01234567000189-1-000057/2025","numeroControlePncpAta":"01234567000189-1-000057/2025-000009","urlCipi":"javascript:alert(1)"}');
  const result=projectDocument('contrato',raw),field=name=>result.fields.find(f=>f.field===name);
  assert.equal(field('valorInicial').value,'9007199254740993.12345');assert.equal(field('valorGlobal').value,'0.0000');assert.equal(field('frutoAdesao').value,false);assert.equal(field('numeroParcelas').value,'0');assert.equal(field('unidadeOrgao.codigoUnidade').value,'0001');assert.equal(field('niFornecedor').value,'00123456789012');
  assert.equal(field('numeroControlePncpAta').url,'https://pncp.gov.br/app/atas/01234567000189/2025/57/9');assert.equal(field('numeroControlePncpCompra').url,'https://pncp.gov.br/app/editais/01234567000189/2025/57');assert.equal(field('urlCipi').url,null);
  assert.equal(controlLink('garbage'),null);assert.equal(controlLink('01234567000189-2-000057/2025-000009'),null);
  const fields=projectDocument('ata',{cancelado:false,possibilidadeAdesao:false,numeroAtaRegistroPreco:'0009',numeroControlePncpCompra:'01234567000189-1-000057/2025'}).fields;assert(fields.some(f=>f.title==='Número da ata' && f.value==='0009'));assert(!fields.some(f=>f.type==='decimal'));
  for(const record of [[],null,{valorGlobal:false},{orgaoEntidade:[]},{frutoAdesao:'false'}])assert.throws(()=>projectDocument('contrato',record),e=>e.code==='INVALID_UPSTREAM');
});

test('DOCUMENTS-05: arquivos, histórico e termos consultam o documento correto, com contagem e paginação independente',async()=>{
  const f=fixture(u=>u.pathname.endsWith('/quantidade')?json(12):json(Array.from({length:u.searchParams.get('pagina')==='1'?10:2},(_,i)=>({numeroTermoContrato:String(i+1),titulo:'Arquivo',tipoDocumentoNome:'Outros',dataPublicacaoPncp:'2026-09-01',numeroTermoContrato:'001',tipoTermoContratoNome:'Aditivo'}))));
  for(const d of [ata,contract])for(const resource of ['arquivos','historico',...(d.type==='contrato'?['termos']:[])]){
    const r=await f.service.documentRelated(d,resource,2,10);assert.equal(r.total,12);assert.equal(r.data.length,2);assert.equal(r.total_pages,2);assert.equal(r.has_more,false);
    const path=nativeDocumentPath(d,'/api/pncp/v1')+'/'+resource;assert.equal(f.requests.at(-2).pathname,path+'/quantidade');assert.equal(f.requests.at(-1).pathname,path);assert.equal(f.requests.at(-1).searchParams.get('pagina'),'2');
  }
  assert(!f.requests.some(u=>/contratos\/2025\/9/.test(u.pathname)));
});

test('DOCUMENTS-06: partes envolvidas e contratos da ata usam envelope e vínculos dos próprios registros',async()=>{
  const f=fixture(u=>json({data:u.pathname.endsWith('/partesenvolvidas')?[{tipoParteEnvolvida:{nome:'Gerenciadora'},orgao:{cnpj:'00012345000189',nome:'Órgão'},unidade:{codigo:'0001',nomeUnidade:'Unidade',localidade:{uf:'SP',nomeMunicipio:'São Paulo'}},dataInclusao:'2026-09-01T10:00:00'}]:[{orgaoEntidade:{cnpj:'00987654000100'},anoContrato:2026,sequencialContrato:44,valorGlobal:'9007199254740993.0000',numeroControlePNCP:'00987654000100-2-000044/2026'}],totalRegistros:1,numeroPagina:1}));
  const parties=await f.service.documentRelated(ata,'partesenvolvidas',1,10);assert.equal(parties.data[0].fields.find(x=>x.title==='Código da unidade').value,'0001');assert.match(f.requests.at(-1).pathname,/compras\/2025\/57\/atas\/9\/partesenvolvidas$/);
  const linked=await f.service.documentRelated(ata,'contratos',1,10);assert.equal(linked.data[0].url,'https://pncp.gov.br/app/contratos/00987654000100/2026/44');assert.equal(linked.data[0].valor_global,'9007199254740993.0000');
});

test('DOCUMENTS-07: instrumentos não paginados recebem recorte explícito; empenhos conservam paginação nativa',async()=>{
  const records=Array.from({length:12},(_,i)=>({sequencialInstrumentoCobranca:i+1,sequencialEmpenho:i+1,numeroInstrumentoCobranca:'0001',numeroEmpenho:'0001',valorTotal:'1234.0000'}));
  const f=fixture(u=>u.pathname.endsWith('/instrumentocobranca')?json(records):json({data:records.slice(10),totalRegistros:12,numeroPagina:2}));
  const instruments=await f.service.documentRelated(contract,'instrumentocobranca',2,10);assert.equal(instruments.data.length,2);assert.equal(instruments.data[0].sequencial,'11');assert.equal(instruments.pagination_source,'local_slice');assert.equal(f.requests.at(-1).search,'');
  const commitments=await f.service.documentRelated(contract,'empenhos',2,10);assert.equal(commitments.total,12);assert.equal(commitments.data.length,2);assert.equal(commitments.pagination_source,'pncp');assert.equal(f.requests.at(-1).searchParams.get('pagina'),'2');
});

test('DOCUMENTS-08: vazios, falhas, formato e contagens não são confundidos',async()=>{
  const noContent=fixture(u=>u.pathname.endsWith('/quantidade')?json(0):new Response(null,{status:204}));
  for(const [d,resources]of [[ata,['partesenvolvidas','contratos','arquivos','historico']],[contract,['empenhos','instrumentocobranca','termos','arquivos','historico']]])for(const resource of resources)assert.equal((await noContent.service.documentRelated(d,resource,1,10)).total,0);
  const missing=fixture(()=>new Response(null,{status:404}));
  for(const [d,resources]of [[ata,['partesenvolvidas','contratos','arquivos','historico']],[contract,['termos','arquivos','historico']]])for(const resource of resources)await assert.rejects(missing.service.documentRelated(d,resource,1,10),e=>e.code==='PNCP_HTTP_ERROR' && e.details.upstream_status===404);
  for(const payload of [{data:[],totalRegistros:1},{data:[{}],totalRegistros:1,numeroPagina:2},{data:{},totalRegistros:0}])await assert.rejects(fixture(()=>json(payload)).service.documentRelated(ata,'partesenvolvidas',1,10));
  await assert.rejects(fixture(()=>json({})).service.documentRelated(contract,'instrumentocobranca',1,10),e=>e.code==='INVALID_UPSTREAM');
  await assert.rejects(noContent.service.documentRelated(ata,'termos',1,10),e=>e.code==='NOT_FOUND');
});

test('DOCUMENTS-13: HTTP 404 nas listas de empenhos e instrumentos de cobrança significa zero registros',async()=>{
  for(const resource of ['empenhos','instrumentocobranca']){
    const f=fixture(()=>new Response(null,{status:404})),result=await f.service.documentRelated(contract,resource,1,10);
    assert.deepEqual(result.data,[]);assert.equal(result.total,0);assert.equal(result.total_pages,1);assert.equal(result.page,1);assert.equal(result.has_more,false);assert.equal(result.complete,true);
    assert.equal(result.pagination_source,resource==='instrumentocobranca'?'local_slice':'pncp');assert.equal(result.upstream_requests,1);assert.equal(f.requests.length,1);
    await assert.rejects(f.service.documentRelated(contract,resource,2,10),e=>e.code==='PAGE_OUT_OF_RANGE' && e.details.last_page===1);
    await assert.rejects(f.service.contractChild(contract,resource,'1'),e=>e.code==='PNCP_HTTP_ERROR' && e.details.upstream_status===404);
  }
});

test('DOCUMENTS-14: outras falhas nas listas de empenhos e instrumentos de cobrança continuam sendo erros',async()=>{
  for(const resource of ['empenhos','instrumentocobranca']){
    for(const status of [403,500,503])await assert.rejects(fixture(()=>new Response(null,{status})).service.documentRelated(contract,resource,1,10),e=>e.code===(status===503?'PNCP_UNAVAILABLE':'PNCP_HTTP_ERROR') && e.details.upstream_status===status);
    await assert.rejects(fixture(()=>{throw new TypeError('Failed to fetch');}).service.documentRelated(contract,resource,1,10),e=>e.code==='PNCP_TRANSPORT_ERROR' && !Object.hasOwn(e.details,'upstream_status'));
    await assert.rejects(fixture(()=>new Response('invalid',{headers:{'Content-Type':'application/json'}})).service.documentRelated(contract,resource,1,10),e=>e.code==='INVALID_UPSTREAM');
  }
});

test('DOCUMENTS-09: detalhes dos filhos e arquivos de termos usam o sequencial correto sem expor links inseguros',async()=>{
  const f=fixture(u=>u.pathname.endsWith('/arquivos')?json([{titulo:'Termo.pdf',tipoDocumentoNome:'Termo aditivo',url:'https://pncp.gov.br/arquivo.pdf'},{titulo:'Inseguro',url:'javascript:alert(1)'}]):new Response('{"numeroEmpenho":"00001","numeroInstrumentoCobranca":"00002","valorTotal":9007199254740993.12345}',{headers:{'Content-Type':'application/json'}}));
  const files=await f.service.contractChild(contract,'termos','3');assert.equal(files.files.length,2);assert.equal(files.files[1].url,null);assert.match(f.requests.at(-1).pathname,/contratos\/2026\/44\/termos\/3\/arquivos$/);
  for(const resource of ['empenhos','instrumentocobranca']){const child=await f.service.contractChild(contract,resource,'2');assert.equal(child.fields.find(x=>x.title==='Valor total').value,'9007199254740993.12345');assert.match(f.requests.at(-1).pathname,new RegExp('/'+resource+'/2$'));}
  for(const [d,res,seq]of [[ata,'termos','3'],[contract,'arquivos','1'],[contract,'termos','0'],[contract,'termos','../1']])await assert.rejects(f.service.contractChild(d,res,seq),e=>e.code==='NOT_FOUND');
});


test('DOCUMENTS-11: demonstração fornece detalhes, registros e vínculos completos de atas e contratos',async()=>{
  const s=demo();
  for(const raw of [demoAtas[0],demoContracts[0]]){const d=project(raw)._document,r=await s.documentDetails(d);assert(r.fields.some(f=>f.type==='control' && f.url));assert(r.objeto);for(const resource of d.type==='ata'?['partesenvolvidas','contratos','arquivos','historico']:['empenhos','instrumentocobranca','termos','arquivos','historico'])assert((await s.documentRelated(d,resource,1,10)).data.length>0);}
});

test('DOCUMENTS-12: detalhes completos recusam identidade incorreta e aceitam ano da ata diferente do ano da compra',async()=>{
  for(const payload of [{},[],{numeroControlePNCP:'01234567000189-2-000045/2026'}, {numeroControlePNCP:'01234567000189-1-000044/2026'}])await assert.rejects(fixture(()=>json(payload)).service.documentDetails(contract),e=>e.code==='INVALID_UPSTREAM');
  const f=fixture(()=>json({numeroControlePNCP:'01234567000189-1-000057/2025-000009',anoAta:2026,numeroAtaRegistroPreco:'0009',objetoCompra:'Objeto da ata'}));
  const detail=await f.service.documentDetails(ata);assert.equal(detail.fields.find(x=>x.field==='anoAta').value,'2026');assert.match(f.requests[0].pathname,/compras\/2025\/57\/atas\/9$/);
});

test('DOCUMENTS-15: emenda parlamentar de contrato preserva booleanos e ausência sem aceitar tipos inválidos',async()=>{
  for(const value of [false,true]){
    const detail=await fixture(()=>json({numeroControlePNCP:'01234567000189-2-000044/2026',emendaParlamentar:value})).service.documentDetails(contract);
    assert.deepEqual(detail.fields.find(f=>f.field==='emendaParlamentar'),{field:'emendaParlamentar',title:'Emenda parlamentar',type:'boolean',value});
  }
  for(const value of [undefined,null])assert(!projectDocument('contrato',{emendaParlamentar:value}).fields.some(f=>f.field==='emendaParlamentar'));
  for(const value of ['false','true',0,1,{},[]])assert.throws(()=>projectDocument('contrato',{emendaParlamentar:value}),e=>e.code==='INVALID_UPSTREAM');
});
