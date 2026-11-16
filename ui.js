/* ============================================================
   SHARED UI HELPERS  (loaded before the main script)
   - toast()      stacked "saved" alerts for every module
   - uiPager()    reusable pagination bar
   - uiChips()    checklist / radio "chips" for modals (pick instead of type)
   ============================================================ */

/* ---------- Toasts ----------
   toast('Saved · Juan — Days')        success (default)
   toast('Could not save', 'error')    or inferred from the wording
   Same message twice in a row just refreshes the existing toast instead of stacking. */
const UI_TOAST_ICON = {
  success: '<path d="M20 6 9 17l-5-5"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'
};
function toast(msg, type) {
  msg = String(msg == null ? '' : msg);
  if (!type) type = /could not|can.?t|failed|error|invalid|not found|not allowed|needs at least/i.test(msg) ? 'error' : /^(running in local|backend up|no database|data refreshed|reloaded)/i.test(msg) ? 'info' : 'success';
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const dup = [...box.children].find(t => t.dataset.msg === msg);
  if (dup) { clearTimeout(dup._h); dup.classList.remove('out'); dup.classList.remove('bump'); void dup.offsetWidth; dup.classList.add('bump'); dup._h = setTimeout(() => uiToastClose(dup), 3200); return; }
  const t = document.createElement('div');
  t.className = 'utoast ' + type; t.dataset.msg = msg;
  t.innerHTML = '<span class="ti"><svg viewBox="0 0 24 24">' + (UI_TOAST_ICON[type] || UI_TOAST_ICON.info) + '</svg></span><span class="tm"></span><button type="button" class="tx" aria-label="Dismiss">×</button><i class="tbar"></i>';
  t.querySelector('.tm').textContent = msg;
  t.querySelector('.tx').onclick = () => uiToastClose(t);
  box.appendChild(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  t._h = setTimeout(() => uiToastClose(t), 3200);
}
function uiToastClose(t) { clearTimeout(t._h); t.classList.add('out'); setTimeout(() => t.remove(), 260); }

/* ---------- Responsive tables ----------
   Marks every table in the page view and copies each column heading onto its cells (data-l),
   so on phones the rows can turn into readable cards (see responsive.css). Runs on every re-render. */
function uiLabelTables(root) {
  root.querySelectorAll('table').forEach(t => {
    if (t.closest('.slip,.scan-sum,dialog')) return;
    const ths = [...t.querySelectorAll('thead th')].map(h => h.textContent.trim());
    if (!ths.length) return;
    t.classList.add('rt');
    t.querySelectorAll('tbody tr, tfoot tr').forEach(tr => [...tr.children].forEach((td, i) => {
      if (td.colSpan > 1) return;
      const l = ths[i] || '';
      if (td.dataset.l !== l) td.dataset.l = l;
    }));
  });
}
function uiInitResponsive() {
  const view = document.getElementById('view'); if (!view) return;
  let q = 0;
  const run = () => { clearTimeout(q); q = setTimeout(() => uiLabelTables(view), 10); };
  new MutationObserver(run).observe(view, { childList: true, subtree: true });
  run();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', uiInitResponsive); else uiInitResponsive();

/* ---------- KPI cards + charts (shared by the dashboard and every module) ---------- */
const uiEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* uiKpi('Label', '₱ 1,000', 'sub text', {hero, tone:'warn'|'bad'|'ok', count, fmt:'int'|'money'}) */
function uiKpi(label, val, sub, o) {
  o = o || {};
  const cnt = o.count !== undefined && o.count !== null ? ` data-count="${o.count}" data-fmt="${o.fmt || 'int'}"` : '';
  return `<div class="card kpi${o.hero ? ' hero' : ''}${o.tone ? ' k-' + o.tone : ''}"><div class="l">${uiEsc(label)}</div><div class="v${o.hero ? ' shine' : ''}"${cnt}>${val}</div><div class="muted">${sub == null ? '' : sub}</div></div>`;
}
/* vertical bars: items [{label, value, top, title}] — last bar is highlighted */
function uiBars(items, o) {
  o = o || {};
  if (!items.length) return `<div class="empty">${o.empty || 'Nothing to chart yet.'}</div>`;
  const mx = Math.max(1, ...items.map(i => i.value));
  return `<div class="bars">${items.map((i, k) => `<div class="bar" title="${uiEsc(i.title || i.label)}"><div class="a">${uiEsc(i.top == null ? i.value : i.top)}</div><div class="b" style="height:${Math.max(3, i.value / mx * 120)}px;animation-delay:${(k * 0.07).toFixed(2)}s"></div><div class="t">${uiEsc(i.label)}</div></div>`).join('')}</div>`;
}
/* horizontal bars: items [{label, value, text}] */
function uiHBars(items, o) {
  o = o || {};
  if (!items.length) return `<div class="empty">${o.empty || 'Nothing to chart yet.'}</div>`;
  const mx = Math.max(1, ...items.map(i => i.value));
  return `<div class="hbs">${items.map((i, k) => `<div class="hb"><div class="hl" title="${uiEsc(i.label)}">${uiEsc(i.label)}</div><div class="hbar"><i style="width:${Math.max(2, i.value / mx * 100)}%;animation-delay:${(k * 0.06).toFixed(2)}s"></i></div><div class="hv">${uiEsc(i.text == null ? i.value : i.text)}</div></div>`).join('')}</div>`;
}
/* donut: segments [{label, value}] */
function uiDonut(segs, o) {
  o = o || {};
  const tot = segs.reduce((n, s) => n + s.value, 0);
  if (!tot) return `<div class="empty">${o.empty || 'Nothing to chart yet.'}</div>`;
  const R = 15.9155; let off = 25;
  const arcs = segs.map((s, i) => { const p = s.value / tot * 100, a = `<circle class="dn dn${i % 6}" r="${R}" cx="21" cy="21" fill="none" stroke-width="6" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${off}"><title>${uiEsc(s.label)}: ${s.value}</title></circle>`; off -= p; return a; }).join('');
  return `<div class="donut"><svg viewBox="0 0 42 42" class="dsvg">${arcs}<text x="21" y="22.5" text-anchor="middle" class="dtot">${uiEsc(o.center == null ? tot : o.center)}</text></svg>
    <div class="dleg">${segs.map((s, i) => `<span><i class="dn dn${i % 6}"></i>${uiEsc(s.label)} <b>${s.value}</b></span>`).join('')}</div></div>`;
}
/* titled card wrapper for a chart or list */
const uiPanel = (title, body, link) => `<div class="card"><div class="row" style="margin-bottom:6px"><b>${title}</b><span class="spacer"></span>${link ? `<a class="btn sm" href="${link[0]}">${link[1]} →</a>` : ''}</div>${body}</div>`;

/* ---------- Pagination ----------
   uiPager({total, page, size, key})  -> html.  Clicks are handled by uiPagerBind(container, (key, page) => ...). */
function uiPager(o) {
  const pages = Math.max(1, Math.ceil(o.total / o.size));
  const p = Math.min(Math.max(0, o.page), pages - 1);
  if (o.total <= o.size) return '';
  const from = p * o.size + 1, to = Math.min(o.total, (p + 1) * o.size);
  const nums = [];
  const add = i => nums.push(i);
  for (let i = 0; i < pages; i++) if (i === 0 || i === pages - 1 || Math.abs(i - p) <= 1) add(i);
  let html = '', last = -1;
  nums.forEach(i => { if (last >= 0 && i - last > 1) html += '<span class="pg-gap">…</span>'; html += `<button type="button" class="sm pg${i === p ? ' on' : ''}" data-pgk="${o.key}" data-pg="${i}">${i + 1}</button>`; last = i; });
  return `<div class="pager"><button type="button" class="sm" data-pgk="${o.key}" data-pg="${p - 1}" ${p === 0 ? 'disabled' : ''}>‹ Prev</button>${html}<button type="button" class="sm" data-pgk="${o.key}" data-pg="${p + 1}" ${p >= pages - 1 ? 'disabled' : ''}>Next ›</button><span class="muted" style="margin-left:auto;font-size:12px">Showing ${from}–${to} of ${o.total}</span></div>`;
}
function uiPagerBind(container, fn) {
  container._pgfn = fn;                       // latest handler wins; the listener itself is added only once
  if (container._pgbound) return;
  container._pgbound = true;
  container.addEventListener('click', e => {
    const b = e.target.closest('[data-pgk]'); if (!b || b.disabled || !container._pgfn) return;
    container._pgfn(b.dataset.pgk, parseInt(b.dataset.pg, 10));
  });
}
const uiSlice = (arr, page, size) => arr.slice(page * size, page * size + size);

/* ---------- Chips (checklists inside modals) ----------
   uiChips({name, type:'checkbox'|'radio', items:[{value,label,sub,checked,disabled}], cls}) */
function uiChips(o) {
  const t = o.type || 'checkbox';
  const esc2 = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div class="chips ${o.cls || ''}">` + o.items.map(i =>
    `<label class="chip"><input type="${t}" name="${o.name}" value="${esc2(i.value)}" ${i.checked ? 'checked' : ''} ${i.disabled ? 'disabled' : ''}><span>${esc2(i.label == null ? i.value : i.label)}${i.sub ? `<em>${esc2(i.sub)}</em>` : ''}</span></label>`).join('') + '</div>';
}
