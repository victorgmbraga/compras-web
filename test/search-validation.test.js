import test from 'node:test';
import assert from 'node:assert/strict';
import { identity, project } from '../src/adapter.js';
import { document, service, query, json, csvBytes } from './helpers.js';

test('SEARCH-01: resposta com _doc e document_type=edital funciona em busca e CSV', async () => {
  const s=service([document(1)]);
  {
    const result=await s.service.execute(query());
    assert.equal(result.total,1);
    assert.equal(result.data[0].tipo_documento,'edital');
    assert.equal(result.data[0]._identity,'edital:test-1');
    assert.equal(result.data[0]._raw.doc_type,'_doc');
    assert.equal(result.data[0]._raw.document_type,'edital');
  }
  const csv=csvBytes(await s.service.export(query()));
  assert.match(csv.toString('utf8'),/\r\n"1","edital","test-1"/);
  assert(s.requests.every(url=>url.searchParams.get('tipos_documento')==='edital'));
});

test('SEARCH-02: contrato em uma consulta de edital continua rejeitado com diagnóstico específico', async () => {
  const s=service([document(1,{document_type:'contrato'})]);
  await assert.rejects(s.service.execute(query()),error=>{
    assert.equal(error.code,'INVALID_UPSTREAM');
    assert.equal(error.status,502);
    assert.match(error.message,/document_type/);
    assert.equal(error.details.field,'document_type');
    assert.equal(error.details.expected_document_type,'edital');
    assert.deepEqual(error.details.received_document_types,['contrato']);
    return true;
  });
});

test('SEARCH-03: não inferir tipo funcional a partir de doc_type quando document_type é ausente ou inválido', async () => {
  for(const document_type of [undefined,null,{},['edital'],false,1,'']) {
    const s=service([document(1,{doc_type:'edital',document_type})]);
    await assert.rejects(s.service.execute(query()),error=>error.code==='INVALID_UPSTREAM' && error.details.field==='document_type');
  }
});

test('SEARCH-04: excesso de documentos mantém validação de tamanho independente do tipo', async () => {
  const items=Array.from({length:11},(_,i)=>document(i+1));
  const s=service([],{handler:()=>json({items,total:11})});
  await assert.rejects(s.service.execute(query()),error=>{
    assert.equal(error.code,'INVALID_UPSTREAM');
    assert.match(error.message,/tamanho solicitado/);
    assert.deepEqual(error.details,{requested_size:10,received_size:11});
    return true;
  });
});

test('SEARCH-05: tipo projetado e identidade usam document_type; _doc permanece só no original', () => {
  const edital=document(1),contrato=document(1,{document_type:'contrato'});
  assert.equal(identity(edital),'edital:test-1');
  assert.equal(identity(contrato),'contrato:test-1');
  assert.equal(project(edital).tipo_documento,'edital');
  assert.equal(identity(document(1,{document_type:undefined})),null);
  assert.throws(()=>project(document(1,{document_type:{}})),error=>error.code==='INVALID_UPSTREAM');
});
