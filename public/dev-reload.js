(() => {
  const version=new URL(document.currentScript.src).searchParams.get('version');
  const events=new EventSource('/__dev/events');
  events.addEventListener('ready',event=>{
    if(JSON.parse(event.data).version!==version){events.close();window.location.reload();}
  });
  window.addEventListener('pagehide',()=>events.close(),{once:true});
})();
