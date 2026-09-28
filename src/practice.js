import { shuffle, learningStage } from './learning.js';
export const initialAnswers = word => word.initialStudy?.answers || [];
export const initialRemaining = word => word.initialStudy ? Math.max(0, 3-initialAnswers(word).length) : word.card.reps === 0 ? 3 : 0;
export function practiceQueue(words, ids, random=Math.random) {
  const pool=[];
  for (const id of ids) {
    const word=words.find(w=>w.id===id); if(!word)continue;
    const remaining=initialRemaining(word);
    if(remaining){
      const used=initialAnswers(word).map(a=>a.mode);
      const modes=shuffle([...(used.includes('mc')?[]:['mc']),...(used.includes('flashcard')?[]:['flashcard'])],random);
      while(modes.length<remaining)modes.push(random()<.5?'mc':'flashcard');
      for(const mode of shuffle(modes.slice(0,remaining),random))pool.push({id,mode});
    }else pool.push({id,mode:learningStage(word)==='mc'?(random()<.5?'mc':'flashcard'):'sentence'});
  }
  const result=[];
  while(pool.length){
    const candidates=pool.map((v,i)=>i).filter(i=>pool[i].id!==result.at(-1)?.id);
    const indexes=candidates.length?candidates:pool.map((v,i)=>i);
    result.push(pool.splice(indexes[Math.floor(random()*indexes.length)],1)[0]);
  }
  return result;
}
export const exampleKey = text => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const recentExamples = word => [...new Set([word.exampleSentence,...(word.exampleHistory||[])].filter(Boolean))].slice(-30);
