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
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.PORT ?? '5566', 10);
const SIDECAR = process.env.SHANNON_URL ?? 'http://localhost:4445';
const SECRET = process.env.SHANNON_SECRET && process.env.SHANNON_SECRET !== 'not-set'
  ? process.env.SHANNON_SECRET : null;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml' };

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

function proxyClaude(reqBody, res) {
  const u = new URL(SIDECAR + '/claude');
  const payload = JSON.parse(reqBody);
  const out = JSON.stringify({
    prompt: payload.prompt,
    options: { maxTurns: payload.maxTurns ?? 1, systemPrompt: payload.system, model: payload.model },
  });
  const headers = { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(out) };
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`;
  const pr = httpRequest(
    { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers },
    pres => { let d=''; pres.on('data', c => d+=c);
      pres.on('end', () => { res.writeHead(pres.statusCode ?? 502, {'Content-Type':'application/json'}); res.end(d); }); }
  );
  pr.on('error', e => { res.writeHead(502, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: e.message })); });
  pr.write(out); pr.end();
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  // ---- Claude proxy ----
  if (req.method === 'POST' && url.pathname === '/api/claude') {
    try { proxyClaude(await readBody(req), res); }
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

  // ---- static ----
  const rel = (url.pathname === '/' ? '/mindmap.html' : url.pathname);
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, async () => {
  console.log(`Launch Engine → http://localhost:${PORT}`);
  console.log(`  proxying /api/claude → ${SIDECAR}/claude${SECRET ? ' (auth on)' : ''}`);
  try { await ensureDb(); console.log('  postgres → ready (db + table ensured)'); }
  catch (e) { console.log(`  postgres → NOT ready: ${e.message}`); }
});
