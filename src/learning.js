// Recognition evidence is tracked separately from FSRS's memory estimates.
export const freshProgress = () => ({ stage: 'mc', streak: 0, days: [], sentencePasses: 0 });
export function normalizeProgress(value) {
  if (!value || !['mc','sentence','acquired'].includes(value.stage)) return freshProgress();
  return { stage: value.stage, streak: Number.isInteger(value.streak) && value.streak >= 0 ? value.streak : 0,
    days: [...new Set(Array.isArray(value.days) ? value.days.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [])].slice(-3),
    sentencePasses: Number.isInteger(value.sentencePasses) && value.sentencePasses >= 0 ? value.sentencePasses : 0 };
}
export const learningStage = word => normalizeProgress(word.learning).stage;
export const learningLabel = word => ({ mc: 'Multiple choice', sentence: 'Sentence ready', acquired: 'Acquired' }[learningStage(word)]);
export function progressAfterAnswer(word, mode, result, day, scheduledCard) {
  const current = normalizeProgress(word.learning);
  if (mode === 'mc') {
    if (current.stage !== 'mc') throw new Error('This word is ready for a sentence review.');
    if (!['correct','guessed','incorrect'].includes(result)) throw new Error('Invalid multiple-choice answer.');
    if (result !== 'correct') return { ...current, stage:'mc', streak:0, days:[] };
    const next = { ...current, streak:current.streak+1, days:[...new Set([...current.days,day])].slice(-3) };
    if (next.streak >= 3 && next.days.length >= 3 && scheduledCard.state === 2 && scheduledCard.scheduled_days >= 7) next.stage='sentence';
    return next;
  }
  if (mode !== 'sentence' || !['correct','partial','incorrect'].includes(result) || current.stage === 'mc') throw new Error('Invalid sentence review.');
  return result === 'correct' ? { ...current, stage:'acquired', sentencePasses:current.sentencePasses+1 } : { ...current, stage:'mc', streak:0, days:[] };
}
export const answerRating = result => result === 'correct' ? 3 : 1;
export function shuffle(items, random = Math.random) {
  const output=[...items];
  for(let i=output.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[output[i],output[j]]=[output[j],output[i]];}
  return output;
}
export const choiceSource = word => JSON.stringify([word.term,word.definition]);
export function validDistractors(values, definition) {
  if(!Array.isArray(values)||values.length!==3||!values.every(v=>typeof v==='string'&&v.trim()&&v.length<=10000))return false;
  return new Set([definition,...values].map(v=>v.trim().toLocaleLowerCase())).size===4;
}
export function savedChoices(word) {
  return word.choiceCache?.source===choiceSource(word) && validDistractors(word.choiceCache.distractors,word.definition) ? word.choiceCache.distractors : null;
}
export function collectionChoices(word, words) {
  const seen=new Set([word.definition.trim().toLocaleLowerCase()]);
  const candidates=words.filter(w=>w.id!==word.id).map(w=>w.definition).filter(def=>{
    if(typeof def!=='string'||!def.trim())return false;
    const key=def.trim().toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true;
  });
  return candidates.length>=3 ? shuffle(candidates).slice(0,3) : null;
}
