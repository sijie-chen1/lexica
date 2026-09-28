import test from 'node:test';
import assert from 'node:assert/strict';
import { newWord, reviewAnswer, parseBackup, studyQueue, DEFAULT_SETTINGS, rateWord } from '../src/model.js';
import { practiceQueue, initialRemaining } from '../src/practice.js';
const now=new Date('2026-09-28T12:00:00Z');
const rng=()=>{let seed=19;return()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);};
test('initial practice interleaves three encounters per word with both exercise types, not fixed rounds',()=>{
 const words=Array.from({length:5},(_,i)=>newWord(`word${i}`,'Meaning'));
 const q=practiceQueue(words,words.map(w=>w.id),rng());
 assert.equal(q.length,15);
 for(const w of words){const entries=q.filter(x=>x.id===w.id);assert.equal(entries.length,3);assert.ok(entries.some(x=>x.mode==='mc'));assert.ok(entries.some(x=>x.mode==='flashcard'));}
 assert.ok(new Set(q.slice(0,5).map(x=>x.id)).size<5,'second encounters can happen before all first encounters');
});
test('interrupted initial learning resumes, counts once against daily cap, and survives backup',()=>{
 let w=newWord('word','Meaning');w=reviewAnswer(w,'mc','correct',.9,now);
 const others=Array.from({length:6},(_,i)=>newWord(`other${i}`,'Definition'));
 const restored=parseBackup(JSON.stringify([w,...others]));
 const ids=studyQueue(restored,{...DEFAULT_SETTINGS,dailyNew:5},now);
 assert.equal(ids.length,5);assert.ok(ids.includes(w.id));
 const pending=practiceQueue(restored,ids,rng()).filter(x=>x.id===w.id);
 assert.equal(pending.length,2);assert.ok(pending.some(x=>x.mode==='flashcard'));
 assert.equal(restored[0].card.reps,0);assert.equal(initialRemaining(restored[0]),2);
});
test('all three initial responses inform schedule, only completion initializes FSRS, and no immediate acquisition',()=>{
 function finish(results){let w=newWord('word','Meaning');for(let i=0;i<3;i++)w=reviewAnswer(w,i===1?'flashcard':'mc',results[i],.9,new Date(+now+i*60000));return w;}
 const strong=finish(['correct','correct','correct']);const weak=finish(['incorrect','correct','correct']);const uncertain=finish(['correct','guessed','correct']);
 assert.equal(strong.card.reps,1);assert.equal(strong.studyHistory.length,3);assert.equal(strong.learning.stage,'mc');
 assert.equal(initialRemaining(strong),0);assert.ok(weak.card.due<uncertain.card.due);assert.ok(uncertain.card.due<strong.card.due);
 assert.deepEqual(parseBackup(JSON.stringify([strong]))[0],strong);
 assert.equal(practiceQueue([strong],studyQueue([strong],DEFAULT_SETTINGS,new Date(+now+3*60000))).length,0);
});
test('existing reviewed words keep their schedule and do not restart initial learning',()=>{
 const w=rateWord(newWord('old','Meaning'),4,.9,now);const restored=parseBackup(JSON.stringify([w]))[0];
 assert.equal(initialRemaining(restored),0);assert.equal(+restored.card.due,+w.card.due);
 assert.equal(practiceQueue([restored],[restored.id]).length,1);
});
test('one-word practice still has three encounters and reload preserves example history',()=>{
 const w=newWord('solo','Meaning',{exampleHistory:['An earlier sentence.']});
 assert.equal(practiceQueue([w],[w.id]).length,3);
 assert.deepEqual(parseBackup(JSON.stringify([w]))[0].exampleHistory,w.exampleHistory);
});
