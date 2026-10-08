import test from 'node:test';
import assert from 'node:assert/strict';
import { readQueryUrl, writeQueryUrl } from '../src/browser/query-url.js';
import { schema } from '../src/schema.js';
import { config } from './helpers.js';

const definition=schema(config()),base='https://example.test/contratos-web/';
const read=search=>readQueryUrl(base+search,definition);

test('QUERY-URL-01: restaura padrões e controles com os nomes nativos do PNCP',()=>{
  assert.deepEqual(read(''),{api_version:'2.0',document_type:'edital',q:'',status:'todos',pncp_filters:{},order:'-data',page:1,size:100});
  const query=read('?tipos_documento=contrato&q=servi%C3%A7os+de+reforma&status=vigente&ordenacao=relevancia&pagina=2');
  assert.equal(query.document_type,'contrato');assert.equal(query.q,'serviços de reforma');assert.equal(query.status,'vigente');assert.equal(query.order,'relevancia');assert.equal(query.page,2);
});

test('QUERY-URL-02: booleanos, zero, decimais exatos, IDs com zeros e listas repetidas preservam seus tipos',()=>{
  const query=read('?q=A%2BB+%26+100%25+%7C+%22%C3%A1%22&ufs=SP%7CDF&ufs=MG&srp=false&possui_emenda_parlamentar=true&codigo_ibge=0300108&item_quantidade_min=0.00&item_valor_total_estimado_max=9007199254740993.01&ordem_classificacao_min=0&tipos_item=S&data_publicacao_inicio=2026-09-01');
  assert.equal(query.q,'A+B & 100% | "á"');
  assert.deepEqual(query.pncp_filters,{ufs:['SP','DF','MG'],srp:false,possui_emenda_parlamentar:true,codigo_ibge:'0300108',item_quantidade_min:'0.00',item_valor_total_estimado_max:'9007199254740993.01',ordem_classificacao_min:0,tipos_item:'S',data_publicacao_inicio:'2026-09-01'});
  const encoded=writeQueryUrl(base,query,definition);assert.deepEqual(readQueryUrl(encoded,definition),query);assert(encoded.includes('srp=false'));assert(encoded.includes('ufs=SP%7CDF%7CMG'));assert(!encoded.includes('%257C'));
});

test('QUERY-URL-03: cobre roundtrip dos três tipos e todos os filtros compatíveis',()=>{
  for(const type of ['edital','ata','contrato']){
    const pncp_filters=Object.fromEntries(definition.capabilities.filter(cap=>!cap.reserved && cap.state==='enabled' && cap.documents.includes(type)).map(cap=>[cap.name,
      cap.type==='list'?{ufs:['SP','DF'],esferas:['F','M'],poderes:['E','L'],anos:['2025','2026'],paises_fornecedor:['BRA'],unidades_medida:['m²','KG']}[cap.name] ?? ['1','2']:
      cap.type==='enum'?(cap.name==='tipos_item'?'S':'1'):cap.type==='boolean'?false:cap.type==='integer'?0:cap.type==='decimal'?'0.00':cap.type==='date'?'2026-09-01':cap.name==='codigo_ibge'?'0300108':'texto']));
    const query={api_version:'2.0',document_type:type,q:'engenharia & obras + instalações',status:type==='edital'?'recebendo_proposta':'vigente',pncp_filters,order:'data',page:100,size:100};
    assert.deepEqual(readQueryUrl(writeQueryUrl(base,query,definition),definition),query);
  }
});

test('QUERY-URL-04: remove critérios antigos e mantém origem, subdiretório, demonstração, parâmetros externos e fragmento',()=>{
  const href=base+'?demo=1&utm_source=teste&q=antigo&ufs=SP&srp=false&pagina=2#resultados',query=read('');
  const encoded=writeQueryUrl(href,query,definition),url=new URL(encoded);
  assert.equal(url.origin,new URL(base).origin);assert.equal(url.pathname,'/contratos-web/');assert.equal(url.hash,'#resultados');
  assert.equal(url.searchParams.get('demo'),'1');assert.equal(url.searchParams.get('utm_source'),'teste');assert.equal(url.searchParams.has('q'),false);assert.equal(url.searchParams.has('ufs'),false);assert.equal(url.searchParams.has('srp'),false);
  assert.deepEqual(readQueryUrl(encoded,definition),query);assert.equal(writeQueryUrl(encoded,query,definition),encoded);
});

test('QUERY-URL-05: entradas inválidas não viram valores falsos, zero ou busca sem filtros',()=>{
  for(const search of ['?tipos_documento=irp','?tipos_documento=contrato&srp=false','?tipos_documento=ata&status=recebendo_proposta','?q='+ 'a'.repeat(129),'?ordenacao=outra','?ordenacao=relevancia','?pagina=0','?pagina=-1','?pagina=1.5','?pagina=1e2','?pagina=101','?pagina=9007199254740993','?pagina=','?srp=0','?srp=FALSE','?srp=','?ordem_classificacao_min=-1','?ordem_classificacao_min=1e2','?ordem_classificacao_min=9007199254740993','?ufs=','?ufs=SP%7C','?ufs=ZZ','?modalidades=Preg%C3%A3o','?codigo_ibge=530010','?item_valor_total_estimado_min=1,5','?item_quantidade_min=10&item_quantidade_max=2','?data_publicacao_inicio=2026-02-30','?q=a&q=b','?tipos_item=S&tipos_item=M','?srp=true&srp=false'])assert.throws(()=>read(search),undefined,search);
});

test('QUERY-URL-06: parâmetros externos não são enviados e filtros desabilitados pelo esquema são rejeitados',()=>{
  assert.deepEqual(read('?demo=1&tracking=valor'),read(''));
  const disabled=structuredClone(definition);disabled.capabilities.find(cap=>cap.name==='ufs').state='unsupported_document';
  assert.throws(()=>readQueryUrl(base+'?ufs=SP',disabled),error=>error.code==='DOCUMENT_FILTER_UNAVAILABLE');
});
