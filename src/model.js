import { normalizeProgress, progressAfterAnswer, answerRating, savedChoices, choiceSource, learningStage, learningLabel } from './learning.js';
import { createEmptyCard, fsrs, State } from 'ts-fsrs';

export const DEFAULT_SETTINGS = { dailyNew: 10, retention: 0.9, language: 'English' };
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const scheduler = (retention = 0.9) => fsrs({ request_retention: retention, maximum_interval: 365, enable_fuzz: false, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] });
const validDate = value => (typeof value === 'string' || value instanceof Date) && Number.isFinite(new Date(value).getTime());
export function newWord(term, definition, extra = {}) {
  return { id: crypto.randomUUID(), term: term.trim(), definition: definition.trim(), exampleSentence: '', createdAt: new Date().toISOString(), studyHistory: [], learning: normalizeProgress(), card: createEmptyCard(), ...extra };
}
export function normalizeWord(input) {
  if (!input || typeof input.term !== 'string' || !input.term.trim() || input.term.length > 200 || typeof input.definition !== 'string' || !input.definition.trim() || input.definition.length > 10000) throw new Error('Every word needs a term and a definition.');
  const result = newWord(input.term, input.definition, {
    id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
    exampleSentence: typeof input.exampleSentence === 'string' ? input.exampleSentence.slice(0, 4000) : '',
    createdAt: validDate(input.createdAt) ? new Date(input.createdAt).toISOString() : new Date().toISOString(),
    learning: normalizeProgress(input.learning),
    studyHistory: Array.isArray(input.studyHistory) ? input.studyHistory.filter(h => h && validDate(h.review) && [1,2,3,4].includes(h.rating)) : [],
  });
  const distractors = savedChoices(input);
  if (distractors) result.choiceCache = { source: choiceSource(input), distractors };
  if (input.card) {
    const c = input.card;
    if (!validDate(c.due) || (c.last_review && !validDate(c.last_review)) || ![0,1,2,3].includes(c.state)) throw new Error(`Invalid review schedule for “${input.term}”.`);
    for (const key of ['stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses']) {
      if (!Number.isFinite(c[key]) || c[key] < 0) throw new Error(`Invalid review schedule for “${input.term}”.`);
    }
    if (c.difficulty > 10 || (c.state !== State.New && (!c.last_review || c.stability <= 0))) throw new Error(`Invalid memory state for “${input.term}”.`);
    result.card = { ...c, due: new Date(c.due), ...(c.last_review ? { last_review: new Date(c.last_review) } : {}) };
  } else if (input.totalReviews > 0) {
    // SM-2 has no measured FSRS stability. Preserve the old due date and use
    // the old interval as a conservative initial estimate, updated on recall.
    const last = validDate(input.lastReviewedAt) ? new Date(input.lastReviewedAt) : new Date();
    const due = validDate(input.nextReviewDate) ? new Date(input.nextReviewDate.length === 10 ? `${input.nextReviewDate}T00:00:00` : input.nextReviewDate) : new Date();
    result.card = { ...createEmptyCard(), state: State.Review, due, last_review: last, stability: Math.max(0.1, Number(input.interval) || 1), difficulty: 5, scheduled_days: Math.max(1, Number(input.interval) || 1), reps: Number(input.totalReviews), lapses: 0 };
    result.migratedFrom = 'SM-2';
  }
  return result;
}
export function parseBackup(text) {
  const data = JSON.parse(text);
  const source = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(source) || source.length > 50000) throw new Error('Choose a Lexica JSON backup with up to 50,000 words.');
  const seen = new Set();
  const ids = new Set();
  return source.map(normalizeWord).filter(w => {
    const key = w.term.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    if (ids.has(w.id)) w.id = crypto.randomUUID();
    ids.add(w.id);
    return true;
  });
}
export function mergeWords(current, incoming) {
  const terms = new Set(current.map(w => w.term.toLocaleLowerCase()));
  const ids = new Set(current.map(w => w.id));
  return [...current, ...incoming.filter(w => {
    const key = w.term.toLocaleLowerCase();
    if (terms.has(key)) return false;
    terms.add(key);
    return true;
  }).map(w => {
    const word = ids.has(w.id) ? { ...w, id: crypto.randomUUID() } : w;
    ids.add(word.id);
    return word;
  })];
}
export function rateWord(word, rating, retention = 0.9, now = new Date()) {
  if (![1,2,3,4].includes(rating)) throw new Error('Choose a recall rating.');
  const { card, log } = scheduler(retention).next(word.card, now, rating);
  return { ...word, card, studyHistory: [...word.studyHistory, JSON.parse(JSON.stringify(log))] };
}
export function previews(word, retention, now = new Date()) {
  const result = scheduler(retention).repeat(word.card, now);
  return [1,2,3,4].map(rating => ({ rating, due: result[rating].card.due, label: intervalLabel(result[rating].card.due, now) }));
}
export function intervalLabel(due, now = new Date()) {
  const minutes = Math.max(1, Math.round((new Date(due) - now) / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}
export function dueWords(words, now = new Date()) {
  return words.filter(w => w.card.state !== State.New && new Date(w.card.due) <= now).sort((a,b) => new Date(a.card.due) - new Date(b.card.due));
}
export function newAllowance(words, dailyNew, now = new Date()) {
  const studied = words.filter(w => w.studyHistory[0] && localDay(new Date(w.studyHistory[0].review)) === localDay(now)).length;
  return Math.max(0, dailyNew - studied);
}
export function studyQueue(words, settings, now = new Date()) {
  return [...dueWords(words, now), ...words.filter(w => w.card.state === State.New).slice(0, newAllowance(words, settings.dailyNew, now))].map(w => w.id);
}
export const phaseLabel = word => learningStage(word) === 'mc' ? (word.card.state === 0 ? 'New · MC' : 'Learning · MC') : learningLabel(word);
export function validateSettings(value = {}) {
  return { dailyNew: [5,10,15,20].includes(value.dailyNew) ? value.dailyNew : 10, retention: [0.85,0.9,0.95].includes(value.retention) ? value.retention : 0.9, language: ['English','English + 中文'].includes(value.language) ? value.language : 'English' };
}

export function reviewAnswer(word, mode, result, retention = 0.9, now = new Date()) {
  const updated = rateWord(word, answerRating(result), retention, now);
  updated.learning = progressAfterAnswer(word, mode, result, localDay(now), updated.card);
  updated.studyHistory[updated.studyHistory.length-1] = { ...updated.studyHistory.at(-1), mode, result };
  return updated;
}
