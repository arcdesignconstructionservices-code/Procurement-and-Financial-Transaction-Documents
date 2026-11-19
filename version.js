/* ============================================================
   ARC+ Procurement VERSION  +  "What's new" modal
   EVERY TIME YOU PUSH AN UPDATE:
     1. add a new entry at the TOP of APP_CHANGELOG
     2. set APP_VERSION to the same version (and package.json "version")
   Entry shape:  { v, date, title, new:[...], improved:[...], fixed:[...] }
   ============================================================ */
const APP_VERSION = '1.1.0';
const APP_CHANGELOG = [
  { v: '1.1.0', date: '2026-11-19', title: 'Liquidation: Date received',
    improved: ['On a Liquidation the date under Submitted By is now called Date received, on screen, in the print and in the Excel file.', 'The profile circle shows the ARC+ logo, and opening the app from the Gateway plays the welcome animation.'] },
  { v: '1.0.0', date: '2026-11-16', title: 'ARC+ Procurement & Finance',
    new: ['Budget Requests, Purchase Orders and Liquidations, auto-numbered and linked.', 'Print to A4 / PDF and Excel export that match the paper forms.', 'Approving a budget request creates the PO and Liquidation drafts for you.', 'Alerts in the bell, optional email, and photo reading of paper forms.'] }
];

const verSeenKey = () => (typeof KEY !== 'undefined' ? KEY : 'arc-procurement-v1') + '-ver-seen';
function verGetSeen() { try { return localStorage.getItem(verSeenKey()) || ''; } catch (e) { return ''; } }
function verSetSeen() { try { localStorage.setItem(verSeenKey(), APP_VERSION); } catch (e) { } verPaintBadge(); }
function verPaintBadge() {
  const b = document.getElementById('verBtn'); if (!b) return;
  const unseen = verGetSeen() !== APP_VERSION;
  b.innerHTML = `<span class="vtag">v${APP_VERSION}</span><span class="vtxt">What&rsquo;s new</span>${unseen ? '<i class="vdot" title="New update"></i>' : ''}`;
  b.title = 'ARC+ Procurement v' + APP_VERSION + ' - see what’s new';
}
const verFmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function verOpen() {
  let d = document.getElementById('verDlg');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'verDlg'; d.className = 'ver';
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-ver-close]')) d.close(); });
  }
  const seen = verGetSeen();
  const sec = (label, cls, list) => list && list.length ? `<div class="vsec ${cls}"><span class="vlab">${label}</span><ul>${list.map(t => `<li>${uiEsc(t)}</li>`).join('')}</ul></div>` : '';
  d.innerHTML = `<div class="v-head"><div><b>What&rsquo;s new in ARC+ Procurement</b><small>You&rsquo;re on <strong>v${APP_VERSION}</strong> &middot; ${APP_CHANGELOG.length} releases</small></div><button type="button" class="v-x" data-ver-close aria-label="Close">&times;</button></div>
    <div class="v-body">${APP_CHANGELOG.map((r, i) => {
      const isNew = seen !== APP_VERSION && (!seen || verCmp(r.v, seen) > 0);
      return `<article class="vrel${i === 0 ? ' latest' : ''}"><div class="vdotline"></div>
        <div class="vmeta"><span class="vnum">v${uiEsc(r.v)}</span>${i === 0 ? '<span class="vbadge cur">Current</span>' : ''}${isNew ? '<span class="vbadge nw">New</span>' : ''}<span class="vdate">${verFmt(r.date)}</span></div>
        <h4>${uiEsc(r.title)}</h4>${sec('New', 'n', r.new)}${sec('Improved', 'i', r.improved)}${sec('Fixed', 'f', r.fixed)}</article>`;
    }).join('')}</div>
    <div class="v-foot"><span class="muted">Version numbers go up with every update we push.</span><span class="spacer"></span><button type="button" class="primary" data-ver-close>Got it</button></div>`;
  d.onclose = verSetSeen;
  d.showModal();
  d.querySelector('.v-body').scrollTop = 0;
}
function verCmp(a, b) {                                   // 1 if a > b
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; }
  return 0;
}
function verInit() {
  const b = document.getElementById('verBtn'); if (!b) return;
  b.onclick = verOpen; verPaintBadge();
  if (verGetSeen() !== APP_VERSION) setTimeout(() => { if (!document.querySelector('dialog[open]')) verOpen(); }, 1400);   // show once per update
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verInit); else verInit();
