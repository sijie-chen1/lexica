import { parseBackup, validateSettings, DEFAULT_SETTINGS } from './model.js';
const KEY = 'lx-state-v6';
let database;
function openDB() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('lexica-db', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('kv')) request.result.createObjectStore('kv'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Lexica tabs and try again.'));
  });
  return database;
}
async function get(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const request = tx.objectStore('kv').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadState() {
  let raw, old, storageAvailable = true;
  try {
    raw = await get(KEY);
    old = raw ? null : await get('lx-words-v5');
  } catch { storageAvailable = false; }
  // Never initialize an empty writable state after a failed database read.
  if (!storageAvailable) throw new Error('Your saved vocabulary could not be opened. Close other Lexica tabs and reload. Your data has not been overwritten.');
  if (!raw) raw = localStorage.getItem(KEY);
  if (raw) {
    const data = JSON.parse(raw);
    return { words: parseBackup(JSON.stringify(data)), settings: validateSettings(data.settings), revision: Number.isInteger(data.revision) ? data.revision : 0 };
  }
  old ??= localStorage.getItem('lx-words-v5');
  return { words: old ? parseBackup(old) : [], settings: DEFAULT_SETTINGS, revision: 0 };
}
let writes = Promise.resolve();
export function saveState(state) {
  const revision = state.revision || 0;
  const saved = { ...state, revision: revision + 1 };
  const raw = JSON.stringify({ version: 3, ...saved });
  const write = async () => {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const request = store.get(KEY);
      request.onsuccess = () => {
        try {
          const existing = request.result ? JSON.parse(request.result) : null;
          if (existing && (existing.revision || 0) !== revision) {
            reject(new Error('Your vocabulary changed in another window. Reload this window before continuing; your latest saved progress is safe.'));
            tx.abort();
            return;
          }
          store.put(raw, KEY);
        } catch { reject(new Error('Your saved data could not be read. It has not been overwritten.')); tx.abort(); }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Save interrupted.'));
    });
    return saved;
  };
  const operation = writes.catch(() => {}).then(write);
  writes = operation;
  return operation;
}
