import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function isLocalDesktop(request, address, bindHost) {
  return ['127.0.0.1','localhost','::1'].includes(bindHost) && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address) && ['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname);
}
export async function loadLocalConfig(root) {
  try { const data=JSON.parse(await readFile(join(root,'.local-ai.json'),'utf8'));return {OPENAI_API_KEY:data.apiKey,OPENAI_BASE_URL:data.baseURL,OPENAI_MODEL:data.model}; }
  catch(error) { if(error.code==='ENOENT')return {};throw new Error('Local AI configuration could not be opened.'); }
}
export async function configureLocalAI(request, root, current, fetcher=fetch) {
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Open Settings in the local Lexica app to change the connection.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Expected JSON.'},415);
  let body;
  try{body=await request.json();}catch{return reply({error:'Invalid settings.'},400);}
  let url;
  try{
    url=new URL(body.baseURL.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error();
    url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
  }catch{return reply({error:'Enter a valid HTTPS API base address, for example https://api.openai.com/v1.'},400);}
  const baseURL=url.toString().replace(/\/$/,'');
  const model=typeof body.model==='string'?body.model.trim():'';
  if(!model||model.length>200)return reply({error:'Enter the model name supplied by your API provider.'},400);
  const entered=typeof body.apiKey==='string'?body.apiKey.trim():'';
  if(!entered&&baseURL!==(current.OPENAI_BASE_URL||'https://api.openai.com/v1'))return reply({error:'Enter your API key again when changing providers.'},400);
  const apiKey=entered||current.OPENAI_API_KEY;
  if(!apiKey||apiKey.length>2048||/[\r\n]/.test(apiKey))return reply({error:'Enter your API key.'},400);
  try{
    const response=await fetcher(`${baseURL}/chat/completions`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'user',content:'Reply with a JSON object with an ok field set to true.'}],response_format:{type:'json_object'},max_completion_tokens:100}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)return reply({error:response.status===401||response.status===403?'The provider rejected this key. Check the key and API address.':response.status===429?'The API account has reached its billing or usage limit.':`Connection test failed (${response.status}). Check the API address and model. Your previous settings were kept.`},400);
    const result=await response.json();
    if(result.choices?.[0]?.finish_reason!=='stop'||typeof result.choices?.[0]?.message?.content!=='string')throw new Error();
    JSON.parse(result.choices[0].message.content);
  }catch{return reply({error:'Could not complete the connection test. Check the address, model, and network. Your previous settings were kept.'},400);}
  try {
    const temporary=join(root,`.local-ai-${crypto.randomUUID()}.tmp`);
    await writeFile(temporary,JSON.stringify({apiKey,baseURL,model}),{mode:0o600,flag:'wx'});
    await rename(temporary,join(root,'.local-ai.json'));
  }catch{return reply({error:'Connection worked, but settings could not be saved on this laptop.'},500);}
  Object.assign(current,{OPENAI_API_KEY:apiKey,OPENAI_BASE_URL:baseURL,OPENAI_MODEL:model});
  return reply({ok:true,message:'Connection tested and saved.'});
}
