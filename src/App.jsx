import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, newWord, parseBackup, mergeWords, rateWord, previews, dueWords, studyQueue, phaseLabel, localDay, intervalLabel, newAllowance, reviewAnswer } from './model.js';
import { loadState, saveState } from './storage.js';
import { api, connectPersonalAI } from './api.js';
import { clearAIConnection } from './ai-session.js';
import ReviewQuestion from './ReviewQuestion.jsx';
import { learningStage, learningLabel, freshProgress } from './learning.js';

const ICONS = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></>,
  book: <><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Z"/><path d="M12 5v15"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  sound: <><path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  leaf: <><path d="M20 3C7 2 2 9 6 16s16 4 14-13Z"/><path d="m4 21 11-12"/></>,
  spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
};
function Icon({ name, size = 20 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>; }
function speak(text) { if (!window.speechSynthesis) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = 0.85; window.speechSynthesis.speak(utterance); }
function Sound({ text }) { return <button className="icon-button" aria-label={`Pronounce ${text}`} onClick={() => speak(text)}><Icon name="sound"/></button>; }
function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const SAMPLE = [['serendipity','noun · Finding something good or valuable by chance.','Finding my favorite book in a tiny café was pure serendipity.'],['resilient','adjective · Able to recover after difficulty or change.','The resilient plants survived the dry summer.'],['nuance','noun · A small but meaningful difference in meaning or expression.','Her translation captured every nuance of the poem.'],['deliberate','adjective · Done carefully and with a clear purpose.','He made a deliberate effort to listen more closely.'],['eloquent','adjective · Expressing ideas clearly and effectively.','She gave an eloquent explanation of a difficult idea.']];

export default function App() {
  const [data, setData] = useState(null), dataRef = useRef(null);
  const [loadError, setLoadError] = useState(''), [notice, setNotice] = useState('');
  const [tab, setTab] = useState('today'), [session, setSession] = useState(null), [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false), saveLock = useRef(false);
  const [online, setOnline] = useState(navigator.onLine), [now, setNow] = useState(new Date());
  const [connection, setConnection] = useState(null);
  const refreshConnection = () => api('status').then(setConnection).catch(() => setConnection(null));
  useEffect(() => { let alive = true; loadState().then(d => { if (alive) { dataRef.current = d; setData(d); } }).catch(e => { if (alive) setLoadError(e.message); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); setNow(new Date()); refreshConnection(); };
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('focus', update);
    const timer = setInterval(() => setNow(new Date()), 30000); refreshConnection();
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('focus', update); clearInterval(timer); };
  }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [tab, Boolean(session)]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
  async function commit(change) {
    if (saveLock.current) return false;
    saveLock.current = true; setSaving(true);
    try { const next = change(dataRef.current); const saved = await saveState(next); dataRef.current = saved; setData(saved); return true; }
    catch (error) { setNotice(error.message?.includes('window') || error.message?.includes('overwritten') ? error.message : 'Could not save. Your last saved progress is safe. Free some device storage and try again.'); return false; }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function addWords(incoming) {
    let added = 0;
    const saved = await commit(d => { const words = mergeWords(d.words, incoming); added = words.length - d.words.length; return { ...d, words }; });
    if (saved) setNotice(added ? `${added} ${added === 1 ? 'word' : 'words'} saved to your collection.` : 'These words are already in your collection.');
    return saved;
  }
  if (!data) return <main className="loading-page"><div className="logo-mark">L<span>✦</span></div><h1>Lexica</h1>{loadError ? <><p role="alert">{loadError}</p><button className="primary" onClick={() => location.reload()}>Try again</button></> : <p>Opening your vocabulary…</p>}</main>;
  const { words, settings } = data;
  const queue = studyQueue(words, settings, now);
  const due = dueWords(words, now);
  const reviewedToday = words.flatMap(w => w.studyHistory).filter(h => localDay(new Date(h.review)) === localDay(now)).length;
  const start = () => { const ids = studyQueue(dataRef.current.words, dataRef.current.settings); setSession({ ids, completed: 0 }); };
  const selectedWord = words.find(w => w.id === detail);
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('today'); setSession(null); }}> <span className="logo-mark small">L<span>✦</span></span>Lexica<span className="brand-dot">.</span></a><span className={`connection ${online ? '' : 'offline'}`}><i/>{!online ? 'Offline' : connection?.authenticated ? 'AI connected' : 'Your word garden'}</span></header>
    {!online && <div className="offline-strip">Saved words and reviews are available offline.</div>}
    {session ? <Study words={words} session={session} settings={settings} saving={saving} setSession={setSession} commit={commit} close={() => setSession(null)} now={now}/> : <>
      <main className="main-content" key={tab}>
        {tab === 'today' && <>
          <div className="eyebrow">{now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <div className="page-heading"><h1>A little, every day.</h1><p>Small moments. Lasting vocabulary.</p></div>
          <section className="daily-card">
            <div className="daily-copy"><span className="pill light"><Icon name="leaf" size={14}/> YOUR DAILY PRACTICE</span><h2>{queue.length ? <>Make room for<br/>what you know.</> : words.length ? <>A little pause.<br/>You’ve earned it.</> : <>Your next chapter<br/>starts with a word.</>}</h2><p>{queue.length ? `${due.length} due for review · ${queue.length - due.length} new to discover` : words.length ? 'You’re up to date. Come back when your next review is ready.' : 'Save words you encounter. We’ll help you remember them.'}</p><button className="cream-button" onClick={queue.length ? start : () => setTab('lookup')}>{queue.length ? 'Start practice' : 'Discover a word'}<Icon name="arrow"/></button></div>
            <div className="garden" aria-hidden="true"><div className="garden-ring ring-one"/><div className="garden-ring ring-two"/><div className="stem"/><div className="petal p1"/><div className="petal p2"/><div className="petal p3"/><div className="petal p4"/><span className="garden-star">✧</span></div>
          </section>
          <div className="stat-grid"><Stat value={reviewedToday} label="Reviews today"/><Stat value={words.length} label="Words collected"/><Stat value={words.filter(w => learningStage(w) === 'acquired').length} label="Words acquired"/></div>
          <section className="section"><div className="section-title"><h2>Your rhythm</h2><span>PAST 7 DAYS</span></div><Activity words={words} now={now}/></section>
          <section className="section"><div className="section-title"><h2>{words.length ? 'Recently collected' : 'Begin with curiosity'}</h2>{words.length > 0 && <button className="text-button" onClick={() => setTab('words')}>View all <Icon name="arrow" size={16}/></button>}</div>{words.length ? <div className="word-list">{[...words].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,3).map(w => <WordRow key={w.id} word={w} onClick={() => setDetail(w.id)}/>)}</div> : <div className="empty-card"><Icon name="book" size={28}/><h3>Words worth keeping.</h3><p>Look up a word, add your own, or try five starter words to explore your first practice.</p><button className="secondary" disabled={saving} onClick={() => addWords(SAMPLE.map(([term,definition,exampleSentence]) => newWord(term, definition, { exampleSentence })))}>Add 5 starter words <Icon name="plus" size={16}/></button></div>}</section>
          <div className="quiet-note"><Icon name="spark" size={17}/><p>Remembering takes practice, not perfection.<br/>Words you find difficult will return sooner.</p></div>
        </>}
        {tab === 'lookup' && <Lookup addWords={addWords} words={words} settings={settings} saving={saving} online={online} connection={connection} openSettings={() => setTab('settings')}/>}
        {tab === 'words' && <Collection words={words} openWord={setDetail} addWords={addWords} saving={saving} discover={() => setTab('lookup')} due={due.length} start={start}/>}
        {tab === 'settings' && <Settings data={data} commit={commit} saving={saving} addWords={addWords} connection={connection} refreshConnection={refreshConnection} notice={setNotice}/>}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">{[['today','home','Today'],['lookup','search','Discover'],['words','book','My words'],['settings','settings','Settings']].map(([id,icon,label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon name={icon}/><span>{label}</span>{id === 'today' && due.length > 0 && <i className="nav-dot"/>}</button>)}</nav>
    </>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" size={16}/></button></div>}
    {selectedWord && <WordDetail key={selectedWord.id} word={selectedWord} close={() => setDetail(null)} saving={saving} commit={commit}/>}
  </div>;
}
function Stat({ value, label }) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }
function Activity({ words, now }) {
  const logs = words.flatMap(w => w.studyHistory);
  const days = Array.from({ length: 7 }, (_,i) => { const date = new Date(now); date.setDate(date.getDate() - 6 + i); return { date, count: logs.filter(h => localDay(new Date(h.review)) === localDay(date)).length }; });
  const max = Math.max(5, ...days.map(d => d.count));
  return <div className="activity">{days.map(({ date,count },i) => <div className={`activity-day ${i === 6 ? 'current' : ''}`} key={localDay(date)} aria-label={`${date.toLocaleDateString('en', { weekday: 'long' })}: ${count} reviews`}><span className="activity-count">{count || '·'}</span><div className="bar-track"><div style={{ height: `${Math.max(5,count/max*100)}%` }}/></div><span>{date.toLocaleDateString('en', { weekday: 'short' }).slice(0,2)}</span></div>)}</div>;
}
function WordRow({ word, onClick }) { return <button className="word-row" onClick={onClick}><span className="word-initial">{word.term[0].toUpperCase()}</span><span className="word-row-copy"><strong>{word.term}</strong><span>{word.definition}</span></span><span className={`phase state-${word.card.state}`}>{phaseLabel(word)}</span><Icon name="arrow" size={16}/></button>; }
function Lookup({ addWords, words, settings, saving, online, connection, openSettings }) {
  const [query,setQuery] = useState(''), [result,setResult] = useState(null), [loading,setLoading] = useState(false), [error,setError] = useState(''), [manual,setManual] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function lookup(e) {
    e.preventDefault(); if (!query.trim() || loading) return; setError(''); setResult(null);
    const existing = words.find(w => w.term.toLowerCase() === query.trim().toLowerCase());
    if (existing) { setResult(existing); return; }
    setLoading(true); controller.current = new AbortController();
    try { const answer = await api('ai', { kind: 'lookup', term: query.trim(), language: settings.language }, controller.current.signal); setResult(newWord(query.trim(), answer.definition, { exampleSentence: answer.exampleSentence })); }
    catch(e) { setError(e.message); } finally { setLoading(false); }
  }
  const saved = result && words.some(w => w.term.toLowerCase() === result.term.toLowerCase());
  return <><div className="eyebrow">FOLLOW YOUR CURIOSITY</div><div className="page-heading"><h1>Find your next word.</h1><p>A meaning, a little context, a place in your memory.</p></div><form className="lookup-form" onSubmit={lookup}><label className="sr-only" htmlFor="lookup">Word or phrase</label><Icon name="search"/><input id="lookup" value={query} onChange={e => setQuery(e.target.value)} maxLength={200} placeholder="A word you’re curious about…" autoComplete="off" autoCapitalize="none" required/><button className="primary compact" disabled={loading || !query.trim()} aria-label="Look up word">{loading ? <span className="spinner"/> : <Icon name="arrow"/>}</button></form><div className="lookup-sub"><span><Icon name="spark" size={14}/> Definitions with AI</span><button className="text-button" onClick={() => setManual(!manual)}>{manual ? 'Close manual entry' : 'Add a word manually'}</button></div>
    {manual && <ManualAdd addWords={addWords} saving={saving}/>}
    {!connection?.authenticated && !result && !loading && <div className="connection-card"><Icon name="spark"/><div><strong>{!online ? 'A moment offline' : connection?.configured ? 'Your AI dictionary is ready to unlock' : 'Connect your AI dictionary'}</strong><p>{!online ? 'You can still add your own definitions and practice saved words.' : 'Use OpenAI for definitions, examples, and sentence feedback.'}</p><button className="text-button" onClick={openSettings}>Open connection settings <Icon name="arrow" size={15}/></button></div></div>}
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <div className="definition-card skeleton" role="status"><span className="eyebrow">LOOKING UP YOUR WORD</span><h2>{query}</h2><div/><div/><p>Finding a meaning and a natural example…</p></div>}
    {result && <article className="definition-card"><span className="eyebrow">A WORD WORTH KNOWING</span><div className="definition-title"><h2>{result.term}</h2><Sound text={result.term}/></div><p className="definition">{result.definition}</p>{result.exampleSentence && <blockquote>{result.exampleSentence}</blockquote>}<button className={saved ? 'saved-button' : 'primary full'} disabled={saved || saving} onClick={() => addWords([result])}><Icon name={saved ? 'check' : 'plus'} size={18}/>{saved ? 'In your collection' : 'Save to my words'}</button><p className="micro">AI can make mistakes. You can edit saved definitions.</p></article>}
    {!result && !loading && <div className="discovery-note"><span>“</span><p>The limits of my language mean<br/>the limits of my world.</p><small>LUDWIG WITTGENSTEIN</small></div>}
  </>;
}
function ManualAdd({ addWords, saving }) {
  const [term,setTerm] = useState(''), [definition,setDefinition] = useState(''), [example,setExample] = useState('');
  return <form className="panel form-stack" onSubmit={async e => { e.preventDefault(); if (await addWords([newWord(term,definition,{exampleSentence:example})])) { setTerm(''); setDefinition(''); setExample(''); } }}><h3>Make it your own</h3><label>Word or phrase<input required maxLength={200} value={term} onChange={e=>setTerm(e.target.value)} placeholder="e.g. serendipity"/></label><label>Meaning<textarea required maxLength={10000} value={definition} onChange={e=>setDefinition(e.target.value)} placeholder="A definition that makes sense to you"/></label><label>Example <span className="muted">(optional)</span><textarea maxLength={4000} value={example} onChange={e=>setExample(e.target.value)} placeholder="Put it in context"/></label><button className="primary" disabled={saving || !term.trim() || !definition.trim()}>Save word <Icon name="plus" size={17}/></button></form>;
}
function Collection({ words, openWord, discover, due, start }) {
  const [query,setQuery] = useState(''), [filter,setFilter] = useState('all');
  const filtered = [...words].filter(w => `${w.term} ${w.definition}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'new' ? w.card.state === 0 : w.card.state !== 0 && new Date(w.card.due) <= new Date()))).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  return <><div className="eyebrow">YOUR PERSONAL COLLECTION</div><div className="page-heading heading-with-action"><div><h1>Words to keep.</h1><p>{words.length} words, and a world of possibility.</p></div><button className="icon-button add-button" aria-label="Add word" onClick={discover}><Icon name="plus"/></button></div><div className="collection-search"><Icon name="search" size={18}/><input aria-label="Search saved vocabulary" placeholder="Search your collection" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="filter-row">{[['all','All words'],['new','New'],['due',`Due · ${due}`]].map(([id,label]) => <button key={id} aria-pressed={filter===id} className={filter===id?'selected':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>{due>0 && <button className="review-banner" onClick={start}><span><Icon name="leaf" size={17}/>{due} words ready for another look</span><Icon name="arrow" size={17}/></button>}<div className="word-list">{filtered.map(w=><WordRow key={w.id} word={w} onClick={()=>openWord(w.id)}/>)}</div>{!filtered.length && <div className="empty-card"><Icon name="book" size={30}/><h3>{words.length?'No words here yet.':'Your collection starts here.'}</h3><p>{words.length?'Try a different search or filter.':'Collect the words you encounter in books, conversations, and everyday life.'}</p>{!words.length && <button className="secondary" onClick={discover}>Discover a word <Icon name="arrow" size={17}/></button>}</div>}</>;
}
function Study({ words, session, settings, saving, setSession, commit, close, now }) {
  const [undo,setUndo] = useState(null);
  const word=words.find(w=>w.id===session.ids[0]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[session.ids[0]]);
  async function saveAnswer(mode,result) {
    const updated=reviewAnswer(word,mode,result,settings.retention);
    if(await commit(d=>({...d,words:d.words.map(w=>w.id===word.id?updated:w)}))){
      setUndo({word,session});
      const advanced=learningStage(word)!==learningStage(updated);
      setSession(s=>({...s,ids:s.ids.slice(1),completed:s.completed+1,note:advanced?(learningStage(updated)==='sentence'?`“${word.term}” is ready for a sentence test at its next scheduled review.`:learningStage(updated)==='acquired'?`“${word.term}” is now acquired. We’ll keep checking it in sentences.`:`“${word.term}” is back in multiple choice for more practice.`):''}));
    }
  }
  async function undoLast(){if(undo&&await commit(d=>({...d,words:d.words.map(w=>w.id===undo.word.id?undo.word:w)}))){setSession(undo.session);setUndo(null);}}
  const skip=()=>{setUndo(null);setSession(s=>({...s,ids:s.ids.slice(1),skipped:(s.skipped||0)+1,note:'Skipped without changing the word’s schedule.'}));};
  const cacheChoices=(id,choiceCache)=>commit(d=>({...d,words:d.words.map(w=>w.id===id?{...w,choiceCache}:w)}));
  const dueAgain=dueWords(words,now);
  const next=words.filter(w=>w.card.state!==0&&new Date(w.card.due)>now).sort((a,b)=>new Date(a.card.due)-new Date(b.card.due))[0];
  const total=session.completed+session.ids.length+(session.skipped||0);
  return <main className="study-page"><div className="study-toolbar"><button className="text-button" disabled={saving} onClick={close}><Icon name="close" size={18}/> Finish</button><span>{session.completed} reviewed · {session.ids.length} left</span><button className="text-button" disabled={!undo||saving} onClick={undoLast}>Undo</button></div><div className="progress-track"><div style={{width:`${(session.completed+(session.skipped||0))/(total||1)*100}%`}}/></div>
    {session.note&&<p className="stage-notice" role="status">{session.note}</p>}
    {word?<ReviewQuestion key={word.id} word={word} words={words} saving={saving} cacheChoices={cacheChoices} saveAnswer={saveAnswer} skip={skip} Sound={Sound}/>:<div className="session-done"><div className="completion-mark"><Icon name="check" size={36}/></div><span className="eyebrow">A LITTLE PROGRESS, MADE.</span><h1>Practice complete.</h1><p>{session.completed} reviews saved{session.skipped?` · ${session.skipped} skipped`:''}.<br/>{dueAgain.length?`${dueAgain.length} words are ready to revisit.`:next?`Your next review is in about ${intervalLabel(next.card.due,now)}.`:'Your next words are waiting to be discovered.'}</p>{dueAgain.length>0&&<button className="primary full" onClick={()=>setSession(s=>({...s,ids:dueAgain.map(w=>w.id),note:''}))}>Review ready words <Icon name="arrow"/></button>}<button className="secondary full" onClick={close}>Back to today</button><p className="micro">You can close the app. Saved answers and progress are kept.</p></div>}
  </main>;
}
function WordDetail({ word, close, saving, commit }) {
  const [editing,setEditing] = useState(false), [term,setTerm] = useState(word.term), [definition,setDefinition] = useState(word.definition), [example,setExample] = useState(word.exampleSentence);
  const [sentence,setSentence] = useState(''), [feedback,setFeedback] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [deleting,setDeleting] = useState(false); const dialog = useRef(null); const controller = useRef(null);
  useEffect(()=>{dialog.current.showModal();return()=>controller.current?.abort();},[]);
  async function practice(e) { e.preventDefault();if(busy)return;setBusy(true);setError('');setFeedback(null);controller.current=new AbortController();try{setFeedback(await api('ai',{kind:'practice',term:word.term,definition:word.definition,sentence},controller.current.signal));}catch(e){setError(e.message);}finally{setBusy(false);} }
  return <dialog ref={dialog} className="word-dialog" onCancel={close}><div className="dialog-content"><div className="dialog-top"><span className="eyebrow">IN YOUR COLLECTION</span><button className="icon-button" aria-label="Close word details" onClick={close}><Icon name="close"/></button></div>{editing ? <form className="form-stack" onSubmit={async e=>{e.preventDefault();setError('');let duplicate=false;const saved=await commit(d=>{duplicate=d.words.some(w=>w.id!==word.id&&w.term.toLowerCase()===term.trim().toLowerCase());return duplicate?d:{...d,words:d.words.map(w=>w.id===word.id?{...w,term:term.trim(),definition:definition.trim(),exampleSentence:example.trim(),...(term.trim()!==w.term||definition.trim()!==w.definition?{learning:freshProgress(),choiceCache:undefined}: {})}:w)};});if(duplicate)setError('That word already exists in your collection.');else if(saved)setEditing(false);}}><label>Word<input value={term} onChange={e=>setTerm(e.target.value)} required maxLength={200}/></label><label>Definition<textarea value={definition} onChange={e=>setDefinition(e.target.value)} required maxLength={10000}/></label><label>Example<textarea value={example} onChange={e=>setExample(e.target.value)} maxLength={4000}/></label><div className="button-row"><button className="primary" disabled={saving||!term.trim()||!definition.trim()}>Save changes</button><button type="button" className="secondary" onClick={()=>setEditing(false)}>Cancel</button></div></form>:<><div className="definition-title"><h2>{word.term}</h2><Sound text={word.term}/></div><p className="definition">{word.definition}</p>{word.exampleSentence&&<blockquote>{word.exampleSentence}</blockquote>}<div className="word-meta"><span className={`phase state-${word.card.state}`}>{phaseLabel(word)}</span><span>{word.card.state===0?'Ready to learn':`Next: ${new Date(word.card.due).toLocaleString([], { month:'short',day:'numeric',hour:'numeric',minute:'2-digit' })}`}</span></div><div className="detail-actions"><button className="text-button" onClick={()=>setEditing(true)}>Edit word</button><button className="text-button danger" onClick={()=>setDeleting(!deleting)}>Delete</button></div>{deleting&&<div className="delete-confirm"><p>Delete “{word.term}” and its review history?</p><div className="button-row"><button className="danger-button" disabled={saving} onClick={async()=>{if(await commit(d=>({...d,words:d.words.filter(w=>w.id!==word.id)})))close();}}>Delete word</button><button className="secondary" onClick={()=>setDeleting(false)}>Keep it</button></div></div>}<hr/><form className="form-stack" onSubmit={practice}><h3>Put it into your own words.</h3><p className="muted">Write a sentence. AI can help you make it sound natural.</p><label className="sr-only" htmlFor="practice-sentence">Your sentence</label><textarea id="practice-sentence" value={sentence} onChange={e=>setSentence(e.target.value)} maxLength={2000} required placeholder={`Try a sentence with “${word.term}”…`}/><button className="secondary" disabled={busy||!sentence.trim()}>{busy?<span className="spinner"/>:<Icon name="spark" size={17}/>}Check my sentence</button></form>{feedback&&<div className="feedback" role="status"><p>{feedback.feedback}</p>{feedback.suggestion&&<blockquote>{feedback.suggestion}</blockquote>}<small>This optional practice does not count toward acquisition. Complete sentence tests in your scheduled reviews to advance.</small></div>}</>}{error&&<p className="error" role="alert">{error}</p>}</div></dialog>;
}
function ConnectionSetup({ connection, refreshConnection }) {
  const [baseURL,setBaseURL]=useState(connection.baseURL || 'https://api.openai.com/v1');
  const [model,setModel]=useState(connection.model || 'gpt-4o-mini');
  const [key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(null);
  async function save(e) {
    e.preventDefault();if(busy)return;setBusy(true);setMessage(null);
    try { await api('config',{baseURL,model,apiKey:key});setKey('');await refreshConnection();setMessage({ok:true,text:'Connected! Your settings are saved and AI is ready.'}); }
    catch(error){setMessage({ok:false,text:error.message});}
    finally{setBusy(false);}
  }
  return <form className="form-stack" onSubmit={save}>
    <label>API address<input type="url" value={baseURL} onChange={e=>{setBaseURL(e.target.value);setMessage(null);}} required autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://api.openai.com/v1" disabled={busy}/></label>
    <p className="micro left">Use the base address from your OpenAI-compatible provider. For OpenAI, keep https://api.openai.com/v1.</p>
    <label>API key<input type="password" value={key} onChange={e=>{setKey(e.target.value);setMessage(null);}} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={connection.configured?'Saved key · leave blank to keep it':'Paste your API key here'} disabled={busy}/></label>
    <label>Model<input value={model} onChange={e=>{setModel(e.target.value);setMessage(null);}} required autoCapitalize="none" spellCheck={false} placeholder="gpt-4o-mini" disabled={busy}/></label>
    <p className="micro left">Saved privately on this laptop, outside browser storage. Testing sends a small request to the API address above and may use a small amount of API credit.</p>
    <button className="primary" disabled={busy||!baseURL.trim()||!model.trim()||(!key.trim()&&!connection.configured)}>{busy?'Testing connection…':'Save and test connection'}<Icon name="arrow" size={17}/></button>
    {message&&<p role={message.ok?'status':'alert'} className={message.ok?'feedback':'error'}>{message.text}</p>}
  </form>;
}
function PersonalConnectionSetup({ connection, refreshConnection }) {
  const [baseURL,setBaseURL] = useState(connection.baseURL || 'https://api.openai.com/v1');
  const [model,setModel] = useState(connection.model || 'gpt-4o-mini');
  const [key,setKey] = useState(''), [busy,setBusy] = useState(false), [message,setMessage] = useState(null);
  async function connect(e) {
    e.preventDefault(); if(busy)return; setBusy(true); setMessage(null);
    try {
      await connectPersonalAI({apiKey:key,baseURL,model});
      setKey(''); await refreshConnection();
      setMessage({ok:true,text:'Connected! You can now look up words and get sentence feedback.'});
    } catch(error) { setMessage({ok:false,text:error.message}); }
    finally { setBusy(false); }
  }
  return <form className="form-stack" onSubmit={connect}>
    <p className="connection-explainer">Use your own API key on this device. No Vercel setup or app password is needed.</p>
    <label>API address<input type="url" value={baseURL} onChange={e=>setBaseURL(e.target.value)} required autoCapitalize="none" spellCheck={false} disabled={busy}/></label>
    <p className="micro left">For OpenAI, use https://api.openai.com/v1. Other providers must first be enabled by the site owner.</p>
    <label>API key<input type="password" value={key} onChange={e=>setKey(e.target.value)} required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={connection.personalConnected?'Enter a key to replace this connection':'Paste your API key here'} disabled={busy}/></label>
    <label>Model<input value={model} onChange={e=>setModel(e.target.value)} required autoCapitalize="none" spellCheck={false} placeholder="gpt-4o-mini" disabled={busy}/></label>
    <p className="micro left">Your connection is remembered in this browser on this device until you replace it or disconnect below. Clearing website data or using private browsing can remove it. Each AI request passes it securely through Lexica to the provider above; it is not saved on the server, shared with other visitors, or included in backups. Testing uses a small amount of API credit.</p>
    <button className="primary" disabled={busy||!key.trim()||!baseURL.trim()||!model.trim()}>{busy?'Testing connection…':'Connect and test'}<Icon name="arrow" size={17}/></button>
    {connection.personalConnected&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{try{clearAIConnection();setKey('');setMessage(null);await refreshConnection();}catch(error){setMessage({ok:false,text:error.message});}}}>Disconnect and remove key</button>}
    {message&&<p role={message.ok?'status':'alert'} className={message.ok?'feedback':'error'}>{message.text}</p>}
  </form>;
}
function Settings({ data, commit, saving, addWords, connection, refreshConnection, notice }) {
  const { settings,words }=data;const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[paste,setPaste]=useState(''),[pending,setPending]=useState(null),[replace,setReplace]=useState(false);
  const file=useRef(null);
  const changeSetting=(key,value)=>commit(d=>({...d,settings:{...d.settings,[key]:value}}));
  async function login(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('login',{password});setPassword('');await refreshConnection();notice('AI connected. Your dictionary is ready.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function importFile(e){const selected=e.target.files?.[0];e.target.value='';if(!selected)return;setError('');try{if(selected.size>20*1024*1024)throw new Error('Choose a backup smaller than 20 MB.');setPending(parseBackup(await selected.text()));setReplace(false);}catch(e){setError(e.message);}}
  async function importPasted(e){e.preventDefault();setError('');try{const incoming=paste.trim().split('\n').map((line,index)=>{const [term,definition,...example]=line.split('\t');if(!term?.trim()||!definition?.trim())throw new Error(`Line ${index+1} needs a word and a definition separated by a tab.`);return newWord(term,definition,{exampleSentence:example.join(' ').trim()});});const validated=parseBackup(JSON.stringify(incoming));if(await addWords(validated))setPaste('');}catch(e){setError(e.message);}}
  return <><div className="eyebrow">MAKE YOURSELF AT HOME</div><div className="page-heading"><h1>Your learning, your way.</h1><p>A few small settings for a lasting habit.</p></div>
    <section className="settings-section"><h2><Icon name="leaf"/>Practice preferences</h2><div className="settings-panel"><label className="setting-row"><span><strong>New words per day</strong><small>Due reviews always come first.</small></span><select aria-label="New words per day" value={settings.dailyNew} disabled={saving} onChange={e=>changeSetting('dailyNew',Number(e.target.value))}>{[5,10,15,20].map(v=><option key={v} value={v}>{v} words</option>)}</select></label><label className="setting-row"><span><strong>Recall target</strong><small>Higher targets mean more frequent reviews.</small></span><select aria-label="Recall target" value={settings.retention} disabled={saving} onChange={e=>changeSetting('retention',Number(e.target.value))}><option value={0.85}>85% · Lighter</option><option value={0.9}>90% · Balanced</option><option value={0.95}>95% · Intensive</option></select></label><label className="setting-row"><span><strong>Definition language</strong><small>For future AI lookups.</small></span><select aria-label="Definition language" value={settings.language} disabled={saving} onChange={e=>changeSetting('language',e.target.value)}><option>English</option><option>English + 中文</option></select></label></div><p className="micro left">Powered by FSRS. Multiple choice comes first, then sentence testing. Three consecutive correct choices across three days and an interval of at least 7 days unlock sentence tests. Correct sentence usage marks a word acquired. The recall target guides timing; it is not a guarantee. Memory estimates adapt to your ratings. Changes apply on each word’s next review.</p></section>
    <section className="settings-section"><h2><Icon name="spark"/>AI connection</h2><div className="panel"><div className="connection-heading"><strong>OpenAI</strong><span className={`status-pill ${connection?.authenticated?'connected':''}`}>{connection?.authenticated?'Connected':connection?.configured?'Locked':'Not connected'}</span></div><p className="muted">Definitions, natural examples, and feedback on your sentences.</p>{connection?.localConfigurable?<ConnectionSetup connection={connection} refreshConnection={refreshConnection}/>:connection?.personalConfigurable?<><PersonalConnectionSetup connection={connection} refreshConnection={refreshConnection}/>{!connection.personalConnected&&connection.configured&&<details><summary>Use the site owner’s AI connection</summary>{connection.authenticated?<p className="feedback">The site owner’s AI connection is unlocked.</p>:<form className="form-stack" onSubmit={login}><label>App password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="secondary" disabled={busy||!password}>Unlock AI</button></form>}</details>}</>:connection?.authenticated?<><p className="connection-explainer">Your connection is ready. The API key stays on the server.</p><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api('logout',{});await refreshConnection();}catch(e){setError(e.message);}finally{setBusy(false);}}}>Lock AI on this device</button></>:connection?.configured?<form className="form-stack" onSubmit={login}><label>App password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Your private app password"/></label><button className="primary" disabled={busy||!password}>{busy?'Connecting…':'Unlock AI'}<Icon name="arrow" size={17}/></button></form>:<div className="setup-note"><strong>One-time connection setup</strong><p>The app needs an OpenAI API key and a private app password configured on its server. No API key is stored in this browser. You can add and study words while setup is pending.</p><button className="text-button" onClick={refreshConnection}>Check connection again <Icon name="arrow" size={15}/></button></div>}</div></section>
    <section className="settings-section"><h2><Icon name="book"/>Keep your words safe</h2><div className="panel"><p className="muted">Your {words.length} words and review history are stored on this device. There is no automatic sync. Save a backup to Files or iCloud Drive before changing devices or clearing browser data.</p><div className="button-row"><button className="secondary" onClick={()=>download(`lexica-backup-${localDay()}.json`,JSON.stringify({version:3,exportedAt:new Date().toISOString(),...data},null,2))}><Icon name="download" size={17}/>Back up</button><button className="secondary" onClick={()=>file.current.click()}>Restore backup</button></div><input ref={file} type="file" accept=".json,application/json" onChange={importFile} hidden/>{pending&&<div className="restore-preview"><h3>{pending.length} words found</h3><p>Merge keeps your current words and skips matching terms. Replace removes your current collection and its history. Practice preferences stay unchanged.</p><label className="checkbox-label"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>Replace my current collection</label><div className="button-row"><button className={replace?'danger-button':'primary'} disabled={saving} onClick={async()=>{const saved=replace?await commit(d=>({...d,words:pending})):await addWords(pending);if(saved){setPending(null);notice('Backup restored.');}}}>{replace?'Replace collection':'Merge words'}</button><button className="secondary" onClick={()=>setPending(null)}>Cancel</button></div></div>}<button className="text-button export-csv" onClick={()=>{const cell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';download(`lexica-words-${localDay()}.csv`,'\ufeff'+[['Word','Definition','Example','Next review'],...words.map(w=>[w.term,w.definition,w.exampleSentence,w.card.due])].map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}}>Export word list for Excel <Icon name="arrow" size={15}/></button></div></section>
    <section className="settings-section"><h2><Icon name="plus"/>Import from a spreadsheet</h2><form className="panel form-stack" onSubmit={importPasted}><p className="muted">Copy two or three columns: word, meaning, and optional example. Paste rows without a header.</p><label className="sr-only" htmlFor="paste-import">Tab-separated vocabulary</label><textarea id="paste-import" value={paste} onChange={e=>setPaste(e.target.value)} placeholder={'serendipity\tA happy discovery by chance'} rows={4}/><button className="secondary" disabled={saving||!paste.trim()}>Import words <Icon name="plus" size={17}/></button></form></section>
    {error&&<p className="error" role="alert">{error}</p>}
    <section className="install-card"><div className="logo-mark">L<span>✦</span></div><h3>A little home on your iPhone.</h3><p>Open your hosted Lexica address in Safari.<br/>Tap <strong>Share → Add to Home Screen</strong>.<br/>No App Store approval needed.</p><small>Install and open once while online. Saved vocabulary and practice then work offline. AI needs internet.</small></section><p className="footer-note">LEXICA · A LITTLE, EVERY DAY<br/>Only requested words and practice sentences are sent for AI processing.</p>
  </>;
}
