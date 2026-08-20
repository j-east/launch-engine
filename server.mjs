/**
 * Launch Engine dev server.
 *  - serves the static prototype (mindmap.html etc.)
 *  - proxies POST /api/claude  ->  Open Shannon sidecar (localhost:4445/claude)
 *  - persists concepts as JSONB in Postgres (localhost:5433, db launch_engine)
 * Same-origin, so no CORS; the SHANNON_SECRET (if any) stays server-side.
 *
 *   node server.mjs           # http://localhost:5566
 */
import { createServer, request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';
import { createHmac, timingSafeEqual } from 'crypto';
import pg from 'pg';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.PORT ?? '5566', 10);
const SIDECAR = process.env.SHANNON_URL ?? 'http://localhost:4445';
const SECRET = process.env.SHANNON_SECRET && process.env.SHANNON_SECRET !== 'not-set'
  ? process.env.SHANNON_SECRET : null;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml',
  '.txt':'text/plain; charset=utf-8', '.xml':'application/xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };

// ---- public marketing/docs pages (GEO layer) ------------------------------
// Each path renders a content fragment (site/pages/<file>.html) into the shared
// shell (site/shell.html) SERVER-SIDE, so the text is in the HTML and crawlable
// with no client JS. An optional site/pages/<file>.jsonld is injected into the
// head (phase 2: schema.org structured data).
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://runway.pathwriter.world';
const PAGE_YEAR = '2026';
const PAGES = {
  '/':             { file:'home',         title:'Launch Engine — an AI launch co-pilot', desc:'Turn your product, goal, timeline, and budget into a prioritized, scheduled launch to-do list of concrete build and market actions.' },
  '/how-it-works': { file:'how-it-works', title:'How Launch Engine works — six stages to launch', desc:'From product and budget to a scheduled 14-day launch plan: intake, investment options, mind map, schedule, check-ins, and final review.' },
  '/methodology':  { file:'methodology',  title:'Methodology — the left-brain / right-brain launch map', desc:'Launch Engine maps launch work onto two hemispheres: the left is the material build, the right is the immaterial market, joined by a balance score.' },
  '/faq':          { file:'faq',          title:'Launch Engine FAQ', desc:'What Launch Engine is, who it is for, how long the plan is, and how it differs from a generic planner.' },
  '/pricing':      { file:'pricing',      title:'Launch Engine pricing & access', desc:'Early-access status and pricing for Launch Engine, the AI launch co-pilot.' },
  '/glossary':     { file:'glossary',     title:'Launch Engine glossary', desc:'Plain definitions of the ideas Launch Engine is built on: launch co-pilot, action-generation, the brain hemispheres, and the balance score.' },
};
const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function renderPage(pathname, meta) {
  const [shell, content] = await Promise.all([
    readFile(join(ROOT, 'site', 'shell.html'), 'utf8'),
    readFile(join(ROOT, 'site', 'pages', `${meta.file}.html`), 'utf8'),
  ]);
  let headExtra = '';
  try { headExtra = await readFile(join(ROOT, 'site', 'pages', `${meta.file}.jsonld`), 'utf8'); } catch { /* optional until phase 2 */ }
  // Function replacements so a literal $ in content/meta is never treated as a
  // replacement pattern ($&, $1, ...).
  return shell
    .replaceAll('{{TITLE}}', () => escHtml(meta.title))
    .replaceAll('{{DESC}}', () => escHtml(meta.desc))
    .replaceAll('{{CANONICAL}}', () => SITE_ORIGIN + (pathname === '/' ? '/' : pathname))
    .replaceAll('{{PATH}}', () => pathname)
    .replaceAll('{{YEAR}}', () => PAGE_YEAR)
    .replace('{{HEAD_EXTRA}}', () => headExtra)
    .replace('{{CONTENT}}', () => content);
}

// Phrase Lab measurement runs go through the RAW OpenRouter API — no CLI wrapper injecting
// a system prompt we can't hold constant (methodology §2). Key lives ONLY in env, never the repo.
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || null;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5';

// Simple shared-password gate. If APP_PASSWORD is unset the app stays OPEN (dev / pre-rollout).
// Cookie holds a token derived from the password, so no server-side session store is needed.
const APP_PASSWORD = process.env.APP_PASSWORD || null;
const AUTH_TOKEN = APP_PASSWORD ? createHmac('sha256', 'launch-engine-gate').update(APP_PASSWORD).digest('hex') : null;
const safeEq = (a, b) => { try { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); } catch { return false; } };
const parseCookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(p => { const i = p.indexOf('='); return i < 0 ? null : [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())]; }).filter(Boolean));
const isAuthed = req => !APP_PASSWORD || safeEq(parseCookies(req).le_auth, AUTH_TOKEN);

const DB_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/launch_engine';
const db = new pg.Pool({ connectionString: DB_URL, max: 4 });

// Self-provision: create the database (via the maintenance db) and table if missing.
async function ensureDb(){
  const u = new URL(DB_URL);
  const dbName = (u.pathname.slice(1) || 'launch_engine').replace(/[^a-zA-Z0-9_]/g,'');
  const adminUrl = new URL(DB_URL); adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
    if (!rows.length) { await admin.query(`CREATE DATABASE ${dbName}`); console.log(`  postgres → created database ${dbName}`); }
  } catch (e) { console.log(`  postgres → ensureDb(create db) skipped: ${e.message}`); }
  finally { try { await admin.end(); } catch {} }
  await db.query(`CREATE TABLE IF NOT EXISTS concepts (
    id text PRIMARY KEY, name text NOT NULL DEFAULT '',
    data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
}

const readBody = req => new Promise((resolve, reject) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => resolve(b)); req.on('error', reject);
});
const sendJSON = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
};

// ---- logging: one line per /api request plus anything non-2xx, so prod logs
// (Coolify → docker logs) show what actually happened. Static 2xx are skipped.
const log = (tag, msg) => console.log(`${new Date().toISOString()} [${tag}] ${msg}`);
const snip = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---- rate limiting (in-memory, per-IP fixed window + global backstop) ----
// No external store: this is a single container, so a Map is enough. Behind
// Coolify/Traefik the real client is the left-most X-Forwarded-For entry.
const clientIp = req => {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'unknown';
};
const buckets = new Map(); // key -> { count, resetAt }
function hit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
  b.count++;
  return { ok: b.count <= max, remaining: Math.max(0, max - b.count), retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}
// Drop expired buckets so the Map can't grow without bound.
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k); }, 60_000).unref();

// Tiers. login = tight (shared password is brute-forceable); llm = expensive
// (burns the Claude subscription / OpenRouter credits); default = generous for
// autosave and concept CRUD. The 'global' checks are a hard ceiling regardless
// of source IP, so a distributed flood still can't run up cost.
const M = 60 * 1000;
const RL = {
  login:   [ { name: 'login', scope: 'ip', max: 10, windowMs: 15 * M }, { name: 'login', scope: 'global', max: 60,  windowMs: 15 * M } ],
  llm:     [ { name: 'llm',   scope: 'ip', max: 30, windowMs: 5 * M },  { name: 'llm',   scope: 'global', max: 120, windowMs: 5 * M } ],
  default: [ { name: 'api',   scope: 'ip', max: 120, windowMs: 1 * M } ],
};
function enforceRate(res, ip, checks) {
  for (const c of checks) {
    const r = hit(c.scope === 'global' ? `g:${c.name}` : `${c.name}:${ip}`, c.max, c.windowMs);
    if (c.scope === 'ip') { res.setHeader('X-RateLimit-Limit', String(c.max)); res.setHeader('X-RateLimit-Remaining', String(r.remaining)); }
    if (!r.ok) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(r.retryAfter) });
      res.end(JSON.stringify({ error: 'rate limit exceeded', scope: c.scope, retryAfter: r.retryAfter }));
      return false;
    }
  }
  return true;
}

function proxyClaude(reqBody, res) {
  const u = new URL(SIDECAR + '/claude');
  const payload = JSON.parse(reqBody);
  const out = JSON.stringify({
    prompt: payload.prompt,
    options: { maxTurns: payload.maxTurns ?? 1, systemPrompt: payload.system, model: payload.model },
  });
  const headers = { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(out) };
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`;
  const t0 = Date.now();
  log('claude', `→ sidecar prompt=${Buffer.byteLength(payload.prompt || '')}b system=${Buffer.byteLength(payload.system || '')}b maxTurns=${payload.maxTurns ?? 1}${payload.model ? ' model=' + payload.model : ''}`);
  const pr = httpRequest(
    { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers },
    pres => { let d=''; pres.on('data', c => d+=c);
      pres.on('end', () => {
        const st = pres.statusCode ?? 502, ms = Date.now() - t0;
        if (st >= 200 && st < 300) {
          log('claude', `← ${st} ${ms}ms ${d.length}b`);
          res.writeHead(st, {'Content-Type':'application/json'}); return res.end(d);
        }
        // Sidecar failure: claude exited non-zero (expired OAuth login, usage limit,
        // bad model…). Log the real reason and return it as 503 JSON, not 502:
        // Cloudflare swaps origin 502/504 for its own HTML error page, and the
        // client then dies on "Unexpected token '<'" with no clue what happened.
        let detail = d; try { const j = JSON.parse(d); detail = j.error || j.result || d; } catch {}
        log('claude', `← ${st} ${ms}ms FAILED: ${snip(detail)}`);
        sendJSON(res, 503, { error: `Co-pilot backend error (${st}): ${snip(detail, 500)}`, sidecarStatus: st });
      }); }
  );
  pr.on('error', e => { log('claude', `sidecar unreachable: ${e.code || e.message}`); sendJSON(res, 503, { error: `Co-pilot backend unreachable: ${e.code || e.message}` }); });
  pr.write(out); pr.end();
}

// Raw OpenRouter proxy — OpenAI-compatible /chat/completions. Returns {result} so the
// client's askRaw() reads it the same way as the Claude sidecar.
function proxyOpenRouter(reqBody, res) {
  if (!OPENROUTER_KEY) return sendJSON(res, 500, { error: 'OPENROUTER_API_KEY not set on the server' });
  const payload = JSON.parse(reqBody);
  const body = JSON.stringify({
    model: payload.model || OPENROUTER_MODEL,
    messages: [
      ...(payload.system ? [{ role:'system', content: payload.system }] : []),
      { role:'user', content: payload.prompt || '' },
    ],
    temperature: payload.temperature ?? 0.9,
    max_tokens: payload.max_tokens ?? 900,
  });
  const headers = {
    'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${OPENROUTER_KEY}`,
    'HTTP-Referer': 'https://runway.pathwriter.world', 'X-Title': 'Launch Engine · Phrase Lab',
  };
  const t0 = Date.now();
  // Upstream 4xx pass through; anything else becomes 503 (Cloudflare hides 502/504 bodies).
  const failStatus = st => (st && st >= 400 && st !== 502 && st !== 504) ? st : 503;
  const pr = httpsRequest(
    { hostname:'openrouter.ai', path:'/api/v1/chat/completions', method:'POST', headers },
    pres => { let d=''; pres.on('data', c => d+=c); pres.on('end', () => {
      const ms = Date.now() - t0;
      try {
        const j = JSON.parse(d);
        const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (txt != null) { log('raw', `← ${pres.statusCode} ${ms}ms model=${j.model || '?'}`); return sendJSON(res, 200, { result: txt, model: j.model }); }
        const err = (j && j.error && j.error.message) || d || 'no content';
        log('raw', `← ${pres.statusCode} ${ms}ms FAILED: ${snip(err)}`);
        return sendJSON(res, failStatus(pres.statusCode), { error: err });
      } catch (e) {
        log('raw', `← ${pres.statusCode} ${ms}ms non-JSON: ${snip(d || e.message)}`);
        return sendJSON(res, failStatus(pres.statusCode), { error: d || e.message });
      }
    }); }
  );
  pr.on('error', e => { log('raw', `openrouter unreachable: ${e.code || e.message}`); sendJSON(res, 503, { error: e.code || e.message }); });
  pr.write(body); pr.end();
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const t0 = Date.now(), ip = clientIp(req);
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/') || res.statusCode >= 400)
      log('req', `${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms ip=${ip}`);
  });

  // ---- rate limiting: all /api routes, tier by cost, before any real work ----
  if (url.pathname.startsWith('/api/')) {
    const tier = url.pathname === '/api/login' ? RL.login
      : (url.pathname === '/api/claude' || url.pathname === '/api/raw') ? RL.llm
      : RL.default;
    if (!enforceRate(res, ip, tier)) return;
  }

  // ---- auth: login sets the cookie; everything else under /api requires it ----
  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const { password } = JSON.parse(await readBody(req));
      if (!APP_PASSWORD) return sendJSON(res, 200, { ok: true }); // gate disabled
      if (!safeEq(password, APP_PASSWORD)) return sendJSON(res, 401, { error: 'wrong password' });
      res.writeHead(200, { 'Content-Type':'application/json',
        'Set-Cookie': `le_auth=${AUTH_TOKEN}; HttpOnly; Path=/; Max-Age=${60*60*24*30}; SameSite=Lax` });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (url.pathname.startsWith('/api/') && !isAuthed(req)) return sendJSON(res, 401, { error: 'auth required' });
  if (req.method === 'GET' && url.pathname === '/api/me') return sendJSON(res, 200, { ok: true, gated: !!APP_PASSWORD });

  // ---- Claude proxy (co-pilot, via Open Shannon sidecar) ----
  if (req.method === 'POST' && url.pathname === '/api/claude') {
    try { proxyClaude(await readBody(req), res); }
    catch (e) { sendJSON(res, 400, { error: e.message }); }
    return;
  }

  // ---- raw OpenRouter proxy (Phrase Lab measurement runs) ----
  if (req.method === 'POST' && url.pathname === '/api/raw') {
    try { proxyOpenRouter(await readBody(req), res); }
    catch (e) { sendJSON(res, 400, { error: e.message }); }
    return;
  }

  // ---- list concepts ----
  if (req.method === 'GET' && url.pathname === '/api/concepts') {
    try {
      const { rows } = await db.query('SELECT id, name, updated_at FROM concepts ORDER BY updated_at DESC');
      return sendJSON(res, 200, rows);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // ---- delete a concept ----
  if (req.method === 'DELETE' && url.pathname === '/api/concept') {
    const id = url.searchParams.get('id');
    try { await db.query('DELETE FROM concepts WHERE id=$1', [id]); return sendJSON(res, 200, { ok: true }); }
    catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // ---- load a concept ----
  if (req.method === 'GET' && url.pathname === '/api/concept') {
    const id = url.searchParams.get('id') || 'default';
    try {
      const { rows } = await db.query('SELECT id, name, data FROM concepts WHERE id=$1', [id]);
      if (!rows.length) return sendJSON(res, 404, { error: 'not found' });
      return sendJSON(res, 200, rows[0]);
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // ---- save (upsert) a concept ----
  if (req.method === 'PUT' && url.pathname === '/api/concept') {
    try {
      const { id, name, data } = JSON.parse(await readBody(req));
      if (!id || data == null) return sendJSON(res, 400, { error: 'id and data required' });
      await db.query(
        `INSERT INTO concepts (id, name, data, updated_at) VALUES ($1,$2,$3, now())
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, data=EXCLUDED.data, updated_at=now()`,
        [id, name ?? '', data]
      );
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 500, { error: e.message }); }
  }

  // ---- public pages (GEO docs), server-rendered from site/shell.html ----
  if (req.method === 'GET') {
    let p = url.pathname;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1); // normalize trailing slash
    if (PAGES[p]) {
      try {
        const html = await renderPage(p, PAGES[p]);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch { res.writeHead(500); return res.end('render error'); }
    }
    // The app itself now lives at /app (API-gated); / is the public landing.
    if (p === '/app') {
      try {
        const data = await readFile(join(ROOT, 'mindmap.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(data);
      } catch { res.writeHead(404); return res.end('not found'); }
    }
  }

  // ---- static (assets, robots.txt, sitemap.xml, llms.txt, /data, images) ----
  const rel = url.pathname;
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, async () => {
  console.log(`Launch Engine → http://localhost:${PORT}`);
  console.log(`  public site  → / ${Object.keys(PAGES).filter(p => p !== '/').join(' ')}  (app moved to /app)`);
  console.log(`  proxying /api/claude → ${SIDECAR}/claude${SECRET ? ' (auth on)' : ''}`);
  console.log(`  proxying /api/raw    → openrouter.ai (${OPENROUTER_KEY ? `key set, model ${OPENROUTER_MODEL}` : 'NO KEY — set OPENROUTER_API_KEY'})`);
  console.log(`  password gate: ${APP_PASSWORD ? 'ON' : 'OFF (set APP_PASSWORD to enable)'}`);
  try { await ensureDb(); console.log('  postgres → ready (db + table ensured)'); }
  catch (e) { console.log(`  postgres → NOT ready: ${e.message}`); }
});
