import { demoFetch, demoDocuments } from '../src/demo.js';
export async function uiDemoFetch(url,init) {
  const u=new URL(url);
  if(u.searchParams.get('q')==='benchmark-ui') {
    const size=Number(u.searchParams.get('tam_pagina')),page=Number(u.searchParams.get('pagina'));
    const items=Array.from({length:Math.min(size,10000-(page-1)*size)},(_,i)=>({...demoDocuments[i%demoDocuments.length],id:`benchmark-${(page-1)*size+i+1}`,numero_controle_pncp:`benchmark-${(page-1)*size+i+1}`}));
    return Response.json({items,total:10000});
  }
  if(u.searchParams.get('q')==='falha-ui')return new Response('<html>falha</html>',{headers:{'Content-Type':'text/html'}});
  if(u.searchParams.get('q')==='lenta-ui')await new Promise(resolve=>setTimeout(resolve,500));
  if(u.searchParams.get('q')==='janela-ui') {
    const size=Number(u.searchParams.get('tam_pagina')),page=Number(u.searchParams.get('pagina'));
    const docs=Array.from({length:size},(_,i)=>({...demoDocuments[i%demoDocuments.length],id:`janela-${(page-1)*size+i+1}`,numero_controle_pncp:`janela-${(page-1)*size+i+1}`}));
    return Response.json({items:docs,total:4143240});
  }
  if(['pagina-ui','csv-lenta-ui'].includes(u.searchParams.get('q'))) {
    const docs=Array.from({length:164},(_,i)=>({...demoDocuments[i%demoDocuments.length],id:`pagina-${i+1}`,numero_controle_pncp:`pagina-${i+1}`}));
    const size=Number(u.searchParams.get('tam_pagina')),page=Number(u.searchParams.get('pagina'));
    if(u.searchParams.get('q')==='csv-lenta-ui' && page>1)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{init.signal.removeEventListener('abort',abort);resolve();},500);
      const abort=()=>{clearTimeout(timer);reject(init.signal.reason);};init.signal.addEventListener('abort',abort,{once:true});
    });
    return Response.json({items:docs.slice((page-1)*size,page*size),total:docs.length});
  }
  if(u.searchParams.get('q')==='xss-ui')return new Response(JSON.stringify({items:[{id:'xss',doc_type:'_doc',document_type:'edital',description:'<img src=x onerror="window.pwned=true">',orgao_cnpj:'00000000000000',ano:'2026',numero_sequencial:'1'}],total:1}),{headers:{'Content-Type':'application/json'}});
  return demoFetch(url,init);
}
