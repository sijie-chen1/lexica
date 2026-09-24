import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAPI } from '../server/api.js';
import { readAIConnection, saveAIConnection, clearAIConnection } from '../src/ai-session.js';
import { api, connectPersonalAI } from '../src/api.js';

const own = { apiKey:'synthetic-personal-key', baseURL:'https://api.openai.com/v1', model:'my-model' };
const request = (data, origin='https://lexica.example') => new Request('https://lexica.example/api/ai', {method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify({kind:'lookup',term:'hello',...data})});
const completion = () => Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({definition:'A greeting.',exampleSentence:'Hello, friend!'})}}]});

test('personal connection uses only the supplied key and never changes server settings', async()=>{
  const env={PERSONAL_AI_ENABLED:true,OPENAI_API_KEY:'synthetic-owner-key',APP_PASSWORD:'owner-password'};
  let calls=0;
  const response=await handleAPI(request({personalAI:own}),env,'personal-test',async(url,options)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization,`Bearer ${own.apiKey}`);
    assert.equal(JSON.parse(options.body).model,own.model);assert.equal(options.redirect,'error');
    return completion();
  });
  assert.equal(response.status,200);assert.equal(calls,1);assert.ok(!(await response.text()).includes(own.apiKey));
  assert.equal(env.OPENAI_API_KEY,'synthetic-owner-key');
  assert.equal((await handleAPI(request({}),env,'other-visitor')).status,401);
  assert.equal((await handleAPI(request({}),{PERSONAL_AI_ENABLED:true},'empty-server')).status,503);
});

test('personal connection rejects arbitrary destinations, bad credentials and cross-origin requests before fetch',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return completion();};
  for(const baseURL of ['https://example.org/v1','https://127.0.0.1/v1','http://api.openai.com/v1','https://secret@api.openai.com/v1','https://api.openai.com/v1?secret=x']) {
    assert.equal((await handleAPI(request({personalAI:{...own,baseURL}}),{PERSONAL_AI_ENABLED:true},'invalid-url',fetcher)).status,400);
  }
  assert.equal((await handleAPI(request({personalAI:{...own,apiKey:''}}),{PERSONAL_AI_ENABLED:true},'blank-key',fetcher)).status,400);
  assert.equal((await handleAPI(request({personalAI:own},'https://other.example'),{PERSONAL_AI_ENABLED:true},'cross-origin',fetcher)).status,403);
  assert.equal((await handleAPI(request({personalAI:own}),{},'disabled',fetcher)).status,400);
  assert.equal(calls,0);
});

test('failed provider response never exposes the key',async()=>{
  const response=await handleAPI(request({personalAI:own}),{PERSONAL_AI_ENABLED:true},'failed-key',async()=>new Response(own.apiKey,{status:401}));
  assert.equal(response.status,502);assert.ok(!(await response.text()).includes(own.apiKey));
});

test('browser connection is tested before saving, survives reads, is scoped to AI calls and disconnects',async()=>{
  const oldFetch=globalThis.fetch, oldStorage=globalThis.sessionStorage, oldLocal=globalThis.localStorage;
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const values=new Map(),persistent=new Map();
  globalThis.localStorage={getItem:k=>persistent.get(k)??null,setItem:(k,v)=>persistent.set(k,v),removeItem:k=>persistent.delete(k)};
  globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
  try {
    let failed=false;const requests=[];
    globalThis.fetch=async(path,options)=>{
      requests.push({path,body:options.body&&JSON.parse(options.body)});
      if(path==='/api/status')return Response.json({personalConfigurable:true,configured:false,authenticated:false});
      return failed?Response.json({error:'Key rejected'},{status:502}):Response.json({definition:'greeting',exampleSentence:'Hello!'});
    };
    await connectPersonalAI(own);assert.deepEqual(readAIConnection(),own);
    const status=await api('status');assert.equal(status.personalConnected,true);assert.equal(status.authenticated,true);assert.equal(status.apiKey,undefined);
    assert.equal(requests.at(-1).body,undefined);
    await api('ai',{kind:'lookup',term:'word'});assert.deepEqual(requests.at(-1).body.personalAI,own);
    failed=true;await assert.rejects(connectPersonalAI({...own,apiKey:'bad-replacement'}),/Key rejected/);assert.deepEqual(readAIConnection(),own);
    clearAIConnection();assert.equal(readAIConnection(),null);assert.equal((await api('status')).authenticated,false);
    await api('logout',{}).catch(()=>{});assert.equal(requests.at(-1).body.personalAI,undefined);
    globalThis.sessionStorage.setItem('lexica-personal-ai',JSON.stringify(own));assert.equal(readAIConnection(),null);
    globalThis.localStorage.removeItem('lexica-personal-ai');assert.deepEqual(readAIConnection(),own);assert.equal(values.size,0);
    // A new browser session retains the persistent key.
    values.clear();assert.deepEqual(readAIConnection(),own);
    globalThis.localStorage.setItem('lexica-personal-ai','broken');assert.equal(readAIConnection(),null);
  } finally {
    globalThis.fetch=oldFetch;
    if(oldLocal===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldLocal;
    if(oldStorage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=oldStorage;
    if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;
  }
});
