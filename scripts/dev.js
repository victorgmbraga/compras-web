import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function startDevelopment({ root=process.cwd(), args=[], stdio='inherit' }={}) {
  const watchers=[];
  let child=null,debounce=null,killTimer=null,stopped=false,restartPending=false;
  function launch() {
    restartPending=false;
    child=spawn(process.execPath,['--max-old-space-size=512','--env-file-if-exists=.env','src/server.js','--dev',...args],{cwd:root,stdio,windowsHide:true});
    child.on('error',error=>console.error(`Não foi possível iniciar o servidor: ${error.message}`));
    child.on('exit',()=>{
      clearTimeout(killTimer);child=null;
      if(restartPending && !stopped)launch();
    });
  }
  function terminate() {
    const current=child;
    if(!current || current.killed)return;
    current.kill('SIGTERM');
    killTimer=setTimeout(()=>current.kill('SIGKILL'),1500);killTimer.unref();
  }
  function changed() {
    if(stopped)return;
    clearTimeout(debounce);
    debounce=setTimeout(()=>{
      restartPending=true;
      if(child)terminate();else launch();
    },150);
  }
  async function close() {
    stopped=true;clearTimeout(debounce);
    for(const watcher of watchers)watcher.close();
    if(child)await new Promise(resolve=>{child.once('exit',resolve);terminate();});
  }
  try {
    for(const directory of ['src','public'])watchers.push(watch(resolve(root,directory),{recursive:true},changed));
    // Observar o diretório também detecta a criação e a substituição da .env.
    watchers.push(watch(root,(_event,filename)=>{
      if(['.env','package.json','package-lock.json'].includes(String(filename)))changed();
    }));
    for(const watcher of watchers)watcher.on('error',error=>{
      console.error(`Falha ao observar arquivos: ${error.message}`);process.exitCode=1;void close();
    });
  }catch(error){for(const watcher of watchers)watcher.close();throw error;}
  launch();
  return {close};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const dev=startDevelopment({args:process.argv.slice(2)});
  console.log('Hot reload ativo: src/, public/, .env e arquivos de dependências.');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void dev.close();});
}
