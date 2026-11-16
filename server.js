/* ARC+ Procurement & Finance — backend. Serves the app and keeps its whole state as one JSONB row (procurement_state).
   Without DATABASE_URL the API answers 503 and the front end uses browser storage. */
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '14mb' }));

/* ---- ARC+ sign-in (via the Gateway). OFF until SSO_SECRET is set. ---- */
require('./sso').ssoGate(app, { toolId: 'procurement', title: 'ARC+ Procurement' });

/* ---- Database ---- */
function makePool() {
  const cs = process.env.DATABASE_URL;
  if (!cs) { console.warn('No DATABASE_URL set — running in browser-storage mode.'); return null; }
  let ssl = false;
  try {
    const host = new URL(cs).hostname;
    if (!/\.railway\.internal$|^localhost$|^127\.0\.0\.1$/.test(host)) ssl = { rejectUnauthorized: false };
  } catch (e) { ssl = { rejectUnauthorized: false }; }
  return new Pool({ connectionString: cs, ssl, max: 5, idleTimeoutMillis: 30000 });
}
const pool = makePool();
let dbReady = false;

async function initDb() {
  if (!pool) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS procurement_state(
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    // Bumped on every save. A save must say which version it was based on, so one device can't
    // silently overwrite changes another device saved in the meantime (see PUT /api/state).
    await pool.query('ALTER TABLE procurement_state ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1');
    dbReady = true;
    console.log('PostgreSQL connected — procurement_state ready.');
  } catch (e) {
    dbReady = false;
    console.error('DB init failed:', e.message);
    setTimeout(initDb, 5000); // retry (DB may still be starting)
  }
}
initDb();

/* ---- API ---- */
app.get('/api/health', (req, res) => res.json({ ok: true, db: dbReady }));

async function readState() {
  const r = await pool.query('SELECT data, version, updated_at FROM procurement_state WHERE id = $1', ['main']);
  return r.rows[0] ? { data: r.rows[0].data, version: Number(r.rows[0].version), updated_at: r.rows[0].updated_at } : { data: null, version: 0 };
}

// GET /api/state[?v=N] — with ?v equal to the current version, answers { unchanged: true } without the data.
app.get('/api/state', async (req, res) => {
  if (!pool || !dbReady) return res.status(503).json({ error: 'no_database' });
  try {
    if (req.query.v !== undefined) {
      const r = await pool.query('SELECT version FROM procurement_state WHERE id = $1', ['main']);
      const v = r.rows[0] ? Number(r.rows[0].version) : 0;
      if (String(v) === String(req.query.v)) return res.json({ unchanged: true, version: v });
    }
    res.json(await readState());
  } catch (e) { res.status(503).json({ error: 'db_error', message: e.message }); }
});

// PUT /api/state  { data, baseVersion } — saves only if the stored version is still baseVersion
// (0 = "the database is empty"). Otherwise answers 409 with the current data so the app can merge.
app.put('/api/state', async (req, res) => {
  if (!pool || !dbReady) return res.status(503).json({ error: 'no_database' });
  const data = req.body && req.body.data;
  const base = req.body && Number(req.body.baseVersion);
  if (!data || typeof data !== 'object' || !Array.isArray(data.brs)) return res.status(400).json({ error: 'bad_payload' });
  if (!Number.isInteger(base) || base < 0) return res.status(409).json(Object.assign({ error: 'version_required' }, await readState().catch(() => ({}))));
  try {
    const json = JSON.stringify(data);
    const r = base === 0
      ? await pool.query(`INSERT INTO procurement_state(id, data, version, updated_at) VALUES($1, $2::jsonb, 1, now())
          ON CONFLICT(id) DO NOTHING RETURNING version, updated_at`, ['main', json])
      : await pool.query(`UPDATE procurement_state SET data = $2::jsonb, version = version + 1, updated_at = now()
          WHERE id = $1 AND version = $3 RETURNING version, updated_at`, ['main', json, base]);
    if (!r.rows.length) return res.status(409).json(Object.assign({ error: 'version_conflict' }, await readState()));
    res.json({ ok: true, version: Number(r.rows[0].version), updated_at: r.rows[0].updated_at });
  } catch (e) { res.status(503).json({ error: 'db_error', message: e.message }); }
});

/* ---- Optional: read a photo of a paper form with Claude (needs ANTHROPIC_API_KEY) ---- */
app.get('/api/features', (req, res) => res.json({ scan: !!process.env.ANTHROPIC_API_KEY, email: !!process.env.SMTP_HOST }));
app.post('/api/scan', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'not_configured' });
  const { image, mime, kind } = req.body || {};
  if (!image || !/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(mime || '')) return res.status(400).json({ error: 'bad_file' });
  const prompt = 'This is a photo or scan of a paper "' + (kind === 'lq' ? 'Liquidation' : kind === 'po' ? 'Purchase Order' : 'Budget Request') + '" from a Philippine construction company. The page may be rotated. Read it and answer with ONLY a JSON object: {"date":"YYYY-MM-DD or empty","number":"document number as printed","project":"","supplier":"payment-to / supplier name or empty","bank":"","accountName":"","accountNumber":"","requestedBy":"","budget":number or null,"items":[{"description":"","qty":number,"price":number}]}. For a Liquidation put each spent row in items with qty 1 and price = the amount, and add "date" per item as YYYY-MM-DD when shown. Numbers have no commas or currency signs. Use empty strings for anything not visible.';
  try {
    const block = mime === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: mime, data: image } } : { type: 'image', source: { type: 'base64', media_type: mime, data: image } };
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.SCAN_MODEL || 'claude-sonnet-5-5', max_tokens: 2000, messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] }) });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'scan_failed', message: (j.error && j.error.message) || 'error' });
    const txt = (j.content || []).map(c => c.text || '').join('');
    const m = txt.match(/\{[\s\S]*\}/);
    res.json({ ok: true, data: JSON.parse(m ? m[0] : '{}') });
  } catch (e) { res.status(502).json({ error: 'scan_failed', message: e.message }); }
});

/* ---- Optional: email a document (needs SMTP_HOST, SMTP_USER, SMTP_PASS; MAIL_FROM optional) ---- */
app.post('/api/email', async (req, res) => {
  if (!process.env.SMTP_HOST) return res.status(501).json({ error: 'not_configured' });
  const { to, subject, html, filename, xlsx } = req.body || {};
  const list = String(to || '').split(/[,;\s]+/).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 10);
  if (!list.length || !subject || !html) return res.status(400).json({ error: 'bad_request' });
  try {
    const t = require('nodemailer').createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, secure: Number(process.env.SMTP_PORT) === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: list.join(', '), subject: String(subject).slice(0, 200), html: String(html),
      attachments: xlsx ? [{ filename: String(filename || 'document.xlsx').replace(/[^\w.\- ]/g, '_'), content: Buffer.from(xlsx, 'base64') }] : [] });
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: 'send_failed', message: e.message }); }
});

/* Real bank logos: any image dropped in the banks/ folder (bdo.png, bpi.png, metrobank.png ...) is used automatically. */
app.get('/api/bank-logos', (req, res) => {
  let files = [];
  try { files = require('fs').readdirSync(path.join(__dirname, 'banks')).filter(f => /\.(png|svg|jpe?g|webp|avif)$/i.test(f)); } catch (e) { }
  res.json(files);
});

/* ---- Static app ---- */
app.get('/vendor/exceljs.min.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/exceljs/dist/exceljs.min.js')));
const BLOCK = /^\/(server\.js|package(-lock)?\.json|node_modules|\.git)/;
app.use((req, res, next) => BLOCK.test(req.path) ? res.status(404).end() : next());
app.use(express.static(__dirname, { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('ARC+ Procurement server listening on port ' + PORT));
