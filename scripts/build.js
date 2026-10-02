import { cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url),output=new URL('../dist/',import.meta.url);
await mkdir(output,{recursive:true});
for(const directory of ['src','public','scripts','test','docs'])await cp(new URL(directory,root),new URL(directory,output),{recursive:true});
for(const file of ['package.json','package-lock.json','.env.example','Dockerfile','README.md','THIRD_PARTY_LICENSES.md'])await copyFile(new URL(file,root),new URL(file,output));
console.log(`Distribuição Node.js em ${fileURLToPath(output)}. Execute npm ci --omit=dev e npm start nessa pasta.`);
