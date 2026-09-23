import { readAIConnection, saveAIConnection } from './ai-session.js';

export async function connectPersonalAI(settings) {
  const personalAI = Object.fromEntries(['apiKey', 'baseURL', 'model'].map(k => [k, String(settings[k] || '').trim()]));
  if (!personalAI.apiKey) throw new Error('Enter your API key.');
  await api('ai', { kind: 'lookup', term: 'hello', personalAI });
  saveAIConnection(personalAI);
}

export async function api(path, data, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (!navigator.onLine) throw new Error('You’re offline. Your saved words and reviews still work.');
    const personalAI = readAIConnection();
    const requestData = path === 'ai' && data && personalAI && !data.personalAI ? { ...data, personalAI } : data;
    const response = await fetch(`/api/${path}`, {
      method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: requestData === undefined ? undefined : JSON.stringify(requestData), signal: controller.signal,
    });
    const payload = await response.json().catch(() => { throw new Error('The AI server is unavailable. Try again shortly.'); });
    if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
    if (path === 'status' && personalAI && payload.personalConfigurable) return { ...payload, configured: true, authenticated: true, personalConnected: true, baseURL: personalAI.baseURL, model: personalAI.model };
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
