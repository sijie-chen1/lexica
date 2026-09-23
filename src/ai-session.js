const SESSION_KEY = 'lexica-personal-ai';

export function readAIConnection() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return value && ['apiKey', 'baseURL', 'model'].every(k => typeof value[k] === 'string' && value[k].trim()) ? value : null;
  } catch { return null; }
}

export function saveAIConnection(value) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); }
  catch { throw new Error('This browser cannot remember a connection for this tab. Allow site storage and try again.'); }
}

export function clearAIConnection() {
  sessionStorage.removeItem(SESSION_KEY);
}
