import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir('dist/assets')).map(f => `/assets/${f}`);
const version = createHash('sha256').update(await readFile('dist/index.html')).digest('hex').slice(0,12);
await writeFile('dist/sw.js', `
const CACHE = 'lexica-${version}';
const SHELL = ${JSON.stringify(['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.svg', ...assets])};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
// Updates activate after all old app windows close, avoiding mixed app versions.
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('lexica-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
  else if (SHELL.includes(url.pathname)) event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
`);
console.log('Offline app shell built.');
