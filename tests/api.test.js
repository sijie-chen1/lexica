import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAPI } from '../server/api.js';
const env={OPENAI_API_KEY:'test-key-not-real',APP_PASSWORD:'test-long-personal-password'};
const req=(path,body,cookie,origin)=>new Request(`https://lexica.test/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});
let client=0;
async function login(){const response=await handleAPI(req('login',{password:env.APP_PASSWORD}),env,`client${client++}`);assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
test('status exposes configuration but no secrets',async()=>{
 const response=await handleAPI(req('status'),env);const text=await response.text();assert.ok(!text.includes(env.OPENAI_API_KEY));assert.ok(!text.includes(env.APP_PASSWORD));assert.equal(JSON.parse(text).authenticated,false);
});
test('AI cannot be used without authentication',async()=>{assert.equal((await handleAPI(req('ai',{kind:'lookup',term:'hello'}),env)).status,401);});
test('wrong password rejected; authenticated status accepted',async()=>{
 assert.equal((await handleAPI(req('login',{password:'wrong'}),env,'bad')).status,401);
 const cookie=await login();assert.equal((await(await handleAPI(req('status',undefined,cookie),env)).json()).authenticated,true);
 const forged=cookie.slice(0,-2)+'zz';assert.equal((await(await handleAPI(req('status',undefined,forged),env)).json()).authenticated,false);
});
test('cross-origin writes are rejected',async()=>{assert.equal((await handleAPI(req('login',{password:env.APP_PASSWORD},null,'https://attacker.test'),env)).status,403);});
test('mocked OpenAI lookup validates response and fixes model and token limit server-side',async()=>{
 const cookie=await login();let payload;
 const response=await handleAPI(req('ai',{kind:'lookup',term:'nuance',model:'expensive-override'},cookie),env,'lookup',async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-key-not-real');payload=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({definition:'noun · A subtle difference.',exampleSentence:'Notice the nuance.'})}}]});});
 assert.equal(response.status,200);assert.equal(payload.model,'gpt-4o-mini');assert.equal(payload.max_completion_tokens,800);assert.equal((await response.json()).definition,'noun · A subtle difference.');
});
test('incomplete AI responses never become saved definitions',async()=>{
 const cookie=await login();const response=await handleAPI(req('ai',{kind:'lookup',term:'hello'},cookie),env,'partial',async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]}));assert.equal(response.status,502);
});
test('provider errors never echo provider bodies or credentials',async()=>{
 const cookie=await login();const response=await handleAPI(req('ai',{kind:'lookup',term:'hello'},cookie),env,'provider',async()=>new Response('SECRET upstream body',{status:401}));assert.equal(response.status,502);assert.ok(!(await response.text()).includes('SECRET'));
});
test('password guessing is rate limited',async()=>{for(let i=0;i<8;i++)await handleAPI(req('login',{password:'wrong'}),env,'rate-test');assert.equal((await handleAPI(req('login',{password:'wrong'}),env,'rate-test')).status,429);});
test('AI setup remains unavailable when credentials are absent',async()=>{assert.equal((await handleAPI(req('login',{password:'anything'}),{},'unconfigured')).status,503);});
test('MC answers must be three unique distractors, not copies of the correct definition',async()=>{
 const cookie=await login();
 const call=content=>handleAPI(req('ai',{kind:'choices',term:'nuance',definition:'A subtle difference.'},cookie),env,crypto.randomUUID(),async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}));
 assert.equal((await call({distractors:['A sudden change.','A large quantity.','An obvious mistake.']})).status,200);
 assert.equal((await call({distractors:['A subtle difference.','Wrong','Wrong']})).status,502);
});
test('sentence test returns a validated verdict; malformed feedback cannot advance a word',async()=>{
 const cookie=await login();
 const call=verdict=>handleAPI(req('ai',{kind:'sentence-review',term:'nuance',definition:'A subtle difference.',sentence:'I noticed the nuance in her reply.'},cookie),env,crypto.randomUUID(),async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({verdict,feedback:'The meaning is demonstrated.',suggestion:''})}}]}));
 const response=await call('correct');assert.equal(response.status,200);assert.equal((await response.json()).verdict,'correct');
 assert.equal((await call('perhaps')).status,502);
});
