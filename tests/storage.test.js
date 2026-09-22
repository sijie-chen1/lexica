import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState } from '../src/storage.js';
import { newWord } from '../src/model.js';
globalThis.localStorage={ getItem:()=>null };
test('committed save persists; a stale tab cannot overwrite newer vocabulary',async()=>{
 const original=await loadState();assert.equal(original.words.length,0);
 const first=await saveState({...original,words:[newWord('safe','Preserved.')]});
 assert.equal(first.revision,1);
 await assert.rejects(saveState({...original,words:[]}),/another window/);
 const restored=await loadState();assert.equal(restored.words[0].term,'safe');assert.equal(restored.revision,1);
 const second=await saveState({...restored,words:[...restored.words,newWord('second','Also preserved.')]});
 assert.equal(second.revision,2);assert.equal((await loadState()).words.length,2);
});
test('a rejected save does not poison later valid saves',async()=>{
 const state=await loadState();await assert.rejects(saveState({...state,revision:0}));
 const next=await saveState(state);assert.equal(next.revision,state.revision+1);
});
