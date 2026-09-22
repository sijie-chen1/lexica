import test from 'node:test';
import assert from 'node:assert/strict';
import { newWord, rateWord, dueWords, parseBackup, mergeWords, studyQueue, DEFAULT_SETTINGS, localDay, previews, validateSettings } from '../src/model.js';
const now = new Date('2026-09-21T12:00:00Z');
test('FSRS Again returns in one minute, Good in ten minutes; Easy graduates',()=>{
  const word=newWord('resilient','Able to recover');
  assert.equal((rateWord(word,1,.9,now).card.due-now)/60000,1);
  assert.equal((rateWord(word,3,.9,now).card.due-now)/60000,10);
  assert.equal(rateWord(word,4,.9,now).card.state,2);
  assert.equal(word.card.reps,0);
});
test('failed mature recall is relearning, never averaged into a pass',()=>{
  let w=rateWord(newWord('nuance','A subtle difference'),4,.9,now);
  const failed=rateWord(w,1,.9,new Date(w.card.due));
  assert.equal(failed.card.state,3);assert.equal(failed.card.lapses,1);
  assert.equal(failed.studyHistory.length,2);assert.equal(failed.studyHistory[1].rating,1);
});
test('a short learning step is not due before its timestamp',()=>{
  const w=rateWord(newWord('test','test'),1,.9,now);
  assert.equal(dueWords([w],new Date(+now+59000)).length,0);
  assert.equal(dueWords([w],new Date(+now+60000)).length,1);
});
test('JSON backup preserves FSRS dates, history and next scheduling',()=>{
  const w=rateWord(newWord('word','definition'),4,.9,now);
  const [restored]=parseBackup(JSON.stringify({words:[w]}));
  assert.equal(+restored.card.due,+w.card.due);
  assert.deepEqual(rateWord(restored,3,.9,new Date(w.card.due)),rateWord(w,3,.9,new Date(w.card.due)));
});
test('old SM-2 backup preserves word and due date without fabricated reviews',()=>{
  const [word]=parseBackup(JSON.stringify({words:[{term:'legacy',definition:'Old',totalReviews:4,interval:7,nextReviewDate:'2026-09-22',lastReviewedAt:now.toISOString()}]}));
  assert.equal(word.card.state,2);assert.equal(word.card.stability,7);assert.equal(word.studyHistory.length,0);
  assert.equal(localDay(word.card.due),'2026-09-22');
  assert.ok(rateWord(word,3,.9,new Date(word.card.due)).card.stability>0);
});
test('malformed backup is rejected before changing anything',()=>{
  assert.throws(()=>parseBackup('{'));
  assert.throws(()=>parseBackup(JSON.stringify({words:[{term:'word'}]})));
  const w=newWord('word','definition');w.card.due='bad';
  assert.throws(()=>parseBackup(JSON.stringify({words:[w]})));
});
test('duplicate terms are skipped, colliding IDs are repaired',()=>{
  const a=newWord('hello','hi');const b=newWord('HELLO','hi');const c=newWord('world','earth',{id:a.id});
  const merged=mergeWords([a],[b,c]);assert.equal(merged.length,2);assert.notEqual(merged[0].id,merged[1].id);
  const parsed=parseBackup(JSON.stringify({words:[a,b,c]}));assert.equal(parsed.length,2);assert.notEqual(parsed[0].id,parsed[1].id);
});
test('new-word daily cap survives reload and never hides due reviews',()=>{
  const learned=Array.from({length:5},(_,i)=>rateWord(newWord(`known${i}`,'def'),1,.9,now));
  const fresh=Array.from({length:7},(_,i)=>newWord(`new${i}`,'def'));
  const restored=parseBackup(JSON.stringify({words:[...fresh,...learned]}));
  const queue=studyQueue(restored,{...DEFAULT_SETTINGS,dailyNew:5},new Date(+now+60000));
  assert.equal(queue.length,5);assert.deepEqual(queue,learned.map(w=>w.id));
});
test('higher retention does not produce longer mature intervals',()=>{
  const word=rateWord(newWord('word','meaning'),4,.9,now);
  const at=new Date(word.card.due);
  assert.ok(rateWord(word,3,.95,at).card.due<=rateWord(word,3,.85,at).card.due);
});
test('preview does not mutate the card',()=>{
  const word=newWord('word','meaning');const before=JSON.stringify(word);assert.equal(previews(word,.9,now).length,4);assert.equal(JSON.stringify(word),before);
});
test('settings are constrained to supported choices',()=>{
  assert.deepEqual(validateSettings({retention:2,dailyNew:-1,language:'unknown'}),DEFAULT_SETTINGS);
});
