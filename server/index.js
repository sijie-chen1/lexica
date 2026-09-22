import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAPI } from './api.js';
import { loadLocalConfig, configureLocalAI, isLocalDesktop } from './local-config.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const localConfig = await loadLocalConfig(root);
const development = process.argv.includes('--dev');
const vite = development ? await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'spa' }) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    if (req.url.startsWith('/api/')) {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16000) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Request is too large.' })); return; } chunks.push(chunk); }
      const protocol = process.env.COOKIE_SECURE === 'true' ? 'https' : 'http';
      const request = new Request(`${protocol}://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, ...(!['GET','HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      const localDesktop = isLocalDesktop(request, req.socket.remoteAddress, process.env.HOST || '127.0.0.1');
      const environment = { ...process.env, ...localConfig, LOCAL_DESKTOP: localDesktop };
      const response = new URL(request.url).pathname === '/api/config'
        ? localDesktop ? await configureLocalAI(request, root, localConfig) : new Response(JSON.stringify({error:'Connection settings can only be changed from the local laptop app.'}), {status:403,headers:{'Content-Type':'application/json'}})
        : await handleAPI(request, environment, req.socket.remoteAddress);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } else if (vite) vite.middlewares(req,res);
    else {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const base = resolve(root,'dist');
      let file = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(base + sep)) { res.writeHead(403); res.end(); return; }
      try { if (!(await stat(file)).isFile()) throw new Error(); }
      catch { if (extname(pathname)) { res.writeHead(404); res.end(); return; } file = resolve(base,'index.html'); }
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    }
  } catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'The server could not complete the request.' })); }
});
server.listen(Number(process.env.PORT) || 4173, process.env.HOST || '127.0.0.1', () => console.log(`Lexica is ready at http://localhost:${Number(process.env.PORT) || 4173}`));
