const CONNECTION_KEY = 'lexica-personal-ai';
function validConnection(raw) {
  try {
    const value = JSON.parse(raw);
    return value && ['apiKey', 'baseURL', 'model'].every(k => typeof value[k] === 'string' && value[k].trim())
      ? Object.fromEntries(['apiKey', 'baseURL', 'model'].map(k => [k, value[k]])) : null;
  } catch { return null; }
}
function removeLegacyConnection() {
  try { sessionStorage.removeItem(CONNECTION_KEY); } catch { /* Persistent storage remains authoritative. */ }
}
export function readAIConnection() {
  try {
    const saved = localStorage.getItem(CONNECTION_KEY);
    // An explicit null also prevents another tab's old session from reconnecting.
    if (saved !== null) return validConnection(saved);
    const legacy = validConnection(sessionStorage.getItem(CONNECTION_KEY));
    if (legacy) {
      try { localStorage.setItem(CONNECTION_KEY, JSON.stringify(legacy)); removeLegacyConnection(); }
      catch { /* Keep an existing working session if persistent storage is blocked. */ }
    }
    return legacy;
  } catch { return null; }
}
export function saveAIConnection(value) {
  const connection = validConnection(JSON.stringify(value));
  if (!connection) throw new Error('Enter your API address, key and model.');
  try { localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection)); }
  catch { throw new Error('This browser cannot remember your connection. Allow site storage and try again.'); }
  removeLegacyConnection();
}
export function clearAIConnection() {
  // Save a disconnected marker before removing the legacy session, so stale
  // sessions in other tabs cannot silently restore a key the user removed.
  try { localStorage.setItem(CONNECTION_KEY, 'null'); }
  catch { throw new Error('The connection could not be removed. Allow site storage and try again.'); }
  removeLegacyConnection();
}
