import test from 'node:test';
import assert from 'node:assert/strict';
import { newWord, rateWord, reviewAnswer, parseBackup } from '../src/model.js';
import { freshProgress, progressAfterAnswer, learningStage, collectionChoices, savedChoices, choiceSource } from '../src/learning.js';
const mature={state:2,scheduled_days:8};
test('MC needs spaced evidence, not three lucky answers in one session',()=>{
 let w=newWord('nuance','A subtle difference');
 for(let i=0;i<5;i++)w.learning=progressAfterAnswer(w,'mc','correct','2026-09-22',mature);
 assert.equal(learningStage(w),'mc');assert.equal(w.learning.days.length,1);
 w.learning=progressAfterAnswer(w,'mc','correct','2026-09-23',mature);
 w.learning=progressAfterAnswer(w,'mc','correct','2026-09-24',mature);
 assert.equal(learningStage(w),'sentence');
});
test('short FSRS interval prevents premature sentence readiness',()=>{
 let w=newWord('word','Meaning');
 for(const day of ['2026-09-22','2026-09-23','2026-09-24'])w.learning=progressAfterAnswer(w,'mc','correct',day,{state:2,scheduled_days:3});
 assert.equal(learningStage(w),'mc');
 w.learning=progressAfterAnswer(w,'mc','correct','2026-09-25',mature);assert.equal(learningStage(w),'sentence');
});
test('a wrong or guessed choice resets consecutive evidence',()=>{
 const w=newWord('word','Meaning',{learning:{stage:'mc',streak:3,days:['2026-09-22','2026-09-23'],sentencePasses:0}});
 for(const result of ['incorrect','guessed'])assert.deepEqual(progressAfterAnswer(w,'mc',result,'2026-09-24',mature),freshProgress());
});
test('only successful sentence usage confirms acquisition; a failure returns to MC',()=>{
 const w=newWord('word','Meaning',{learning:{stage:'sentence',streak:5,days:['2026-09-22','2026-09-23','2026-09-24'],sentencePasses:0}});
 const passed=progressAfterAnswer(w,'sentence','correct','2026-09-26',mature);
 assert.equal(passed.stage,'acquired');assert.equal(passed.sentencePasses,1);
 for(const result of ['partial','incorrect']){
  const failed=progressAfterAnswer({...w,learning:passed},'sentence',result,'2026-09-27',mature);
  assert.equal(failed.stage,'mc');assert.equal(failed.streak,0);assert.deepEqual(failed.days,[]);
 }
});
test('review records the exercise type, schedules failures sooner and round-trips progress',()=>{
 const now=new Date('2026-09-22T12:00:00Z');
 const word=rateWord(newWord('word','Meaning'),4,.9,now);
 const correct=reviewAnswer(word,'mc','correct',.9,new Date(word.card.due));
 const incorrect=reviewAnswer(word,'mc','incorrect',.9,new Date(word.card.due));
 assert.ok(incorrect.card.due<correct.card.due);
 assert.equal(correct.studyHistory.at(-1).mode,'mc');
 assert.deepEqual(parseBackup(JSON.stringify({words:[correct]}))[0],correct);
});
test('legacy recall logs never manufacture MC acquisition evidence',()=>{
 const old=rateWord(newWord('word','Meaning'),4);delete old.learning;
 const restored=parseBackup(JSON.stringify([old]))[0];
 assert.equal(restored.card.reps,1);assert.deepEqual(restored.learning,freshProgress());
});
test('choice cache survives backup but becomes invalid when meaning changes',()=>{
 const word=newWord('word','Meaning');word.choiceCache={source:choiceSource(word),distractors:['Wrong 1','Wrong 2','Wrong 3']};
 assert.deepEqual(savedChoices(parseBackup(JSON.stringify([word]))[0]),word.choiceCache.distractors);
 assert.equal(savedChoices({...word,definition:'New meaning'}),null);
});
test('collection fallback requires three unique distractors and excludes the answer',()=>{
 const w=newWord('word','Meaning');const pool=[w,newWord('same','Meaning'),newWord('a','A'),newWord('b','B'),newWord('c','C')];
 assert.deepEqual(collectionChoices(w,pool).sort(),['A','B','C']);
 assert.equal(collectionChoices(w,pool.slice(0,4)),null);
});
