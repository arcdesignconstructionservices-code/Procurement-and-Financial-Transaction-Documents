/* ============================================================
   ARC+ Procurement — data rules: numbering, totals, statuses,
   automation (drafts, releases, liquidation), notifications,
   email and photo-reading helpers.
   Uses the globals of app.js (S, uid, num, r2, today, save, logAct, toast ...) at call time.
   ============================================================ */
const COMPANY = {
  name: 'ARC+ Design and Construction Services',
  address: '7D Malindang St., Quezon City, Philippines, 1114',
  email: 'constructionarcdesign@gmail.com',
  phone: '0945461 8468'
};
const fmt = n => num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const peso = n => (num(n) < 0 ? '-' : '') + '₱' + fmt(Math.abs(num(n)));
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[2]}/${m[3]}/${m[1]}` : (d || ''); };
const lineTotal = i => r2(num(i.qty) * num(i.price));
const itemsTotal = items => r2((items || []).reduce((s, i) => s + lineTotal(i), 0));
const newItem = () => ({ id: uid(), desc: '', qty: 1, price: 0 });

const KINDS = {
  br: { route: 'budget', arr: 'brs', label: 'Budget Request', plural: 'Budget Requests', st: { draft: 'Draft', submitted: 'For approval', approved: 'Approved', rejected: 'Rejected', liquidated: 'Liquidated' } },
  po: { route: 'orders', arr: 'pos', label: 'Purchase Order', plural: 'Purchase Orders', st: { draft: 'Draft', submitted: 'For release', released: 'Released', cancelled: 'Cancelled' } },
  lq: { route: 'liquidations', arr: 'lqs', label: 'Liquidation', plural: 'Liquidations', st: { draft: 'Draft', submitted: 'Submitted' } }
};
const PILL = { draft: 'draft', submitted: 'sub', approved: 'final', released: 'final', liquidated: 'final', rejected: 'bad', cancelled: 'off' };
const pillHtml = (k, s) => `<span class="pill ${PILL[s] || 'off'}">${esc(KINDS[k].st[s] || s)}</span>`;

const byId = (arr, id) => (arr || []).find(x => x.id === id);
const projectOf = id => byId(S.projects, id);
const supplierOf = id => byId(S.suppliers, id);
const brOf = id => byId(S.brs, id);
const projName = d => { const p = projectOf(d.projectId); return p ? p.name : (d.projectName || ''); };
const brTotal = b => itemsTotal(b.items);
const poTotal = p => itemsTotal(p.items);
const lqSpent = l => r2((l.rows || []).reduce((s, r) => s + num(r.amount), 0));
const lqBudget = l => { const b = brOf(l.brId); return b ? brTotal(b) : num(l.budget); };
const lqDeficit = l => r2(lqSpent(l) - lqBudget(l));
const who = () => (S.settings.profileName && S.settings.profileName !== 'Temporary Profile' ? S.settings.profileName : '') || ARC_WHO || '';
const approverName = () => S.settings.approverName || who();
const releaserName = () => S.settings.releaserName || S.settings.approverName || who();
const lqOfBr = id => S.lqs.find(l => l.brId === id);
const posOfBr = id => S.pos.filter(p => p.brId === id && p.status !== 'cancelled');

/* ---------- numbering ---------- */
const yearOf = d => (d || today()).slice(0, 4);
function nextSeq(list, prefix, width) {
  let mx = 0;
  list.forEach(d => { const n = String(d.no || ''); if (n.startsWith(prefix)) { const v = parseInt(n.slice(prefix.length), 10); if (v > mx) mx = v; } });
  return String(mx + 1).padStart(width, '0');
}
function nextProjectCode() {
  const mx = S.projects.reduce((m, p) => Math.max(m, parseInt(p.code, 10) || 0), 0);
  return String(mx + 1).padStart(3, '0');
}
const brPrefix = (pid, date) => { const p = projectOf(pid); return `ARC+${yearOf(date)}-${p ? p.code : '000'}-`; };
const poPrefix = (pid, date) => { const p = projectOf(pid); return `ARC-${yearOf(date)}-${p ? p.code : '000'}_`; };
const nextBrNo = (pid, date) => brPrefix(pid, date) + nextSeq(S.brs, brPrefix(pid, date), 2);
const nextPoNo = (pid, date) => poPrefix(pid, date) + nextSeq(S.pos, poPrefix(pid, date), 3);
const nextLqNo = () => 'LQ#' + (S.lqs.reduce((m, l) => Math.max(m, parseInt(String(l.no || '').replace(/\D/g, ''), 10) || 0), 0) + 1);

/* ---------- creating documents ---------- */
function blankBr() { const d = today(); return { id: uid(), no: '', date: d, projectId: '', requestedBy: who(), items: [newItem()], status: 'draft', createdTs: Date.now() }; }
function blankPo(br) {
  const d = today();
  const po = { id: uid(), no: '', brId: br ? br.id : '', date: d, projectId: br ? br.projectId : '', supplierId: '', supplierName: '', accName: '', accounts: [{ id: uid(), bank: '', accNo: '' }], requestedBy: br ? br.requestedBy : who(), items: br ? br.items.map(i => ({ id: uid(), desc: i.desc, qty: i.qty, price: i.price })) : [newItem()], status: 'draft', createdTs: Date.now() };
  po.no = nextPoNo(po.projectId, d);
  return po;
}
function blankLq(br) {
  const d = today();
  return { id: uid(), no: nextLqNo(), brId: br ? br.id : '', date: d, projectId: br ? br.projectId : '', budget: br ? brTotal(br) : 0, rows: [{ id: uid(), date: d, desc: '', amount: 0 }], submittedBy: who(), submittedDate: d, status: 'draft', createdTs: Date.now() };
}

/* ---------- workflow (the automatic parts live here) ---------- */
function submitBr(b) {
  b.status = 'submitted'; b.submittedTs = Date.now();
  logAct(`Budget Request ${b.no} submitted for approval (${peso(brTotal(b))})`); save();
}
/* Approving a BR stamps it and, when "auto-create drafts" is on, makes a linked PO draft and a Liquidation draft. */
function approveBr(b) {
  b.status = 'approved'; b.approvedBy = approverName(); b.approvedTitle = S.settings.approverTitle; b.approvedAt = today(); b.approvedTs = Date.now();
  logAct(`Budget Request ${b.no} approved by ${b.approvedBy || '—'}`);
  let made = [];
  if (S.settings.autoDrafts && !b.draftsMade) {
    b.draftsMade = true;
    if (!lqOfBr(b.id)) { const l = blankLq(b); l.auto = true; S.lqs.unshift(l); made.push('Liquidation ' + l.no); }
    if (!posOfBr(b.id).length) { const p = blankPo(b); p.auto = true; S.pos.unshift(p); made.push('PO ' + p.no); }
    if (made.length) logAct(`Auto-created drafts for ${b.no}: ${made.join(', ')}`);
  }
  save(); autoEmail('br', b); return made;
}
function rejectBr(b) { b.status = 'rejected'; logAct(`Budget Request ${b.no} rejected`); save(); }
function submitPo(p) { p.status = 'submitted'; logAct(`PO ${p.no} submitted for release (${peso(poTotal(p))})`); save(); }
function releasePo(p) {
  p.status = 'released'; p.releasedBy = releaserName(); p.releasedTitle = S.settings.approverTitle; p.releasedAt = today();
  logAct(`PO ${p.no} released (${peso(poTotal(p))})`); save(); autoEmail('po', p);
}
function submitLq(l) {
  l.status = 'submitted'; l.submittedDate = l.submittedDate || today();
  const b = brOf(l.brId); if (b && b.status === 'approved') b.status = 'liquidated';
  logAct(`Liquidation ${l.no} submitted: spent ${peso(lqSpent(l))}, ${lqDeficit(l) > 0 ? 'overspent ' + peso(lqDeficit(l)) : 'to return ' + peso(-lqDeficit(l))}`);
  save(); autoEmail('lq', l);
}
function reopen(kind, d) {
  d.status = 'draft';
  if (kind === 'lq') { const b = brOf(d.brId); if (b && b.status === 'liquidated') b.status = 'approved'; }
  logAct(`${KINDS[kind].label} ${d.no} reopened as draft`); save();
}
function removeDoc(kind, d) {
  S[KINDS[kind].arr] = S[KINDS[kind].arr].filter(x => x.id !== d.id);
  logAct(`${KINDS[kind].label} ${d.no} deleted`); save();
}

/* ---------- alerts for the bell ---------- */
function procNotifs() {
  const out = [], days = Math.max(1, num(S.settings.lqDays) || 14), now = Date.now();
  S.brs.filter(b => b.status === 'submitted').forEach(b => out.push({ level: 'warn', title: `Budget Request ${b.no} needs approval`, desc: `${projName(b)} · ${peso(brTotal(b))}`, go: 'budget/' + b.id }));
  S.pos.filter(p => p.status === 'submitted').forEach(p => out.push({ level: 'warn', title: `PO ${p.no} is waiting for release`, desc: `${p.supplierName || 'No supplier'} · ${peso(poTotal(p))}`, go: 'orders/' + p.id }));
  S.brs.filter(b => b.status === 'approved').forEach(b => {
    const l = lqOfBr(b.id), age = Math.floor((now - (b.approvedTs || now)) / 864e5);
    if (age >= days && !(l && l.status === 'submitted')) out.push({ level: 'bad', title: `Liquidation overdue: ${b.no}`, desc: `${projName(b)} · approved ${age} days ago, ${peso(brTotal(b))} not liquidated`, go: l ? 'liquidations/' + l.id : 'budget/' + b.id });
  });
  S.lqs.filter(l => l.status === 'draft' && lqDeficit(l) > 0).forEach(l => out.push({ level: 'bad', title: `Liquidation ${l.no} is over budget`, desc: `Spent ${peso(lqSpent(l))} against ${peso(lqBudget(l))}`, go: 'liquidations/' + l.id }));
  return out;
}

/* ---------- email (server needs SMTP_* variables; see README) ---------- */
let FEAT = { scan: false, email: false };
fetch('/api/features', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j) FEAT = j; }).catch(() => { });
function docSubject(kind, d) {
  const extra = kind === 'br' ? `${peso(brTotal(d))} · ${KINDS.br.st[d.status]}` : kind === 'po' ? `${peso(poTotal(d))} · ${KINDS.po.st[d.status]}` : `Total ${peso(lqSpent(d))} · Deficit ${peso(lqDeficit(d))}`;
  return `ARC+ ${KINDS[kind].label} ${d.no} — ${projName(d)} (${extra})`;
}
async function emailDoc(kind, d, to) {
  const buf = await buildXlsx(kind, d);
  let bin = ''; new Uint8Array(buf).forEach(b => bin += String.fromCharCode(b));
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px">${sheetHtml(kind, d, true)}<p style="color:#777;font-size:12px">Sent from ARC+ Procurement. The Excel copy is attached.</p></div>`;
  const r = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, subject: docSubject(kind, d), html, filename: docFileName(kind, d) + '.xlsx', xlsx: btoa(bin) }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
}
function autoEmail(kind, d) {
  const to = (S.settings.notifyEmails || '').trim();
  if (!S.settings.autoEmail || !to || !FEAT.email) return;
  emailDoc(kind, d, to).then(() => { logAct(`Emailed ${KINDS[kind].label} ${d.no} to ${to}`); save(); toast('Emailed to ' + to); }).catch(() => toast('Could not send the email', 'error'));
}
const docFileName = (kind, d) => (KINDS[kind].label.replace(/ /g, '-') + '-' + String(d.no || 'draft')).replace(/[^\w+#.-]+/g, '_');

/* ---------- read a paper form from a photo (server needs ANTHROPIC_API_KEY) ---------- */
function fileToScanPayload(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') { const rd = new FileReader(); rd.onload = () => resolve({ image: String(rd.result).split(',')[1], mime: 'application/pdf' }); rd.onerror = reject; rd.readAsDataURL(file); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve({ image: c.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg' });
    };
    img.onerror = () => reject(new Error('image')); img.src = url;
  });
}
async function scanForm(kind, file) {
  const p = await fileToScanPayload(file);
  const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(p, { kind })) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 501 ? 'not_configured' : (j.message || j.error || 'failed'));
  return j.data || {};
}
const lc = s => String(s || '').trim().toLowerCase();
/* Apply what was read from a photo to the working copy W (never touches the number or status). */
function applyScan(kind, W, d) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) W.date = d.date;
  if (d.project) { const p = S.projects.find(x => lc(x.name) === lc(d.project)) || S.projects.find(x => lc(d.project).includes(lc(x.name)) || lc(x.name).includes(lc(d.project))); if (p) W.projectId = p.id; else W.projectName = d.project; }
  if (kind !== 'lq' && d.requestedBy) W.requestedBy = d.requestedBy;
  if (kind === 'po') {
    if (d.supplier) { const s = S.suppliers.find(x => lc(x.name) === lc(d.supplier) || lc(d.supplier).includes(lc(x.name)) || lc(x.name).includes(lc(d.supplier))); if (s) { W.supplierId = s.id; W.supplierName = s.name; } else { W.supplierId = ''; W.supplierName = d.supplier; } }
    if (d.accountName) W.accName = d.accountName;
    if (d.bank || d.accountNumber) W.accounts = [{ id: uid(), bank: String(d.bank || ''), accNo: String(d.accountNumber || '') }];
  }
  const items = Array.isArray(d.items) ? d.items : [];
  if (kind === 'lq') { if (items.length) W.rows = items.map(i => ({ id: uid(), date: /^\d{4}-/.test(i.date || '') ? i.date : W.date, desc: String(i.description || ''), amount: num(i.price) * (num(i.qty) || 1) })); if (!W.brId && num(d.budget)) W.budget = num(d.budget); }
  else if (items.length) W.items = items.map(i => ({ id: uid(), desc: String(i.description || ''), qty: num(i.qty) || 1, price: num(i.price) }));
}

/* ---------- banks (colored badge with the bank's short name; not the official logos) ---------- */
const BANKS = [
  ['BDO', '#0a4ba0'], ['BPI', '#b3161d'], ['Metrobank', '#0b2f6b'], ['GoTyme', '#0bb5c4'], ['Landbank', '#0a8a4a'], ['PNB', '#0c3b8f'],
  ['Security Bank', '#1e9e55'], ['UnionBank', '#f37021'], ['RCBC', '#00539b'], ['China Bank', '#b8141c'], ['EastWest', '#6a1b9a'],
  ['PSBank', '#0067b1'], ['Maybank', '#d4a400'], ['DBP', '#00693e'], ['CIMB', '#b0121a'], ['AUB', '#0f4c81'],
  ['BOC', '#c8102e'], ['Robinsons Bank', '#d81f26'], ['Sterling Bank', '#00205b'], ['GCash', '#0a6cf0'], ['Maya', '#08a05b'],
  ['SeaBank', '#e8501a'], ['UnionDigital', '#f58220'], ['Tonik', '#6c2bd9'], ['Citibank', '#0a3a82'], ['HSBC', '#c8102e'],
  ['Standard Chartered', '#0a7a4b'], ['Other', '#6f6a62']
].map(([n, c]) => ({ n, c }));
const BANK_ABBR = { Metrobank: 'MBTC', GoTyme: 'GT', Landbank: 'LBP', 'Security Bank': 'SBC', UnionBank: 'UBP', 'China Bank': 'CBC', EastWest: 'EWB', Maybank: 'MBB', 'Robinsons Bank': 'RBI', 'Sterling Bank': 'STER', Citibank: 'CITI', UnionDigital: 'UD', 'Standard Chartered': 'SC' };
const bankOf = name => BANKS.find(b => lc(b.n) === lc(name));
const bankAbbr = n => { const w = String(n || '').trim().split(/\s+/); return (w.length > 1 ? w.map(x => x[0]).join('') : String(n || '').slice(0, 4)).toUpperCase().slice(0, 4); };
function bankBadge(name) {
  if (!String(name || '').trim()) return '';
  const b = bankOf(name), c = b ? b.c : '#6f6a62', t = b ? (BANK_ABBR[b.n] || (b.n.length <= 5 ? b.n : bankAbbr(b.n))) : bankAbbr(name);
  return `<i class="bk" style="background:${c}">${esc(t)}</i>`;
}

/* bank accounts of a supplier or PO: [{bank, accNo}] (older records had a single bank / accNo) */
const acctsOf = o => {
  const a = Array.isArray(o.accounts) ? o.accounts.filter(x => x.bank || x.accNo) : [];
  return a.length ? a : (o.bank || o.accNo ? [{ id: 'old', bank: o.bank || '', accNo: o.accNo || '' }] : []);
};
