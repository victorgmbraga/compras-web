import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/server.js';
import { config, json, service } from './helpers.js';

const purchase={cnpj:'14136816000151',ano:'2026',sequencial:'16'};
const items=total=>Array.from({length:total},(_,i)=>({numeroItem:i+1,descricao:`Item ${i+1}`,materialOuServico:'M'}));
function detailsFixture(total) {
  const data=items(total);
  return service([],{itemQuantity:total,handler:url=>url.pathname.endsWith('/itens')?json(data.slice((Number(url.searchParams.get('pagina'))-1)*Number(url.searchParams.get('tamanhoPagina')),Number(url.searchParams.get('pagina'))*Number(url.searchParams.get('tamanhoPagina')))):null});
}

test('DETAILS-COUNT-01: zero, página curta e múltiplos exatos terminam pelo total sem página vazia',async()=>{
  for(const total of [0,1,100,109,200,201]) {
    const s=detailsFixture(total),pages=Math.max(1,Math.ceil(total/100));
    for(let page=1;page<=pages;page++) {
      const result=await s.service.details(purchase,page,100);
      assert.equal(result.total_items,total);assert.equal(result.total_pages,pages);
      assert.equal(result.has_more,page<pages);assert.equal(result.complete,page===pages);
      assert.equal(result.data.length,Math.min(100,total-(page-1)*100));
      assert.equal(result.snapshot_guaranteed,false);
    }
    assert.equal(s.requests.filter(url=>url.pathname.endsWith('/quantidade')).length,pages);
    assert.equal(s.requests.filter(url=>url.pathname.endsWith('/itens')).length,total===0?0:pages);
    assert(s.requests.every(url=>url.pathname.includes('/orgaos/14136816000151/compras/2026/16/itens')));
  }
});

test('DETAILS-COUNT-02: respeita o tamanho solicitado e rejeita página além do total sem buscar itens',async()=>{
  const s=detailsFixture(109),last=await s.service.details(purchase,11,10);
  assert.equal(last.data.length,9);assert.equal(last.total_pages,11);assert.equal(last.has_more,false);
  const before=s.requests.length;
  await assert.rejects(s.service.details(purchase,12,10),error=>error.code==='PAGE_OUT_OF_RANGE' && error.details.last_page===11 && error.details.total_items===109);
  assert.equal(s.requests.length,before+1);assert(s.requests.at(-1).pathname.endsWith('/quantidade'));
});

test('DETAILS-COUNT-03: quantidade inválida ou indisponível não é interpretada como zero',async()=>{
  for(const value of [null,-1,1.5,true,{},[],{quantidade:109},9007199254740992]) {
    const s=service([],{handler:url=>url.pathname.endsWith('/quantidade')?json(value):null});
    await assert.rejects(s.service.details(purchase,1,100),error=>error.code==='INVALID_UPSTREAM');
    assert.equal(s.requests.length,1);
  }
  for(const status of [204,404,503]) {
    const s=service([],{handler:()=>new Response(null,{status})});
    await assert.rejects(s.service.details(purchase,1,100),error=>['INVALID_UPSTREAM','PNCP_HTTP_ERROR','PNCP_UNAVAILABLE'].includes(error.code));
    assert.equal(s.requests.length,1);
  }
});

test('DETAILS-COUNT-04: divergência entre quantidade e página exige atualizar sem declarar fim',async()=>{
  for(const pageItems of [[],items(8),items(10)]) {
    const s=service([],{itemQuantity:109,items:()=>pageItems});
    await assert.rejects(s.service.details(purchase,2,100),error=>error.code==='SOURCE_CHANGED');
  }
});

test('DETAILS-COUNT-05: toda consulta relê a quantidade e usa o orçamento da operação',async()=>{
  let total=109;
  const s=service([],{handler:url=>url.pathname.endsWith('/quantidade')?json(total):url.pathname.endsWith('/itens')?json(items(total).slice(100)):null});
  assert.equal((await s.service.details(purchase,2,100)).total_items,109);
  total=100;
  await assert.rejects(s.service.details(purchase,2,100),error=>error.code==='PAGE_OUT_OF_RANGE' && error.details.last_page===1);
  const limited=service([],{},{PNCP_MAX_REQUESTS_PER_OPERATION:1});
  await assert.rejects(limited.service.details(purchase,1,100),error=>error.code==='REQUEST_BUDGET');
  assert.equal(limited.requests.length,1);
});

test('DETAILS-COUNT-06: API HTTP expõe total e última página preservando os itens',async t=>{
  const fake=detailsFixture(109),app=createApplication(config(),{fetcher:fake.fetcher});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/contratacoes/14136816000151/2026/16/itens?pagina=2&tamanhoPagina=100`);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.total_items,109);assert.equal(result.total_pages,2);
  assert.equal(result.data[0].numeroItem,101);assert.equal(result.data.at(-1).numeroItem,109);
  assert.equal(result.has_more,false);assert.equal(result.upstream_requests,2);
});
