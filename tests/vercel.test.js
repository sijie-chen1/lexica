import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostedHandler } from '../server/vercel.js';
import { readFile } from 'node:fs/promises';
const env={OPENAI_API_KEY:'synthetic-hosted-test-key',APP_PASSWORD:'test-private-password-with-enough-length',LOCAL_DESKTOP:true};
const handler=createHostedHandler(env);
const request=(path,body,cookie)=>new Request(`https://lexica.example/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',origin:'https://lexica.example',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
test('hosted status always disables laptop configuration and never exposes a key',async()=>{
 const response=await handler(request('status'));const result=await response.json();
 assert.equal(result.localConfigurable,false);assert.equal(result.authenticated,false);assert.equal(result.configured,true);
 assert.ok(!JSON.stringify(result).includes(env.OPENAI_API_KEY));
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('hosted API cannot inherit the desktop authentication bypass',async()=>{
 assert.equal((await handler(request('ai',{kind:'lookup',term:'word'}))).status,401);
});
test('hosted login issues secure cookies and sessions survive a new function instance',async()=>{
 const response=await handler(request('login',{password:env.APP_PASSWORD}));assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/; Secure/);
 const other=createHostedHandler(env);
 assert.equal((await(await other(request('status',undefined,cookie.split(';')[0]))).json()).authenticated,true);
});
test('each deployed route exposes a web-standard fetch handler',async()=>{
 for(const route of ['status','ai','login','logout']){
  const module=await import(`../api/${route}.js`);assert.equal(typeof module.default.fetch,'function');
 }
});
test('deployment settings build and check the app and keep function timeout above the AI timeout',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.framework,'vite');assert.equal(config.outputDirectory,'dist');assert.match(config.buildCommand,/npm test/);assert.ok(config.functions['api/*.js'].maxDuration>=55);
});
