/* =========================================================
   ARC INVENTORY — app core

   Data is kept in the browser (localStorage) and, when the
   backend has a database, synced to PostgreSQL.

   State  S = { settings, employees (= people who can check
   tools out), inventory, activity }
   The inventory modules (inventory.js, inventory-ui.js)
   call these globals at run time: S, $, uid, esc, num, save,
   logAct, dialog, confirmDialog, download, renderNotifs,
   animateCounts, dashboard, inventory, invhistory.
========================================================= */
const KEY = 'arc-procurement-v1';
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const ICON = {
  download: '<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 13l5-5 5 5M5 3h14"/>',
  plug: '<path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};
const ic = n => `<svg class="bic" viewBox="0 0 24 24">${ICON[n] || ''}</svg>`;
let S; // state

/* ---------- Storage ---------- */
function seed() {
  return { settings: { company: 'ARC', profileName: '', avatar: '', approverTitle: 'Vice President/CFO', approverName: '', releaserName: '', notifyEmails: '', autoEmail: false, autoDrafts: true, lqDays: 14 },
    projects: [], suppliers: [], brs: [], pos: [], lqs: [], activity: [] };
}
function normalize() {
  if (!S || typeof S !== 'object') S = seed();
  const d = seed(); S.settings = Object.assign(d.settings, S.settings || {});
  ['projects', 'suppliers', 'brs', 'pos', 'lqs', 'activity'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
}
function load() { try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; } normalize(); }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save — export a backup!'); }
  if (DATA_MODE === 'cloud') queueCloudSave();
}
function logAct(msg) { if (!S.activity) S.activity = []; S.activity.unshift({ id: uid(), ts: Date.now(), msg }); if (S.activity.length > 500) S.activity.length = 500; }

/* ---------- Cloud sync (PostgreSQL backend, falls back to local storage) ---------- */
let DATA_MODE = 'local';           // 'local' | 'cloud'
let _syncT = null, _syncing = false, _syncPending = false;
function setSync(state) { // 'cloud' | 'local' | 'saving' | 'saved' | 'error'
  const el = document.getElementById('syncDot');
  if (el) { el.dataset.state = state; el.title = { cloud: 'Connected to database', local: 'Local only — not using the database', saving: 'Saving to database…', saved: 'Saved to database', error: 'Database sync error' }[state] || ''; }
  const pm = document.querySelector('#profile .pmeta small');
  if (pm) pm.textContent = (DATA_MODE === 'cloud') ? (state === 'error' ? 'Database · sync error' : state === 'saving' ? 'Database · saving…' : 'Database · synced') : 'Local session';
  const pill = document.getElementById('connPill'), txt = document.getElementById('connTxt');
  if (pill && txt && state !== 'saving') {
    const ok = DATA_MODE === 'cloud' && state !== 'error';
    pill.className = 'connpill ' + (ok ? 'ok' : state === 'error' ? 'bad' : 'off'); txt.textContent = ok ? 'Connected' : state === 'error' ? 'Sync error' : 'Local only';
  }
}
/* Every save carries the database version it was based on (SYNC.ver) plus a copy of the data at that version
   (SYNC.base). If another device saved first, the server answers 409 with its copy and we merge (sync.js) and
   save again, so check-outs, edits and new items from every device are kept. Kept in localStorage so changes
   made while the database was unreachable are merged in on the next start instead of being thrown away. */
const SYNC_KEY = KEY + '-sync';
let SYNC = { ver: 0, base: null };
try { const m = JSON.parse(localStorage.getItem(SYNC_KEY)); if (m && typeof m.ver === 'number') SYNC = m; } catch (e) { }
const clone = o => JSON.parse(JSON.stringify(o));
function setSyncBase(ver, data) {
  SYNC = { ver, base: clone(data) };
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(SYNC)); } catch (e) { }
}
const localDirty = () => !SYNC.base || !syncEq(S, SYNC.base);
/* Take the database copy, keeping this device's unsynced changes on top. Returns true if anything on screen changed. */
function adoptRemote(remote, ver) {
  const before = S;
  const merged = SYNC.base ? syncMerge(SYNC.base, S, remote) : remote;
  setSyncBase(ver, remote);
  S = clone(merged); normalize();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { }
  if (syncEq(before, S)) return false;
  // Open dialogs hold references to the old objects — close them so nothing is saved into a stale copy.
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  render(); applyProfile();
  return true;
}
/* Sign-in expired (server answers 401). Changes stay on this device (localStorage + SYNC base) and are merged
   into the database after signing in again. The page we were on is remembered so the app reopens there. */
const RETURN_KEY = 'arc-return-hash';
let _signingIn = false;
function signInAgain() {
  if (_signingIn) return; _signingIn = true;
  setSync('error'); clearTimeout(_syncT); _syncT = null;
  try { if (location.hash.length > 1) sessionStorage.setItem(RETURN_KEY, location.hash); } catch (e) { }
  toast('Your sign-in has expired. Please sign in again; your changes are kept.', 'error');
  setTimeout(() => { location.href = '/login'; }, 1800);
}
function queueCloudSave() { clearTimeout(_syncT); _syncT = setTimeout(cloudSave, 700); setSync('saving'); }
async function cloudSave() {
  if (_syncing) { _syncPending = true; return; }
  _syncing = true; clearTimeout(_syncT); _syncT = null;
  let retry = false;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const sent = clone(S);
      const res = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: sent, baseVersion: SYNC.ver }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setSyncBase(j.version, sent); setSync('saved'); break; }
      if (res.status === 401) { signInAgain(); break; }    // kept on this device; merged after signing in again
      if (res.status !== 409 || !j.data) throw 0;
      // Someone else saved first: merge their changes with ours, then try again.
      if (adoptRemote(j.data, j.version)) toast('Merged changes from another device');
      if (!localDirty()) { setSync('saved'); break; }
      if (attempt === 4) throw 0;
    }
  } catch (e) { setSync('error'); retry = true; }
  _syncing = false;
  if (_syncPending) { _syncPending = false; queueCloudSave(); }
  else if (retry) _syncT = setTimeout(cloudSave, 15000);   // offline / server hiccup: keep trying
}
/* Pick up changes other devices saved, while this device is idle. */
async function cloudPull() {
  if (DATA_MODE !== 'cloud' || _syncing || _syncT || document.hidden) return;
  if (document.querySelector('dialog[open]')) return;                             // don't yank a form from under the user
  const a = document.activeElement; if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
  try {
    const r = await fetch('/api/state?v=' + SYNC.ver, { cache: 'no-store' });
    if (r.status === 401) return signInAgain();
    if (!r.ok) return;
    const j = await r.json();
    if (j.unchanged || !j.data || _syncing || _syncT) return;
    adoptRemote(j.data, j.version);
    if (localDirty()) queueCloudSave(); else setSync('saved');
  } catch (e) { }
}
setInterval(cloudPull, 20000);
addEventListener('focus', cloudPull);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cloudPull(); });
let ARC_WHO = '';
/* the signed-in person's name (from the Gateway / sign-in) fills the profile until a name is set by hand */
fetch('/access/me', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j && j.name) { ARC_WHO = j.name; if (typeof applyProfile === 'function') applyProfile(); } }).catch(() => { });
function applyProfile() {
  const av = document.querySelector('#profile .avatar'), nm = document.querySelector('#profile .pmeta b');
  if (nm) nm.textContent = (S.settings && S.settings.profileName) || ARC_WHO || 'Temporary Profile';
  if (av) {
    const pic = S.settings && S.settings.avatar;
    if (pic) { av.style.backgroundImage = "url('" + pic + "')"; av.classList.add('haspic'); }
    else { av.style.backgroundImage = ''; av.classList.remove('haspic'); }
  }
}
function readAvatar(file, cb) {
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image(); img.onload = () => {
      const sz = 220, c = document.createElement('canvas'); c.width = c.height = sz; const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, sz, sz); cb(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => toast('Could not read that image'); img.src = rd.result;
  };
  rd.readAsDataURL(file);
}
async function checkDb(auto) {
  const pill = $('#connPill'), txt = $('#connTxt'), note = $('#dbNote'); if (!pill) return;
  pill.className = 'connpill wait'; txt.textContent = 'Checking…';
  let h = null; try { h = await fetch('/api/health', { cache: 'no-store' }).then(r => r.ok ? r.json() : null); } catch (e) { }
  if (h && h.db) {
    DATA_MODE = 'cloud'; pill.className = 'connpill ok'; txt.textContent = 'Connected';
    note.textContent = 'Connected to PostgreSQL — every change is saved to the database and reloads automatically when you refresh or open the app elsewhere.';
    if (!auto) { await bootRemote(); toast('Database connected'); }   // sync both ways — never just overwrite the database
  } else if (h) {
    DATA_MODE = 'local'; pill.className = 'connpill bad'; txt.textContent = 'No database';
    note.textContent = 'The backend is running but no database is attached. In Railway, add a DATABASE_URL variable that references your Postgres service, then redeploy.';
    if (!auto) toast('Backend up — database not attached');
  } else {
    DATA_MODE = 'local'; pill.className = 'connpill off'; txt.textContent = 'Local only';
    note.textContent = 'No backend detected — the app is running from browser storage.';
    if (!auto) toast('Running in local mode');
  }
}
async function bootRemote() {
  let health = null;
  try { const r = await fetch('/api/health', { cache: 'no-store' }); if (r.ok) health = await r.json(); } catch (e) { }
  if (!health || !health.db) { DATA_MODE = 'local'; setSync('local'); return; }
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.status === 401) { DATA_MODE = 'local'; return signInAgain(); }
    if (!r.ok) throw 0;
    const j = await r.json();
    DATA_MODE = 'cloud';
    if (j && j.data && j.data.brs) { // adopt database copy, keeping changes made here since the last sync
      adoptRemote(j.data, j.version || 0);
      if (localDirty()) await cloudSave(); else setSync('saved');
    } else { // database empty — seed it from what we have
      SYNC.ver = 0;
      await cloudSave();
    }
  } catch (e) { DATA_MODE = 'local'; setSync('local'); }
}

/* ---------- Helpers ---------- */
function money(n) { return Math.round(n).toLocaleString('en-US'); }
function animateCounts(scope) {
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (scope || document).querySelectorAll('[data-count]').forEach(el => {
    const to = parseFloat(el.dataset.count) || 0;
    const fmtV = v => Math.round(v).toLocaleString('en-US');
    if (rm) { el.textContent = fmtV(to); return; }
    const dur = 1150, t0 = performance.now(), ease = t => 1 - Math.pow(1 - t, 4);
    (function step(now) { const p = Math.min(1, (now - t0) / dur); el.textContent = fmtV(to * ease(p)); if (p < 1) requestAnimationFrame(step); else el.textContent = fmtV(to); })(performance.now());
  });
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

/* ---------- Router ---------- */
const routes = { dashboard, budget: budgetPage, orders: ordersPage, liquidations: lqPage, suppliers: suppliersPage, projects: projectsPage, activity: activityPage, settings };
function render() {
  const r = (location.hash.slice(1) || 'dashboard').split('/')[0];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.r === r));
  const link = document.querySelector(`#nav a[data-r="${routes[r] ? r : 'dashboard'}"] span`); $('#crumb').textContent = link ? link.textContent : '';
  (routes[r] || dashboard)();
  const m = $('#view'); m.style.animation = 'none'; m.offsetHeight; m.style.animation = '';
  renderNotifs();
}
addEventListener('hashchange', render);

/* ---------- Dialog helpers ---------- */
function dialog(html, onOk, onDelete) {
  const d = $('#dlg'), f = $('#dlgForm');
  f.innerHTML = html + `<div class="row" style="margin-top:6px">${onDelete ? '<button type="button" class="danger" id="dDel">Delete</button>' : ''}<span class="spacer"></span><button type="button" id="dCancel">Cancel</button><button class="primary" value="ok">Save</button></div>`;
  f.onsubmit = ev => { ev.preventDefault(); const o = {}; new FormData(f).forEach((v, k) => o[k] = v); f.querySelectorAll('input[type=checkbox]').forEach(c => o[c.name] = c.checked); d.close(); onOk(o); };
  $('#dCancel').onclick = () => d.close();
  if (onDelete) $('#dDel').onclick = () => { if (confirm('Delete permanently?')) { d.close(); onDelete(); } };
  d.showModal();
}
function confirmDialog({ title, message, name, warn, okLabel = 'Delete', onOk, tone = 'danger', icon }) {
  const d = $('#confirmDlg');
  const P = { del: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>' };
  const ip = P[icon] || P.del;
  d.innerHTML = `<div class="cbody">
    <div class="cicon ${esc(tone)}"><svg viewBox="0 0 24 24">${ip}</svg></div>
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    ${name ? `<p class="cname">${esc(name)}</p>` : ''}
    ${warn ? `<div class="cwarn">${esc(warn)}</div>` : ''}
  </div>
  <div class="cact"><button type="button" id="cNo">Cancel</button><button type="button" class="${tone === 'danger' ? 'danger' : 'primary'}" id="cYes">${esc(okLabel)}</button></div>`;
  d.showModal();
  $('#cNo').onclick = () => d.close();
  $('#cYes').onclick = () => { d.close(); onOk && onOk(); };
}

/* ---------- Notifications ---------- */
function computeNotifs() {
  const rank = { bad: 0, warn: 1, info: 2 }, out = [];
  try { out.push(...procNotifs()); } catch (e) { }
  const acc = window.arcAccess ? window.arcAccess.notifs() : [];   // access requests need an answer: keep them at the top
  return [...acc, ...out.sort((a, b) => rank[a.level] - rank[b.level])];
}
let _lastN = -1;
function renderNotifs() {
  const list = computeNotifs(), n = list.length;
  const badge = $('#bellBadge'); if (!badge) return;
  $('#notifCnt').textContent = n;
  if (n) {
    badge.style.display = ''; badge.textContent = n > 9 ? '9+' : n; $('#bellWrap').classList.add('has');
    if (n > _lastN && _lastN >= 0) { badge.classList.remove('ding'); void badge.offsetWidth; badge.classList.add('ding'); }
  } else { badge.style.display = 'none'; $('#bellWrap').classList.remove('has'); }
  _lastN = n;
  const ic = { bad: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>', warn: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M11 8h1"/>' };
  $('#notifList').innerHTML = n ? list.map(x => `<div class="nitem ${x.level}" data-go="${x.go || ''}"><div class="ic"><svg viewBox="0 0 24 24">${ic[x.level]}</svg></div><div><div class="nt">${esc(x.title)}</div><div class="nd">${esc(x.desc)}</div>${x.access?`<div class="nact"><button type="button" data-aa="approve" data-id="${esc(x.access)}">Approve</button><button type="button" data-aa="deny" data-id="${esc(x.access)}">Deny</button></div>`:''}</div></div>`).join('') : '<div class="nempty">✓ All clear — no alerts right now.</div>';
  $('#notifList').querySelectorAll('[data-aa]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(window.arcAccess)window.arcAccess.decide(b.dataset.id,b.dataset.aa,b)});
  $('#notifList').querySelectorAll('.nitem').forEach(el => el.onclick = () => {
    if (el.querySelector('.nact')) return;
    $('#notif').classList.remove('open');
    if (el.dataset.go) location.hash = el.dataset.go;
  });
}
$('#bellBtn').onclick = e => { e.stopPropagation(); renderNotifs(); $('#notif').classList.toggle('open'); };
$('#notif').onclick = e => e.stopPropagation();
addEventListener('click', () => $('#notif').classList.remove('open'));

/* ---------- Sign out ---------- */
$('#signOut').onclick = () => confirmDialog({
  title: 'Sign out?', message: 'You will be returned to the sign-in screen. Your data stays saved.',
  okLabel: 'Sign out', tone: 'info', icon: 'out',
  onOk: () => { toast('Signed out'); setTimeout(() => { location.href = '/sso/logout'; }, 450); }
});

/* ---------- Refresh ---------- */
$('#refreshBtn').onclick = async () => { const b = $('#refreshBtn'); b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin'); load(); render(); applyProfile(); await bootRemote(); toast('Data refreshed'); };

/* ---------- Sidebar collapse (header burger) ---------- */
function setColl(c) { document.documentElement.classList.toggle('collapsed', c); try { localStorage.setItem(KEY + '-coll', c ? '1' : ''); } catch (e) { } }
try { setColl(localStorage.getItem(KEY + '-coll') === '1'); } catch (e) { }
const isMobileNav = () => matchMedia('(max-width:860px)').matches;
const setNav = o => { document.documentElement.classList.toggle('navopen', o); document.body.style.overflow = o ? 'hidden' : ''; };
$('#burger').onclick = () => isMobileNav() ? setNav(!document.documentElement.classList.contains('navopen')) : setColl(!document.documentElement.classList.contains('collapsed'));
$('#scrim').onclick = () => setNav(false);
$('#nav').addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
addEventListener('hashchange', () => setNav(false));
addEventListener('resize', () => { if (!isMobileNav()) setNav(false); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') setNav(false);
  if (e.key === '[' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !$('#dlg').open) { isMobileNav() ? setNav(!document.documentElement.classList.contains('navopen')) : setColl(!document.documentElement.classList.contains('collapsed')); }
});

/* ---------- Theme & clock ---------- */
function setTheme(t, keep) { document.documentElement.dataset.theme = t; if (keep) try { localStorage.setItem(KEY + '-theme-choice', t); } catch (e) { } }
(function () { let t = 'light'; try { t = localStorage.getItem(KEY + '-theme-choice') || 'light'; } catch (e) { } setTheme(t); })();
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
function tick() { $('#clock').textContent = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
tick(); setInterval(tick, 15000);

/* ---------- Boot ---------- */
/* Back from the sign-in page: reopen the page (or scanned QR item) the user was going to. */
try {
  const h = sessionStorage.getItem(RETURN_KEY);
  if (h) { sessionStorage.removeItem(RETURN_KEY); if (location.hash.length <= 1 && /^#[\w\/%.\-~]+$/.test(h)) history.replaceState(null, '', location.pathname + h); }
} catch (e) { }
load(); render();
applyProfile();
bootRemote();
