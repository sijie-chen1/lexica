import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureLocalAI, loadLocalConfig, isLocalDesktop } from '../server/local-config.js';
const request = (body, origin='http://127.0.0.1:4173')=>new Request('http://127.0.0.1:4173/api/config',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const values={baseURL:'https://api.openai.com/v1',model:'gpt-4o-mini',apiKey:'synthetic-test-key'};
const success=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]});
test('local setup only works on a loopback-bound server with loopback client and host',()=>{
 assert.equal(isLocalDesktop(request(values),'127.0.0.1','127.0.0.1'),true);
 assert.equal(isLocalDesktop(request(values),'127.0.0.1','0.0.0.0'),false);
 assert.equal(isLocalDesktop(request(values),'192.168.1.2','127.0.0.1'),false);
 assert.equal(isLocalDesktop(new Request('https://attacker.example/api/config'),'127.0.0.1','127.0.0.1'),false);
});
test('save tests the model, persists private credentials, and never returns the key',async()=>{
 const root=await mkdtemp(join(tmpdir(),'lexica-config-test-'));const config={};
 try {
  const response=await configureLocalAI(request(values),root,config,async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.redirect,'error');return success();});
  assert.equal(response.status,200);assert.ok(!(await response.text()).includes(values.apiKey));
  assert.equal((await loadLocalConfig(root)).OPENAI_MODEL,values.model);
  assert.equal((await stat(join(root,'.local-ai.json'))).mode&0o777,0o600);
  const before=await readFile(join(root,'.local-ai.json'),'utf8');
  const failed=await configureLocalAI(request({...values,apiKey:'bad-test-key'}),root,config,async()=>new Response('',{status:401}));
  assert.equal(failed.status,400);assert.equal(await readFile(join(root,'.local-ai.json'),'utf8'),before);
  assert.equal(config.OPENAI_API_KEY,values.apiKey);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('reject cross-origin changes and never forward a saved key to a changed provider',async()=>{
 const config={OPENAI_API_KEY:values.apiKey,OPENAI_BASE_URL:values.baseURL};let called=false;
 const fetcher=async()=>{called=true;return success();};
 assert.equal((await configureLocalAI(request(values,'https://attacker.example'),'/unused',config,fetcher)).status,403);
 assert.equal((await configureLocalAI(request({...values,baseURL:'https://other.example/v1',apiKey:''}),'/unused',config,fetcher)).status,400);
 assert.equal((await configureLocalAI(request({...values,baseURL:'http://api.openai.com/v1'}),'/unused',config,fetcher)).status,400);
 assert.equal(called,false);
});
