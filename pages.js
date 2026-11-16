/* ============================================================
   ARC+ Procurement — pages: dashboard, document lists + editors,
   suppliers, projects, activity log, settings & backup.
   ============================================================ */
const PAGE = 10;
const LIST = { br: { q: '', st: '', page: 0 }, po: { q: '', st: '', page: 0 }, lq: { q: '', st: '', page: 0 }, sup: { q: '', page: 0 }, prj: { q: '', page: 0 }, act: { page: 0 } };
const FIND_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const subParts = () => location.hash.slice(1).split('/');
const goto = h => { if (location.hash === '#' + h) render(); else location.hash = h; };
const whenTxt = ts => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* ---------- Dashboard ---------- */
function dashboard() {
  const open = S.brs.filter(b => b.status === 'submitted' || b.status === 'approved');
  const openAmt = r2(open.reduce((s, b) => s + brTotal(b), 0));
  const rel = S.pos.filter(p => p.status === 'released'), relAmt = r2(rel.reduce((s, p) => s + poTotal(p), 0));
  const pend = S.lqs.filter(l => l.status === 'draft' && brOf(l.brId) && ['approved', 'liquidated'].includes(brOf(l.brId).status));
  const pendAmt = r2(pend.reduce((s, l) => s + lqBudget(l) - lqSpent(l), 0));
  const waiting = S.brs.filter(b => b.status === 'submitted').length + S.pos.filter(p => p.status === 'submitted').length;
  const recent = S.activity.slice(0, 8).map(e => `<div class="fi"><span class="fd"></span><div>${esc(e.msg)}</div><span class="ft">${whenTxt(e.ts)}</span></div>`).join('');
  const att = procNotifs().slice(0, 6).map(a => `<a class="fi att" href="#${a.go}"><span class="fd" style="background:${a.level === 'bad' ? 'var(--bad)' : 'var(--o3)'}"></span><div style="min-width:0"><b>${esc(a.title)}</b><div class="muted" style="font-size:12px">${esc(a.desc)}</div></div></a>`).join('');
  const byPrj = {}; S.brs.filter(b => ['approved', 'liquidated'].includes(b.status)).forEach(b => { const n = projName(b) || '—'; byPrj[n] = (byPrj[n] || 0) + brTotal(b); });
  const bars = Object.entries(byPrj).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, v]) => ({ label: l, value: v, text: peso(v) }));
  $('#view').innerHTML = `<div class="row dash-head"><div><h1>Dashboard</h1><p class="sub" style="margin-bottom:6px">Budget requests, purchase orders and liquidations at a glance.</p></div><span class="spacer"></span>
    <button class="primary" id="dNewBr">${ic('plus')} New Budget Request</button></div>
  <div class="kpis dash-kpis">
    ${uiKpi('Open budget requests', open.length, peso(openAmt) + ' requested or approved', { hero: true, count: open.length })}
    ${uiKpi('Purchase orders released', rel.length, peso(relAmt) + ' released', { count: rel.length })}
    ${uiKpi('Liquidations pending', pend.length, pend.length ? peso(pendAmt) + ' still to account for' : 'all accounted for', { count: pend.length, tone: pend.length ? 'warn' : '' })}
    ${uiKpi('Waiting on you', waiting, waiting ? 'for approval or release' : 'nothing waiting', { count: waiting, tone: waiting ? 'bad' : '' })}
  </div>
  <div class="dsplit">${uiPanel('Approved budget by project', uiHBars(bars, { empty: 'No approved budget requests yet.' }), ['#budget', 'Budget requests'])}
    ${uiPanel('Needs attention', `<div class="feed">${att || '<div class="empty">✓ Nothing needs attention.</div>'}</div>`)}
    ${uiPanel('Latest activity', `<div class="feed">${recent || '<div class="empty">No activity yet.</div>'}</div>`, ['#activity', 'Activity log'])}</div>`;
  $('#dNewBr').onclick = () => goto('budget/new');
  animateCounts($('#view'));
}

/* ---------- Lists ---------- */
function listPage(kind) {
  const K = KINDS[kind], L = LIST[kind];
  const mk = () => {
    let rows = S[K.arr].slice().sort((a, b) => (b.createdTs || 0) - (a.createdTs || 0));
    const q = lc(L.q);
    if (L.st) rows = rows.filter(d => d.status === L.st);
    if (q) rows = rows.filter(d => lc([d.no, projName(d), d.requestedBy, d.supplierName, (brOf(d.brId) || {}).no].join(' ')).includes(q));
    const tot = rows.length; L.page = Math.min(L.page, Math.max(0, Math.ceil(tot / PAGE) - 1));
    const amt = d => kind === 'br' ? brTotal(d) : kind === 'po' ? poTotal(d) : lqSpent(d);
    const body = uiSlice(rows, L.page, PAGE).map(d => `<tr class="clk" data-id="${d.id}"><td><b>${esc(d.no)}</b></td><td>${esc(fmtDate(d.date))}</td><td>${esc(projName(d))}</td>
      ${kind === 'br' ? `<td>${esc(d.requestedBy)}</td>` : kind === 'po' ? `<td>${esc(d.supplierName || (supplierOf(d.supplierId) || {}).name || '')}</td>` : `<td>${esc((brOf(d.brId) || {}).no || '')}</td>`}
      <td class="n">${peso(amt(d))}</td>${kind === 'lq' ? `<td class="n ${lqDeficit(d) > 0 ? 'neg' : ''}">${peso(lqDeficit(d))}</td>` : ''}<td>${pillHtml(kind, d.status)}</td></tr>`).join('');
    $('#lbody').innerHTML = body || `<tr><td colspan="7" class="empty">${S[K.arr].length ? 'Nothing matches.' : 'No ' + K.plural.toLowerCase() + ' yet.'}</td></tr>`;
    $('#lpager').innerHTML = uiPager({ total: tot, page: L.page, size: PAGE, key: kind });
    $('#lbody').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => goto(K.route + '/' + tr.dataset.id));
  };
  $('#view').innerHTML = `<div class="row"><div><h1>${K.plural}</h1><p class="sub">${kind === 'br' ? 'Ask for money for a project, get it approved.' : kind === 'po' ? 'Order from a supplier against an approved budget request.' : 'Account for what was spent against a budget request.'}</p></div><span class="spacer"></span>
    <button class="primary" id="addDoc">${ic('plus')} New ${K.label}</button></div>
  <div class="card"><div class="row lbar"><div class="srch">${FIND_ICON}<input id="lq" type="search" autocomplete="off" placeholder="Search number, project, ${kind === 'po' ? 'supplier' : 'name'}…" value="${esc(L.q)}"></div>
    <select id="lst"><option value="">All statuses</option>${Object.entries(K.st).map(([k, v]) => `<option value="${k}"${L.st === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
  <div class="tbl-wrap"><table><thead><tr><th>Number</th><th>Date</th><th>Project</th><th>${kind === 'br' ? 'Requested by' : kind === 'po' ? 'Payment to' : 'Budget request'}</th><th class="n">${kind === 'lq' ? 'Spent' : 'Total'}</th>${kind === 'lq' ? '<th class="n">Deficit</th>' : ''}<th>Status</th></tr></thead><tbody id="lbody"></tbody></table></div><div id="lpager"></div></div>`;
  $('#addDoc').onclick = () => goto(K.route + '/new');
  $('#lq').oninput = e => { L.q = e.target.value; L.page = 0; mk(); };
  $('#lst').onchange = e => { L.st = e.target.value; L.page = 0; mk(); };
  uiPagerBind($('#lpager'), (k, p) => { L.page = p; mk(); });
  mk();
}

/* ---------- Editor ---------- */
function docPage(kind) {
  const parts = subParts(), id = parts[1];
  if (!id) return listPage(kind);
  let doc = null, isNew = false;
  if (id === 'new') {
    isNew = true;
    const from = parts[2] ? brOf(parts[2]) : null;
    doc = kind === 'br' ? blankBr() : kind === 'po' ? blankPo(from) : blankLq(from);
    if (kind === 'br' && S.projects.length === 1) { doc.projectId = S.projects[0].id; }
    if (kind === 'br') doc.no = nextBrNo(doc.projectId, doc.date);
  } else doc = byId(S[KINDS[kind].arr], id);
  if (!doc) { toast('That document no longer exists', 'error'); return goto(KINDS[kind].route); }
  editor(kind, doc, isNew);
}
const budgetPage = () => docPage('br'), ordersPage = () => docPage('po'), lqPage = () => docPage('lq');

function editor(kind, orig, isNew) {
  const K = KINDS[kind], W = clone(orig), locked = !isNew && W.status !== 'draft';
  let noEdited = !isNew;
  const dis = locked ? ' disabled' : '';
  const lastUse = {}; S.brs.concat(S.pos, S.lqs).forEach(d => { if (d.projectId) lastUse[d.projectId] = Math.max(lastUse[d.projectId] || 0, d.createdTs || 0); });
  const prjList = S.projects.filter(p => p.active !== false || p.id === W.projectId).sort((a, b) => (lastUse[b.id] || 0) - (lastUse[a.id] || 0));
  const brChoices = S.brs.filter(b => ['approved', 'liquidated'].includes(b.status) || b.id === W.brId);
  const brOpts = `<option value="">${kind === 'lq' ? 'No budget request (enter budget by hand)' : 'Not linked'}</option>` + brChoices.map(b => `<option value="${b.id}"${W.brId === b.id ? ' selected' : ''}>${esc(b.no + ' · ' + projName(b) + ' · ' + peso(brTotal(b)))}</option>`).join('');
  const supUse = {}; S.pos.forEach(p => { if (p.supplierId) supUse[p.supplierId] = Math.max(supUse[p.supplierId] || 0, p.createdTs || 0); });
  const supList = S.suppliers.filter(s => s.active !== false || s.id === W.supplierId).sort((a, b) => (supUse[b.id] || 0) - (supUse[a.id] || 0));
  const people = [...new Set(S.people.filter(p => p.active !== false).map(p => p.name).concat(S.brs.concat(S.pos).map(d => d.requestedBy)).filter(Boolean))];
  const tbl = kind === 'lq'
    ? `<table class="ed"><thead><tr><th style="width:150px">Date</th><th>Description</th><th class="n" style="width:150px">Amount (₱)</th><th style="width:38px"></th></tr></thead><tbody id="eRows"></tbody></table>`
    : `<table class="ed"><thead><tr><th style="width:44px">#</th><th>Description</th><th class="n" style="width:84px">Qty</th><th class="n" style="width:140px">Unit price</th><th class="n" style="width:140px">Total price</th><th style="width:38px"></th></tr></thead><tbody id="eRows"></tbody></table>`;
  const exists = !isNew;
  const act = [];
  if (!locked) act.push(`<button class="primary" id="aSave">Save ${isNew ? 'draft' : 'changes'}</button>`);
  if (exists && W.status === 'draft' && kind === 'br') act.push('<button id="aSubmit">Submit for approval</button>');
  if (exists && W.status === 'draft' && kind === 'po') act.push('<button id="aSubmit">Submit for release</button>');
  if (exists && W.status === 'draft' && kind === 'lq') act.push('<button class="primary" id="aSubmit">Submit liquidation</button>');
  if (exists && kind === 'br' && W.status === 'submitted') act.push('<button class="primary" id="aApprove">Approve</button><button class="danger" id="aReject">Reject</button>');
  if (exists && kind === 'po' && W.status === 'submitted') act.push('<button class="primary" id="aRelease">Release</button>');
  if (exists && kind === 'po' && W.status === 'draft') act.push('<button id="aRelease">Release now</button>');
  if (exists && kind === 'br' && W.status === 'approved') { act.push(`<button id="aMakePo">Create Purchase Order</button>`); if (!lqOfBr(W.id)) act.push('<button id="aMakeLq">Create Liquidation</button>'); }
  if (exists && locked && !(kind === 'br' && W.status === 'liquidated')) act.push('<button id="aReopen">Reopen as draft</button>');
  const links = [];
  if (kind === 'br' && exists) { posOfBr(W.id).forEach(p => links.push(`<a href="#orders/${p.id}">PO ${esc(p.no)}</a>`)); const l = lqOfBr(W.id); if (l) links.push(`<a href="#liquidations/${l.id}">Liquidation ${esc(l.no)}</a>`); }
  if (kind !== 'br' && W.brId && brOf(W.brId)) links.push(`<a href="#budget/${W.brId}">Budget Request ${esc(brOf(W.brId).no)}</a>`);

  $('#view').innerHTML = `<div class="row"><a class="btn sm" href="#${K.route}">← ${K.plural}</a><div><h1 style="margin:0">${isNew ? 'New ' + K.label : esc(K.label + ' ' + W.no)}</h1></div>${isNew ? '' : pillHtml(kind, W.status)}<span class="spacer"></span>
    ${FEAT.scan && !locked ? `<label class="btn" title="Fill this form from a photo of the paper copy">${ic('upload')} Fill from photo<input type="file" id="aScan" accept="image/*,application/pdf" hidden></label>` : ''}
    ${exists ? `<button id="aPrev">Preview / PDF</button><button id="aXlsx">Excel</button>${FEAT.email ? '<button id="aMail">Email</button>' : ''}` : ''}</div>
  ${links.length ? `<p class="sub linkline">Linked: ${links.join(' · ')}</p>` : '<p class="sub"></p>'}
  ${locked ? `<div class="lockbar">This ${K.label.toLowerCase()} is ${esc(K.st[W.status].toLowerCase())} and locked. Use “Reopen as draft” to change it.</div>` : ''}
  <div class="card"><div class="egrid">
    <div class="field"><label>Date</label><input type="date" id="fDate" value="${esc(W.date)}"${dis}></div>
    <div class="field"><label>${kind === 'br' ? 'Budget Request #' : kind === 'po' ? 'PO #' : 'Liquidation #'}</label><input id="fNo" value="${esc(W.no)}"${dis}></div>
    ${kind !== 'br' ? `<div class="field"><label>${kind === 'po' ? 'For budget request' : 'Budget request'}</label><select id="fBr"${dis}>${brOpts}</select></div>` : ''}
    <div class="field"><label>Project</label><div class="combo"><input id="fPrj" autocomplete="off" placeholder="Select or type a project" value="${esc(projName(W))}"${dis}></div></div>
    ${kind === 'po' ? `<div class="field"><label>Payment to (supplier)</label><div class="combo"><input id="fSup" autocomplete="off" placeholder="Select or type a supplier" value="${esc(W.supplierName || (supplierOf(W.supplierId) || {}).name || '')}"${dis}></div></div>
      <div class="field"><label>Account name</label><input id="fAccN" value="${esc(W.accName)}"${dis}></div>
      <div class="field" style="grid-column:1/-1"><label>Bank accounts</label><div id="eAccts"></div></div>` : ''}
    ${kind !== 'lq' ? `<div class="field"><label>Requested by</label><div class="row" style="flex-wrap:nowrap;gap:6px"><div class="combo" style="flex:1;min-width:0"><input id="fReq" autocomplete="off" placeholder="Select or type a name" value="${esc(W.requestedBy)}"${dis}></div>${locked ? '' : '<button type="button" class="sm" id="addPerson" title="Add a person to the list">+ Add</button>'}</div></div>` : `<div class="field"><label>Submitted by</label><input id="fSubBy" value="${esc(W.submittedBy)}"${dis}></div><div class="field"><label>Submitted on</label><input type="date" id="fSubOn" value="${esc(W.submittedDate)}"${dis}></div>`}
    ${kind === 'lq' && !W.brId ? `<div class="field"><label>Budget (₱)</label><input type="number" step="0.01" id="fBudget" value="${esc(W.budget)}"${dis}></div>` : ''}
  </div>
  ${tbl}${locked ? '' : `<div class="row" style="margin-top:8px"><button class="sm" id="addRow">${ic('plus')} Add ${kind === 'lq' ? 'expense' : 'item'}</button></div>`}
  <div class="totals" id="eTot"></div></div>
  <div class="row" style="margin-top:14px">${act.join('')}<span class="spacer"></span>${exists ? '<button class="danger" id="aDel">Delete</button>' : ''}</div>`;

  const q = s => $('#view').querySelector(s);
  const tbody = q('#eRows');
  const totals = () => {
    if (kind === 'lq') { const sp = lqSpent(W), bu = W.brId && brOf(W.brId) ? brTotal(brOf(W.brId)) : num(W.budget), de = r2(sp - bu);
      q('#eTot').innerHTML = `<div><span>Budget</span><b>${peso(bu)}</b></div><div><span>TOTAL spent</span><b>${peso(sp)}</b></div><div class="${de > 0 ? 'neg' : 'okv'}"><span>DEFICIT</span><b>${de > 0 ? '+' : ''}${peso(de)}</b><em>${de > 0 ? 'overspent' : de < 0 ? 'unspent, to return' : 'fully used'}</em></div>`; }
    else q('#eTot').innerHTML = `<div><span>TOTAL</span><b>${peso(itemsTotal(W.items))}</b></div>`;
    tbody.querySelectorAll('[data-lt]').forEach(td => { const it = W.items.find(x => x.id === td.dataset.lt); if (it) td.textContent = fmt(lineTotal(it)); });
  };
  const rowsHtml = () => {
    if (kind === 'lq') return W.rows.map(r => `<tr data-i="${r.id}"><td><input type="date" data-f="date" value="${esc(r.date)}"${dis}></td><td><input data-f="desc" value="${esc(r.desc)}" placeholder="What was paid for"${dis}></td><td><input type="number" step="0.01" data-f="amount" class="n" value="${r.amount === 0 ? '' : esc(r.amount)}"${dis}></td><td>${locked ? '' : '<button class="x" data-del title="Remove">×</button>'}</td></tr>`).join('');
    return W.items.map((it, k) => `<tr data-i="${it.id}"><td class="muted">${k + 1}</td><td><input data-f="desc" value="${esc(it.desc)}" placeholder="Description"${dis}></td><td><input type="number" step="0.01" data-f="qty" class="n" value="${esc(it.qty)}"${dis}></td><td><input type="number" step="0.01" data-f="price" class="n" value="${it.price === 0 ? '' : esc(it.price)}"${dis}></td><td class="n" data-lt="${it.id}">${fmt(lineTotal(it))}</td><td>${locked ? '' : '<button class="x" data-del title="Remove">×</button>'}</td></tr>`).join('');
  };
  const paintRows = () => {
    tbody.innerHTML = rowsHtml(); totals();
    tbody.querySelectorAll('tr').forEach(tr => {
      const list = kind === 'lq' ? W.rows : W.items, it = list.find(x => x.id === tr.dataset.i);
      tr.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => { it[inp.dataset.f] = inp.type === 'number' ? (inp.value === '' ? 0 : parseFloat(inp.value)) : inp.value; totals(); });
      const del = tr.querySelector('[data-del]'); if (del) del.onclick = () => { const arr = kind === 'lq' ? W.rows : W.items; if (arr.length <= 1) { toast('Keep at least one row', 'error'); return; } arr.splice(arr.indexOf(it), 1); paintRows(); };
    });
  };
  paintRows();
  const ab = q('#addRow'); if (ab) ab.onclick = () => { if (kind === 'lq') W.rows.push({ id: uid(), date: W.date, desc: '', amount: 0 }); else W.items.push(newItem()); paintRows(); const ins = tbody.querySelectorAll('[data-f=desc]'); ins[ins.length - 1].focus(); };

  const renum = () => { if (!isNew || noEdited) return; if (kind === 'br') W.no = nextBrNo(W.projectId, W.date); else if (kind === 'po') W.no = nextPoNo(W.projectId, W.date); const n = q('#fNo'); if (n) n.value = W.no; };
  const bind = (sel, fn) => { const e = q(sel); if (e) e.oninput = e.onchange = () => fn(e.value, e); };
  bind('#fDate', v => { W.date = v; renum(); });
  bind('#fNo', v => { W.no = v; noEdited = true; });
  if (kind === 'po') { if (!Array.isArray(W.accounts) || !W.accounts.length) W.accounts = acctsOf(W).length ? clone(acctsOf(W)).map(a => ({ id: uid(), bank: a.bank, accNo: a.accNo })) : [{ id: uid(), bank: '', accNo: '' }]; acctEditor(q('#eAccts'), W.accounts, locked); }
  if (!locked) { if (q('#fSup')) comboBind(q('#fSup'), () => supList.map(s => s.name));
    comboBind(q('#fPrj'), () => prjList.map(p => p.name)); if (q('#fReq')) comboBind(q('#fReq'), () => people); }
  const pj = q('#fPrj');
  if (pj) pj.onchange = () => {
    const name = pj.value.trim();
    if (!name) { W.projectId = ''; delete W.projectName; renum(); return; }
    let p = S.projects.find(x => lc(x.name) === lc(name));
    if (!p) { p = { id: uid(), code: nextProjectCode(), name, active: true }; S.projects.push(p); logAct('Added project ' + name); save(); toast('New project “' + name + '” added (code ' + p.code + ')'); }
    W.projectId = p.id; delete W.projectName; pj.value = p.name; renum();
  };
  bind('#fReq', v => W.requestedBy = v);
  const apb = q('#addPerson'); if (apb) apb.onclick = () => personDialog(null, p => { W.requestedBy = p.name; q('#fReq').value = p.name; people.push(p.name); });
  bind('#fSubBy', v => W.submittedBy = v); bind('#fSubOn', v => W.submittedDate = v);
  bind('#fAccN', v => W.accName = v);
  bind('#fBudget', v => { W.budget = num(v); totals(); });
  const sp = q('#fSup');
  if (sp) sp.onchange = () => {
    const name = sp.value.trim();
    if (!name) { W.supplierId = ''; W.supplierName = ''; return; }
    let s = S.suppliers.find(x => lc(x.name) === lc(name));
    if (!s) { s = { id: uid(), name, accName: name, accounts: [], active: true }; S.suppliers.push(s); logAct('Added supplier ' + name); save(); toast('New supplier “' + name + '” added'); }
    W.supplierId = s.id; W.supplierName = s.name; sp.value = s.name;
    const a = acctsOf(s);
    if (a.length) { W.accName = s.accName || s.name; W.accounts = a.map(x => ({ id: uid(), bank: x.bank, accNo: x.accNo })); } else if (!W.accName) W.accName = s.name;
    q('#fAccN').value = W.accName; acctEditor(q('#eAccts'), W.accounts, false);
  };
  bind('#fBr', v => {
    W.brId = v; const b = brOf(v);
    if (b && !W.projectId) { W.projectId = b.projectId; q('#fPrj').value = projName(W); }
    if (b && kind === 'po' && W.items.length === 1 && !W.items[0].desc && !num(W.items[0].price)) { W.items = clone(b.items).map(i => ({ id: uid(), desc: i.desc, qty: i.qty, price: i.price })); paintRows(); }
    if (b && kind === 'po' && !W.requestedBy) { W.requestedBy = b.requestedBy; q('#fReq').value = W.requestedBy; }
    if (kind === 'po') { if (b) { W.projectId = b.projectId; q('#fPrj').value = projName(W); } renum(); }
    if (kind === 'lq') { if (b) W.budget = brTotal(b); editor(kind, W, isNew); }
  });

  const valid = () => {
    if (!W.date) { toast('Pick a date', 'error'); return false; }
    if (!W.projectId && !W.projectName) { toast('Choose the project first', 'error'); return false; }
    if (!String(W.no || '').trim()) { toast('The number is empty', 'error'); return false; }
    if (S[K.arr].some(d => d.id !== W.id && d.no === W.no)) { toast('Number ' + W.no + ' is already used', 'error'); return false; }
    if (kind === 'lq') W.rows = W.rows.filter(r => r.desc || num(r.amount) || r.date !== W.date || W.rows.length === 1);
    else if (!itemsTotal(W.items)) { toast('Add at least one item with a price', 'error'); return false; }
    return true;
  };
  const persist = () => {
    if (kind === 'po') { const sup = supplierOf(W.supplierId), ac = acctsOf(W); if (sup && !acctsOf(sup).length && ac.length) { sup.accounts = ac.map(a => ({ id: uid(), bank: a.bank, accNo: a.accNo })); sup.accName = W.accName || sup.name; } }
    const cur = byId(S[K.arr], W.id);
    if (cur) Object.assign(cur, W); else { S[K.arr].unshift(W); logAct(`${K.label} ${W.no} created`); }
    save(); return byId(S[K.arr], W.id);
  };
  const run = (fn, msg) => { if (!valid()) return; const d = persist(); fn(d); toast(msg); goto(K.route + '/' + d.id); };
  const sv = q('#aSave'); if (sv) sv.onclick = () => run(d => { if (!isNew) logAct(`${K.label} ${d.no} edited`); }, K.label + ' saved');
  const sb = q('#aSubmit'); if (sb) sb.onclick = () => run(d => kind === 'br' ? submitBr(d) : kind === 'po' ? submitPo(d) : submitLq(d), kind === 'lq' ? 'Liquidation submitted' : 'Submitted');
  const ap = q('#aApprove'); if (ap) ap.onclick = () => { const d = persist(); const made = approveBr(d); toast(made.length ? 'Approved. Drafts created: ' + made.join(', ') : 'Approved'); goto('budget/' + d.id); };
  const rj = q('#aReject'); if (rj) rj.onclick = () => { rejectBr(persist()); toast('Rejected'); goto('budget/' + W.id); };
  const rl = q('#aRelease'); if (rl) rl.onclick = () => run(d => releasePo(d), 'PO released');
  const mp = q('#aMakePo'); if (mp) mp.onclick = () => goto('orders/new/' + W.id);
  const ml = q('#aMakeLq'); if (ml) ml.onclick = () => goto('liquidations/new/' + W.id);
  const ro = q('#aReopen'); if (ro) ro.onclick = () => { reopen(kind, byId(S[K.arr], W.id)); toast('Reopened as draft'); goto(K.route + '/' + W.id); };
  const dl = q('#aDel'); if (dl) dl.onclick = () => confirmDialog({ title: 'Delete ' + K.label.toLowerCase() + '?', message: 'This removes it permanently.', name: W.no, okLabel: 'Delete', onOk: () => { removeDoc(kind, byId(S[K.arr], W.id)); toast('Deleted'); goto(K.route); } });
  const cur = () => byId(S[K.arr], W.id);
  const pv = q('#aPrev'); if (pv) pv.onclick = () => previewDoc(kind, cur());
  const xl = q('#aXlsx'); if (xl) xl.onclick = () => exportXlsx(kind, cur());
  const ml2 = q('#aMail'); if (ml2) ml2.onclick = () => dialog(`<h3>Email ${esc(W.no)}</h3><div class="field"><label>Send to</label><input name="to" required value="${esc(S.settings.notifyEmails || '')}" placeholder="name@example.com, another@example.com"></div><p class="field-note">The form is in the email and the Excel file is attached.</p>`,
    async o => { try { await emailDoc(kind, cur(), o.to); logAct(`Emailed ${K.label} ${W.no} to ${o.to}`); save(); toast('Email sent'); } catch (e) { toast('Could not send the email', 'error'); } });
  const sc = q('#aScan'); if (sc) sc.onchange = async e => {
    const f = e.target.files[0]; if (!f) return; toast('Reading the form…', 'info');
    try { const d = await scanForm(kind, f); applyScan(kind, W, d); editor(kind, W, isNew); toast('Filled from the photo — check every field before saving'); }
    catch (err) { toast(String(err.message).includes('not_configured') ? 'Photo reading is not set up on the server' : 'Could not read that file', 'error'); }
  };
}

/* ---------- Suppliers ---------- */
function suppliersPage() {
  const L = LIST.sup;
  const mk = () => {
    let rows = S.suppliers.slice().sort((a, b) => a.name.localeCompare(b.name)); const q = lc(L.q);
    if (q) rows = rows.filter(s => lc([s.name, s.accName, acctsOf(s).map(a => a.bank + ' ' + a.accNo).join(' ')].join(' ')).includes(q));
    L.page = Math.min(L.page, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
    $('#sbody').innerHTML = uiSlice(rows, L.page, PAGE).map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${acctsOf(s).map(a => `<div class="acl">${bankBadge(a.bank)} ${esc(a.accNo)}</div>`).join('') || '<span class="muted">—</span>'}</td><td>${esc(s.accName || s.name)}</td><td>${s.active === false ? '<span class="pill off">inactive</span>' : '<span class="pill final">active</span>'}</td><td class="n"><button class="sm" data-e="${s.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No suppliers yet.</td></tr>';
    $('#spager').innerHTML = uiPager({ total: rows.length, page: L.page, size: PAGE, key: 'sup' });
    $('#sbody').querySelectorAll('[data-e]').forEach(b => b.onclick = () => edit(byId(S.suppliers, b.dataset.e)));
  };
  const edit = s => { const accts = acctsOf(s || {}).map(a => ({ id: uid(), bank: a.bank, accNo: a.accNo })); if (!accts.length) accts.push({ id: uid(), bank: '', accNo: '' }); setTimeout(() => acctEditor(document.getElementById('sAccts'), accts, false), 0); return edit2(s, accts); };
  const edit2 = (s, accts) => dialog(`<h3>${s ? 'Edit supplier' : 'Add supplier'}</h3>
    <div class="field"><label>Supplier name</label><input name="name" required value="${esc(s ? s.name : '')}"></div>
    <div class="field"><label>Account name</label><input name="accName" value="${esc(s ? (s.accName || s.name) : '')}" placeholder="Name on the bank account"></div>
    <div class="field"><label>Bank accounts</label><div id="sAccts"></div></div>
    <label class="chk"><input type="checkbox" name="active" ${!s || s.active !== false ? 'checked' : ''}> Active</label>`,
    o => { const name = (o.name || '').trim(); if (!name) return toast('Name is required', 'error');
      const v = { name, accName: (o.accName || '').trim() || name, accounts: accts.filter(a => (a.bank || '').trim() || (a.accNo || '').trim()).map(a => ({ id: a.id, bank: a.bank.trim(), accNo: a.accNo.trim() })), active: !!o.active, bank: '', accNo: '' };
      if (s) { Object.assign(s, v); logAct('Edited supplier ' + name); } else { S.suppliers.push(Object.assign({ id: uid() }, v)); logAct('Added supplier ' + name); }
      save(); suppliersPage(); toast(`“${name}” saved`); },
    s ? () => { S.suppliers = S.suppliers.filter(x => x.id !== s.id); logAct('Removed supplier ' + s.name); save(); suppliersPage(); toast('Supplier removed'); } : null);
  $('#view').innerHTML = `<div class="row"><div><h1>Suppliers</h1><p class="sub">Who you pay, with their bank details. Pick one on a purchase order and the details fill in.</p></div><span class="spacer"></span><button class="primary" id="addS">${ic('plus')} Add supplier</button></div>
  <div class="card"><div class="row lbar"><div class="srch">${FIND_ICON}<input id="sq" type="search" placeholder="Search suppliers…" value="${esc(L.q)}"></div></div>
  <div class="tbl-wrap"><table><thead><tr><th>Supplier</th><th>Bank accounts</th><th>Account name</th><th>Status</th><th></th></tr></thead><tbody id="sbody"></tbody></table></div><div id="spager"></div></div>`;
  $('#addS').onclick = () => edit(null);
  $('#sq').oninput = e => { L.q = e.target.value; L.page = 0; mk(); };
  uiPagerBind($('#spager'), (k, p) => { L.page = p; mk(); });
  mk();
}

/* ---------- Projects ---------- */
function projectsPage() {
  const L = LIST.prj;
  const mk = () => {
    let rows = S.projects.slice().sort((a, b) => a.code.localeCompare(b.code)); const q = lc(L.q);
    if (q) rows = rows.filter(p => lc(p.code + ' ' + p.name).includes(q));
    L.page = Math.min(L.page, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
    $('#pbody').innerHTML = uiSlice(rows, L.page, PAGE).map(p => {
      const brs = S.brs.filter(b => b.projectId === p.id && ['approved', 'liquidated'].includes(b.status)), bud = brs.reduce((n, b) => n + brTotal(b), 0);
      return `<tr><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td class="n">${brs.length}</td><td class="n">${peso(bud)}</td><td>${p.active === false ? '<span class="pill off">closed</span>' : '<span class="pill final">active</span>'}</td><td class="n"><button class="sm" data-e="${p.id}">Edit</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No projects yet.</td></tr>';
    $('#ppager').innerHTML = uiPager({ total: rows.length, page: L.page, size: PAGE, key: 'prj' });
    $('#pbody').querySelectorAll('[data-e]').forEach(b => b.onclick = () => edit(byId(S.projects, b.dataset.e)));
  };
  const edit = p => dialog(`<h3>${p ? 'Edit project' : 'Add project'}</h3>
    <div class="field"><label>Project name</label><input name="name" required value="${esc(p ? p.name : '')}"></div>
    <div class="field"><label>Project code</label><input name="code" required value="${esc(p ? p.code : nextProjectCode())}"></div><p class="field-note">The code goes into the numbers, e.g. ARC+2026-<b>057</b>-01 and ARC-2026-<b>057</b>_001.</p>
    <label class="chk"><input type="checkbox" name="active" ${!p || p.active !== false ? 'checked' : ''}> Active</label>`,
    o => { const name = (o.name || '').trim(), code = (o.code || '').trim(); if (!name || !code) return toast('Name and code are required', 'error');
      if (S.projects.some(x => x !== p && x.code === code)) return toast('That code is already used', 'error');
      if (p) { Object.assign(p, { name, code, active: !!o.active }); logAct('Edited project ' + name); } else { S.projects.push({ id: uid(), name, code, active: !!o.active }); logAct('Added project ' + name); }
      save(); projectsPage(); toast(`“${name}” saved`); },
    p && !S.brs.some(b => b.projectId === p.id) ? () => { S.projects = S.projects.filter(x => x.id !== p.id); logAct('Removed project ' + p.name); save(); projectsPage(); toast('Project removed'); } : null);
  $('#view').innerHTML = `<div class="row"><div><h1>Projects</h1><p class="sub">Every budget request, purchase order and liquidation belongs to a project.</p></div><span class="spacer"></span><button class="primary" id="addP">${ic('plus')} Add project</button></div>
  <div class="card"><div class="row lbar"><div class="srch">${FIND_ICON}<input id="pq" type="search" placeholder="Search projects…" value="${esc(L.q)}"></div></div>
  <div class="tbl-wrap"><table><thead><tr><th>Code</th><th>Project</th><th class="n">Approved requests</th><th class="n">Approved budget</th><th>Status</th><th></th></tr></thead><tbody id="pbody"></tbody></table></div><div id="ppager"></div></div>`;
  $('#addP').onclick = () => edit(null);
  $('#pq').oninput = e => { L.q = e.target.value; L.page = 0; mk(); };
  uiPagerBind($('#ppager'), (k, p) => { L.page = p; mk(); });
  mk();
}

/* ---------- Activity log ---------- */
function activityPage() {
  const L = LIST.act;
  const mk = () => {
    L.page = Math.min(L.page, Math.max(0, Math.ceil(S.activity.length / PAGE) - 1));
    $('#abody').innerHTML = uiSlice(S.activity, L.page, PAGE).map(e => `<tr><td style="white-space:nowrap">${whenTxt(e.ts)}</td><td>${esc(e.msg)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">No activity yet.</td></tr>';
    $('#apager').innerHTML = uiPager({ total: S.activity.length, page: L.page, size: PAGE, key: 'act' });
  };
  $('#view').innerHTML = `<h1>Activity Log</h1><p class="sub">Everything created, approved, released and liquidated.</p><div class="card"><div class="tbl-wrap"><table><thead><tr><th style="width:170px">When</th><th>What happened</th></tr></thead><tbody id="abody"></tbody></table></div><div id="apager"></div></div>`;
  uiPagerBind($('#apager'), (k, p) => { L.page = p; mk(); }); mk();
}

/* ---------- Settings & backup ---------- */
function settings() {
  const s = S.settings;
  $('#view').innerHTML = `<h1>Settings & Backup</h1><p class="sub">Data is saved in this browser and, when a database is attached, to PostgreSQL. Export a backup regularly.</p>
  <div class="card"><b>Profile</b><p class="muted">Shown in the top bar.</p>
    <div class="row" style="align-items:center;gap:18px">
      <div class="prof-prev${s.avatar ? ' haspic' : ''}" id="profPrev"${s.avatar ? ` style="background-image:url('${s.avatar}')"` : ''}><svg viewBox="0 0 24 24" class="pph"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></div>
      <div style="flex:1;min-width:220px">
        <div class="field" style="margin-bottom:10px"><label>Display name</label><input id="profName" value="${esc(s.profileName || 'Temporary Profile')}"></div>
        <div class="row"><label class="btn">${ic('upload')} Upload picture<input type="file" id="profPic" accept="image/*" hidden></label>
          <button class="danger" id="profClear"${s.avatar ? '' : ' style="display:none"'}>Remove</button>
          <span class="spacer"></span><button class="primary" id="profSave">Save profile</button></div>
      </div></div></div>
  <div class="card"><b>Approvals & automation</b><p class="muted">What appears on the stamps, and what the app does for you.</p>
    <div class="egrid"><div class="field"><label>Approver name (APPROVED stamp)</label><input id="sApr" value="${esc(s.approverName)}" placeholder="${esc(who() || 'Name')}"></div>
      <div class="field"><label>Approver title</label><input id="sTitle" value="${esc(s.approverTitle)}"></div>
      <div class="field"><label>Releaser name (RELEASED stamp)</label><input id="sRel" value="${esc(s.releaserName)}" placeholder="Same as approver"></div>
      <div class="field"><label>Liquidation due after (days)</label><input type="number" min="1" id="sDays" value="${esc(s.lqDays)}"></div>
      <div class="field"><label>Email notifications to</label><input id="sMail" value="${esc(s.notifyEmails)}" placeholder="name@example.com, another@example.com"></div></div>
    <label class="chk"><input type="checkbox" id="sAuto" ${s.autoDrafts ? 'checked' : ''}> When a budget request is approved, create the Purchase Order and Liquidation drafts automatically</label><br>
    <label class="chk"><input type="checkbox" id="sAutoMail" ${s.autoEmail ? 'checked' : ''}> Email the document automatically when it is approved, released or liquidated <span class="muted" id="mailNote"></span></label>
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="primary" id="sSave">Save settings</button></div></div>
  <div class="card"><div class="row" style="margin-bottom:6px"><b>Database connection</b><span class="spacer"></span><span class="connpill off" id="connPill"><i></i><span id="connTxt">Checking…</span></span></div>
    <p class="muted" id="dbNote">Checking the database connection…</p>
    <div class="row"><button class="primary" id="testConn">${ic('plug')} Test connection</button><button id="pullDb">Reload from database</button></div></div>
  <div class="card"><b>Backup &amp; Restore</b><p class="muted">Move data between computers or keep a safe copy.</p><div class="row">
    <button id="exp">${ic('download')} Export data (.json)</button><label class="btn">${ic('upload')} Restore data<input type="file" id="imp" accept=".json" hidden></label>
    <a class="btn" href="/sso/logout">Sign out</a><span class="spacer"></span><button class="danger" id="reset">Reset all data</button></div></div>`;
  $('#mailNote').textContent = FEAT.email ? '' : '(needs the SMTP settings on the server)';
  $('#sSave').onclick = () => { Object.assign(S.settings, { approverName: $('#sApr').value.trim(), approverTitle: $('#sTitle').value.trim(), releaserName: $('#sRel').value.trim(), lqDays: Math.max(1, num($('#sDays').value) || 14), notifyEmails: $('#sMail').value.trim(), autoDrafts: $('#sAuto').checked, autoEmail: $('#sAutoMail').checked }); save(); renderNotifs(); toast('Settings saved'); };
  $('#exp').onclick = () => download(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), `arc-procurement-backup-${today()}.json`);
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.brs)) throw 0; if (!confirm('Replace all current data with this backup?')) return; S = d; normalize(); logAct('Restored backup'); save(); render(); applyProfile(); toast('Backup restored'); }
    catch (_) { alert('Invalid backup file'); }
  };
  $('#testConn').onclick = () => checkDb(false);
  $('#pullDb').onclick = async () => { await bootRemote(); toast(DATA_MODE === 'cloud' ? 'Reloaded from database' : 'No database to reload from'); };
  checkDb(true);
  let pendPic = s.avatar || '';
  const prev = $('#profPrev'), paintPrev = () => { prev.style.backgroundImage = pendPic ? "url('" + pendPic + "')" : ''; prev.classList.toggle('haspic', !!pendPic); $('#profClear').style.display = pendPic ? '' : 'none'; };
  $('#profPic').onchange = e => { const f = e.target.files[0]; if (!f) return; readAvatar(f, d => { pendPic = d; paintPrev(); }); };
  $('#profClear').onclick = () => { pendPic = ''; paintPrev(); };
  $('#profSave').onclick = () => { S.settings.profileName = $('#profName').value.trim() || 'Temporary Profile'; S.settings.avatar = pendPic || ''; save(); applyProfile(); toast('Profile saved'); };
  $('#reset').onclick = () => { if (prompt('Type RESET to erase all data') === 'RESET') { localStorage.removeItem(KEY); load(); save(); render(); applyProfile(); toast('Data reset'); } };
}

/* ---------- People (names offered under "Requested by") ---------- */
function personDialog(p, done) {
  dialog(`<h3>${p ? 'Edit person' : 'Add person'}</h3>
    <div class="field"><label>Full name</label><input name="name" required value="${esc(p ? p.name : '')}"></div>
    <label class="chk"><input type="checkbox" name="active" ${!p || p.active !== false ? 'checked' : ''}> Active</label>`,
    o => { const name = (o.name || '').trim(); if (!name) return toast('Name is required', 'error');
      if (S.people.some(x => x !== p && lc(x.name) === lc(name))) return toast('That name is already in the list', 'error');
      if (p) { const old = p.name; Object.assign(p, { name, active: !!o.active }); logAct('Edited person ' + old + (old !== name ? ' → ' + name : '')); }
      else { p = { id: uid(), name, active: !!o.active }; S.people.push(p); logAct('Added person ' + name); }
      save(); toast(`“${name}” saved`); if (done) done(p); },
    p && done === peoplePage ? () => { S.people = S.people.filter(x => x.id !== p.id); logAct('Removed person ' + p.name); save(); peoplePage(); toast('Person removed'); } : null);
}
function peoplePage() {
  const list = S.people.slice().sort((a, b) => ((b.active !== false) - (a.active !== false)) || a.name.localeCompare(b.name));
  const rows = list.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${p.active === false ? '<span class="pill off">inactive</span>' : '<span class="pill final">active</span>'}</td><td class="n"><button class="sm" data-e="${p.id}">Edit</button></td></tr>`).join('');
  $('#view').innerHTML = `<div class="row"><div><h1>People</h1><p class="sub">The names offered under “Requested by”. Add anyone who requests budget or orders.</p></div><span class="spacer"></span><button class="primary" id="addP">${ic('plus')} Add person</button></div>
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="empty">No people yet.</td></tr>'}</tbody></table></div></div>`;
  $('#addP').onclick = () => personDialog(null, peoplePage);
  $('#view').querySelectorAll('[data-e]').forEach(b => b.onclick = () => personDialog(byId(S.people, b.dataset.e), peoplePage));
}

/* ---------- dropdown for text boxes (themed replacement for the browser's datalist) ---------- */
function comboBind(inp, getOpts, render) {
  if (!inp) return;
  const wrap = inp.parentElement, box = document.createElement('div');
  box.className = 'combo-list'; wrap.appendChild(box);
  const hide = () => box.classList.remove('open');
  const show = () => {
    const all = getOpts(), v = lc(inp.value), exact = all.some(o => lc(o) === v);
    const list = all.filter(o => exact || !v || lc(o).includes(v));
    box.innerHTML = list.map(o => `<button type="button" class="combo-opt${lc(o) === v ? ' on' : ''}" data-v="${esc(o)}">${render ? render(o) : esc(o)}</button>`).join('');
    box.classList.toggle('open', list.length > 0);
  };
  inp.addEventListener('focus', show); inp.addEventListener('click', show); inp.addEventListener('input', show);
  inp.addEventListener('blur', () => setTimeout(hide, 120));
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  box.addEventListener('mousedown', e => {
    const b = e.target.closest('.combo-opt'); if (!b) return;
    e.preventDefault(); inp.value = b.dataset.v;
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); hide();
  });
}

const bankOptHtml = n => `<span class="bkrow">${bankBadge(n)}<span>${esc(n)}</span></span>`;


/* editable list of bank accounts (bank dropdown + account number); mutates `list` in place */
function acctEditor(box, list, dis) {
  if (!box) return;
  const paint = () => {
    box.innerHTML = list.map(a => '<div class="acrow" data-i="' + a.id + '"><div class="combo"><input data-f="bank" autocomplete="off" placeholder="Select a bank" value="' + esc(a.bank) + '"' + (dis ? ' disabled' : '') + '></div><input data-f="accNo" placeholder="Account number" value="' + esc(a.accNo) + '"' + (dis ? ' disabled' : '') + '>' + (dis ? '' : '<button type="button" class="x" data-del title="Remove">×</button>') + '</div>').join('')
      + (dis ? '' : '<button type="button" class="sm" data-add>' + ic('plus') + ' Add another bank</button>');
    box.querySelectorAll('.acrow').forEach(r => {
      const a = list.find(x => x.id === r.dataset.i);
      r.querySelectorAll('[data-f]').forEach(i => i.addEventListener('input', () => { a[i.dataset.f] = i.value; }));
      if (!dis) comboBind(r.querySelector('[data-f=bank]'), () => BANKS.map(b => b.n), bankOptHtml);
      const del = r.querySelector('[data-del]');
      if (del) del.onclick = () => { if (list.length > 1) list.splice(list.indexOf(a), 1); else { a.bank = ''; a.accNo = ''; } paint(); };
    });
    const ad = box.querySelector('[data-add]');
    if (ad) ad.onclick = () => { list.push({ id: uid(), bank: '', accNo: '' }); paint(); const ins = box.querySelectorAll('.acrow'); ins[ins.length - 1].querySelector('input').focus(); };
  };
  paint();
}
