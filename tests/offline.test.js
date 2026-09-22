import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
test('offline shell references real build artifacts and never caches the AI API',async()=>{
 const source=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');
 const handlers={};let assets,intercepted=false;
 const context={URL,Promise,self:{location:{origin:'https://lexica.test'},clients:{claim:()=>{}},addEventListener:(name,handler)=>{handlers[name]=handler;}},caches:{open:async()=>({addAll:async files=>{assets=files;}})}};
 vm.runInNewContext(source,context);
 let pending;handlers.install({waitUntil:p=>{pending=p;}});await pending;
 for(const asset of assets)assert.ok((await stat(new URL('../dist'+(asset==='/'?'/index.html':asset),import.meta.url))).isFile(),asset);
 handlers.fetch({request:{method:'GET',url:'https://lexica.test/api/status'},respondWith:()=>{intercepted=true;}});
 assert.equal(intercepted,false);
});
