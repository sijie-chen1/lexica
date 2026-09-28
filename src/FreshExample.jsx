import { useEffect, useState } from 'react';
import { api } from './api.js';
import { exampleKey, recentExamples } from './practice.js';
export default function FreshExample({word,commit}) {
  const [text,setText]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;
    setText('');setError('');
    (async()=>{
      try {
        const excluded=recentExamples(word);
        const promptExamples=[];let length=0;
        for(const example of [...excluded].reverse()){if(length+example.length<=2000){promptExamples.push(example);length+=example.length;}}
        let sentence;
        for(let attempt=0;attempt<2;attempt++){
          const data=await api('ai',{kind:'example',term:word.term,definition:word.definition,exclude:promptExamples},controller.signal);
          sentence=data.exampleSentence;
          if(typeof sentence==='string' && sentence.trim() && !excluded.some(s=>exampleKey(s)===exampleKey(sentence)))break;
          sentence=null;
        }
        if(!sentence)throw new Error('AI repeated an earlier example. Try again for a new one.');
        if(!alive)return;
        const saved=await commit(d=>({...d,words:d.words.map(w=>w.id===word.id?{...w,exampleHistory:[...(w.exampleHistory||[]),sentence].slice(-30)}:w)}));
        if(alive){if(saved)setText(sentence);else setError('Could not save the new example. Try again.');}
      }catch(e){if(alive)setError('A new example is unavailable. You can continue practicing or retry.');}
    })();
    return()=>{alive=false;controller.abort();};
  },[word.id,retry]);
  return <div aria-live="polite">{text?<blockquote>{text}</blockquote>:error?<p className="micro">{error} <button className="text-button" onClick={()=>setRetry(n=>n+1)}>Retry example</button></p>:<p className="micro">Creating a fresh example…</p>}</div>;
}
