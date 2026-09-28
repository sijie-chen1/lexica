import FreshExample from './FreshExample.jsx';
import { initialRemaining } from './practice.js';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { learningStage, normalizeProgress, savedChoices, collectionChoices, shuffle, choiceSource, validDistractors } from './learning.js';

export default function ReviewQuestion(props) {
  return props.mode==='flashcard' ? <FlipCard {...props}/> : props.mode==='mc' ? <MultipleChoice {...props}/> : <SentenceTest {...props}/>;
}
function InitialProgress({word}) {
  const remaining=initialRemaining(word);
  return remaining ? <p className="micro">Initial learning · encounter {4-remaining} of 3. Words and exercise types are mixed; all three answers set your first review.</p> : null;
}
function FlipCard({word,saving,saveAnswer,skip,Sound,commit}) {
  const [revealed,setRevealed]=useState(false);
  return <>
    <div className="study-instruction"><span className="eyebrow">RECALL THE MEANING</span><p>Think of the meaning, then turn the card over.</p></div>
    <article className="flashcard"><span className="phase">Flip card</span><h1>{word.term}</h1><Sound text={word.term}/>
      {!revealed?<button className="secondary full reveal-button" onClick={()=>setRevealed(true)}>Reveal meaning</button>:<div className="answer"><p>{word.definition}</p><FreshExample word={word} commit={commit}/></div>}
    </article>
    {revealed&&<div className="button-row"><button className="secondary" disabled={saving} onClick={()=>saveAnswer('flashcard','incorrect')}>Forgot</button><button className="secondary" disabled={saving} onClick={()=>saveAnswer('flashcard','guessed')}>Unsure</button><button className="primary" disabled={saving} onClick={()=>saveAnswer('flashcard','correct')}>Remembered</button></div>}
    <InitialProgress word={word}/><button className="text-button skip-review" disabled={saving} onClick={skip}>Skip for now · keep progress</button>
  </>;
}
function MultipleChoice({word,words,saving,cacheChoices,saveAnswer,skip,Sound,commit}) {
  const [choices,setChoices]=useState(null),[selected,setSelected]=useState(null),[guessed,setGuessed]=useState(false);
  const [error,setError]=useState(''),[retry,setRetry]=useState(0),[source,setSource]=useState('');
  const progress=normalizeProgress(word.learning);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;
    setChoices(null);setSelected(null);setGuessed(false);setError('');
    const show=values=>setChoices(shuffle([{id:'correct',text:word.definition},...values.map((text,i)=>({id:`wrong-${i}`,text}))]));
    (async()=>{
      const cached=savedChoices(word);
      if(cached){show(cached);setSource('Saved choices');return;}
      let distractors;
      try {
        const data=await api('ai',{kind:'choices',term:word.term,definition:word.definition},controller.signal);
        if(!validDistractors(data.distractors,word.definition))throw new Error('The choices were incomplete.');
        distractors=data.distractors;if(alive)setSource('AI-generated choices');
      }catch(e){
        if(!alive)return;
        distractors=collectionChoices(word,words);
        if(!distractors){setError(`${e.message} Multiple choice needs AI-generated answers or at least three other distinct definitions in your collection.`);return;}
        setSource('Choices from your collection · AI unavailable');
      }
      if(!alive)return;
      show(distractors);
      await cacheChoices(word.id,{source:choiceSource(word),distractors});
    })();
    return()=>{alive=false;controller.abort();};
  },[word.id,word.term,word.definition,retry]);
  const answered=selected!==null,correct=selected==='correct';
  return <>
    <div className="study-instruction"><span className="eyebrow">STEP 1 · RECOGNIZE THE MEANING</span><p>Choose the meaning that matches this word.</p></div>
    <article className="flashcard mc-flashcard"><span className="phase">Multiple choice</span><h1>{word.term}</h1><Sound text={word.term}/>
      {!choices&&!error&&<p className="muted" role="status">Preparing four choices…</p>}
      {choices&&<div className="mc-options">{choices.map((choice,i)=><button key={choice.id} className={`mc-option ${answered&&choice.id==='correct'?'correct':''} ${answered&&selected===choice.id&&!correct?'incorrect':''}`} disabled={answered||saving} onClick={()=>setSelected(choice.id)}><span className="option-letter">{'ABCD'[i]}</span><span>{choice.text}</span>{answered&&choice.id==='correct'&&<strong aria-label="Correct answer">✓</strong>}</button>)}</div>}
      {answered&&<div className="answer" role="status"><strong>{correct?'That’s right.':'Let’s strengthen this one.'}</strong>{!correct&&<p>The correct meaning is: {word.definition}</p>}<FreshExample word={word} commit={commit}/></div>}
    </article>
    {error&&<div className="error" role="alert"><p>{error}</p><button className="secondary" onClick={()=>setRetry(v=>v+1)}>Retry choices</button></div>}
    {answered&&<>{correct&&<label className="checkbox-label guessed-answer"><input type="checkbox" checked={guessed} onChange={e=>setGuessed(e.target.checked)}/>I guessed — keep practicing this word</label>}<button className="primary full reveal-button" disabled={saving} onClick={()=>saveAnswer('mc',correct?(guessed?'guessed':'correct'):'incorrect')}>Save answer and continue</button><p className="micro">{initialRemaining(word)?'Your three initial answers determine the first review schedule.':correct&&!guessed?'A correct answer counts toward sentence readiness.':'This word will return sooner for mixed practice.'}</p></>}
    <InitialProgress word={word}/>{!initialRemaining(word)&&<div className="learning-progress"><strong>{Math.min(progress.streak,3)}/3 consecutive correct · {progress.days.length}/3 separate days</strong><p>Sentence testing starts after three consecutive correct answers across three days, once the review interval reaches 7 days. A mistake or a guessed answer resets this progress.</p>{choices&&<small>{source}</small>}</div>}
    <button className="text-button skip-review" disabled={saving} onClick={skip}>Skip for now · keep due</button>
  </>;
}
function SentenceTest({word,saving,saveAnswer,skip,Sound,commit}) {
  const [sentence,setSentence]=useState(''),[feedback,setFeedback]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [correction,setCorrection]=useState(false),[verdict,setVerdict]=useState('');
  const controller=useRef(null),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  async function check(e){
    e.preventDefault();if(busy||feedback)return;setBusy(true);setError('');controller.current=new AbortController();
    try{
      const result=await api('ai',{kind:'sentence-review',term:word.term,definition:word.definition,exampleSentence:word.exampleSentence,sentence:sentence.trim()},controller.current.signal);
      if(!['correct','partial','incorrect'].includes(result.verdict))throw new Error('AI could not assess the sentence. Try again.');
      if(alive.current){setFeedback(result);setVerdict(result.verdict);}
    }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
  }
  return <>
    <div className="study-instruction"><span className="eyebrow">STEP 2 · USE IT IN A SENTENCE</span><p>{learningStage(word)==='acquired'?'Keep your acquired word active.':'You’ve recognized this word across spaced reviews. Now try using it.'}</p></div>
    <article className="flashcard sentence-flashcard"><span className="phase">{learningStage(word)==='acquired'?'Acquired · sentence review':'Sentence test'}</span><h1>{word.term}</h1><Sound text={word.term}/>
      <form className="form-stack sentence-form" onSubmit={check}><label htmlFor="review-sentence">Write an original sentence using this word</label><textarea id="review-sentence" value={sentence} onChange={e=>setSentence(e.target.value)} placeholder={`Use “${word.term}” in a sentence…`} maxLength={2000} required disabled={busy||Boolean(feedback)} rows={4}/>{!feedback&&<button className="primary full" disabled={busy||saving||!sentence.trim()}>{busy?'Checking your sentence…':'Check my sentence'}</button>}</form>
      {feedback&&<div className="answer"><p>{word.definition}</p><FreshExample word={word} commit={commit}/></div>}
    </article>
    {error&&<p className="error" role="alert">{error} Your progress has not changed. Retry or skip for now.</p>}
    {feedback&&<><div className="feedback" role="status"><strong>{({correct:'Correct usage',partial:'Almost — usage needs work',incorrect:'Let’s revisit this word'})[feedback.verdict]}</strong><p>{feedback.feedback}</p>{feedback.suggestion&&<blockquote>{feedback.suggestion}</blockquote>}<small>AI assessments can be mistaken.</small></div><button className="text-button" onClick={()=>setCorrection(!correction)}>{correction?'Keep this assessment':'Disagree? Adjust the assessment'}</button>{correction&&<label className="assessment-label">Your assessment<select value={verdict} onChange={e=>setVerdict(e.target.value)}><option value="correct">Correct usage</option><option value="partial">Partly correct</option><option value="incorrect">Incorrect</option></select></label>}<button className="primary full reveal-button" disabled={saving} onClick={()=>saveAnswer('sentence',verdict)}>Save result and continue</button><p className="study-hint">{verdict==='correct'?'This word is acquired. Future reviews will keep testing it in sentences.':'This word will return to multiple choice to strengthen its meaning.'}</p></>}
    <button className="text-button skip-review" disabled={saving||busy} onClick={skip}>Skip for now · keep due</button>
  </>;
}
