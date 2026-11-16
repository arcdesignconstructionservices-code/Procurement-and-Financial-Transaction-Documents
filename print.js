/* ============================================================
   ARC+ Procurement — the printed form (A4), same layout for the screen preview, printing / PDF and email.
   sheetHtml(kind, doc) -> html of one sheet.  printDoc(kind, doc) opens the browser's print dialog
   (choose "Save as PDF" there for a PDF file).
   ============================================================ */
const SHEET_CSS = `
.sheet{position:relative;width:210mm;min-height:297mm;box-sizing:border-box;padding:13mm 15mm 12mm;background:#fff;color:#444;font:12px/1.45 Arial,Helvetica,sans-serif;margin:0 auto}
.sheet *{box-sizing:border-box}
.sheet .lh{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.sheet .lh img{width:92px;height:auto;display:block}
.sheet .lh b{display:block;font-size:15px;color:#111;margin-bottom:2px}
.sheet .lh span{display:block;font-size:11.5px;color:#222;line-height:1.35}
.sheet h1{margin:6px 0 14px;padding:0;border:0;text-transform:none;font-size:38px;line-height:1.05;color:#283592;font-weight:800;letter-spacing:-.5px}
.sheet .lbl{font-weight:800;font-size:13px;color:#283592}
.sheet .val{color:#666;font-size:13px;min-height:19px;padding:2px 0 8px;word-break:break-word}
.sheet .pair{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}
.sheet table{width:100%;border-collapse:collapse;margin-top:10px}
.sheet h1::before,.sheet h1::after{display:none!important;content:none!important}
.sheet th{background:none;text-transform:none;letter-spacing:0;color:#2a3990;font-weight:800;font-size:13px;text-align:left;padding:5px 7px;border-bottom:1px solid #c9ccd8}
.sheet th.n,.sheet td.n{text-align:right}
.sheet td{padding:5px 7px;color:#666;font-size:12.5px;height:25px;vertical-align:top}
.sheet tbody tr:nth-child(odd) td{background:#f3f3f3}
.sheet .tot{display:flex;justify-content:flex-end;gap:26px;margin-top:12px;color:#e01b84;font-weight:800;font-size:19px}
.sheet .tot.sm{font-size:15px;color:#283592;margin-top:4px}
.sheet .bank{margin-top:16px;color:#555}
.sheet .bank .r{display:flex;gap:12px;font-size:12px;line-height:1.7}
.sheet .bank .r b{min-width:128px;color:#666;font-weight:700}
.sheet .bank .r span{color:#222;font-weight:700}
.sheet .sig{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:58px;position:relative}
.sheet .sig .lbl{font-size:13px}
.sheet .sig .line{border-bottom:1px solid #444;min-height:26px;padding-top:6px;color:#222;font-size:12.5px;font-weight:700;text-transform:uppercase}
.sheet .stamp{position:absolute;right:2mm;top:-6px;transform:rotate(-7deg);border:3px double #d62828;color:#d62828;padding:5px 14px 6px;text-align:center;font-weight:900;opacity:.88;line-height:1.1;background:rgba(255,255,255,.35)}
.sheet .stamp big{display:block;font-size:30px;letter-spacing:2px}
.sheet .stamp small{display:block;font-size:11px;font-weight:700;letter-spacing:.3px;margin-top:3px}
.sheet .def{color:#283592}
@media print{@page{size:A4;margin:0}.sheet{margin:0;box-shadow:none}}
`;
(function () { const st = document.createElement('style'); st.textContent = SHEET_CSS; document.head.appendChild(st); })();

const LETTERHEAD = () => `<div class="lh"><img src="${location.origin}/logo_dark.png" alt="ARC+"><div><b>${esc(COMPANY.name)}</b><span>${esc(COMPANY.address)}</span><span>${esc(COMPANY.email)}</span><span>${esc(COMPANY.phone)}</span></div></div>`;
const padRows = (n, min, cols) => Array.from({ length: Math.max(0, min - n) }, () => `<tr>${'<td></td>'.repeat(cols)}</tr>`).join('');

function sheetHtml(kind, d, forEmail) {
  const css = forEmail ? `<style>${SHEET_CSS}</style>` : '';
  let body = '';
  if (kind === 'lq') {
    const b = brOf(d.brId), spent = lqSpent(d), budget = lqBudget(d), def = lqDeficit(d);
    const rows = (d.rows || []).map(r => `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.desc)}</td><td class="n">${r.amount === '' || r.amount == null ? '' : fmt(r.amount)}</td></tr>`).join('');
    body = `<h1>Liquidation</h1>
      <div class="pair"><div><div class="lbl">Date</div><div class="val">${esc(fmtDate(d.date))}</div></div><div><div class="lbl">Liquidation #</div><div class="val">${esc(d.no)}</div></div></div>
      <div class="pair"><div><div class="lbl">Budget Request #</div><div class="val">${esc(b ? b.no : '')}</div></div><div><div class="lbl">Budget</div><div class="val">${peso(budget)}</div></div></div>
      <div class="lbl">Project</div><div class="val">${esc(projName(d))}</div>
      <table><thead><tr><th style="width:22%">Date</th><th>Description</th><th class="n" style="width:24%">Amount</th></tr></thead><tbody>${rows}${padRows((d.rows || []).length, 12, 3)}</tbody></table>
      <div class="tot"><span>TOTAL</span><span>${fmt(spent)}</span></div>
      <div class="tot sm def"><span>DEFICIT</span><span>${def < 0 ? '(' + fmt(-def) + ')' : fmt(def)}</span></div>
      <div class="sig"><div><div class="lbl">Submitted By:</div><div class="line">${esc(d.submittedBy)}</div></div><div><div class="lbl">Date</div><div class="line">${esc(fmtDate(d.submittedDate))}</div></div></div>`;
  } else {
    const isPo = kind === 'po', items = d.items || [];
    const rows = items.map((i, k) => `<tr><td>${k + 1}</td><td>${esc(i.desc)}</td><td class="n">${fmt(i.qty)}</td><td class="n">${fmt(i.price)}</td><td class="n">${fmt(lineTotal(i))}</td></tr>`).join('');
    const total = itemsTotal(items);
    const sup = isPo ? (d.supplierName || (supplierOf(d.supplierId) || {}).name || '') : '';
    body = `<h1>${isPo ? 'Purchase Order' : 'Budget Request'}</h1>
      <div class="pair"><div><div class="lbl">Date</div><div class="val">${esc(fmtDate(d.date))}</div></div><div><div class="lbl">${isPo ? 'PO #' : 'Budget Request #'}</div><div class="val">${esc(d.no)}</div></div></div>
      <div class="pair"><div><div class="lbl">Project</div><div class="val">${esc(projName(d))}</div></div><div>${isPo ? `<div class="lbl">Payment To</div><div class="val">${esc(sup)}</div>` : `<div class="lbl">Requested By</div><div class="val">${esc(d.requestedBy)}</div>`}</div></div>
      <table><thead><tr><th style="width:9%">Item #</th><th>Description</th><th class="n" style="width:10%">Qty</th><th class="n" style="width:17%">Unit price</th><th class="n" style="width:17%">Total price</th></tr></thead><tbody>${rows}${padRows(items.length, 10, 5)}</tbody></table>
      <div class="tot"><span>TOTAL=</span><span>${fmt(total)}</span></div>
      ${isPo ? `<div class="bank"><div class="r"><b>BANK DETAILS:</b><span>${esc(d.bank)}</span></div><div class="r"><b>ACCOUNT NAME:</b><span>${esc(d.accName)}</span></div><div class="r"><b>ACCOUNT NUMBER:</b><span>${esc(d.accNo)}</span></div></div>` : ''}
      <div class="sig"><div><div class="lbl">Requested By:</div><div class="line">${esc(d.requestedBy)}</div></div><div><div class="lbl">Date</div><div class="line">${esc(fmtDate(d.date))}</div></div>
        ${!isPo && d.status !== 'draft' && d.status !== 'submitted' && d.status !== 'rejected' && d.approvedAt ? `<div class="stamp"><big>APPROVED</big><small>${esc(d.approvedBy || '')}${d.approvedTitle ? '<br>' + esc(d.approvedTitle) : ''}<br>${esc(fmtDate(d.approvedAt))}</small></div>` : ''}
        ${isPo && d.status === 'released' ? `<div class="stamp"><big>RELEASED</big><small>${esc(d.releasedBy || '')}${d.releasedTitle ? '<br>' + esc(d.releasedTitle) : ''}<br>DATE: ${esc(fmtDate(d.releasedAt))}</small></div>` : ''}
      </div>`;
  }
  return `${css}<div class="sheet">${LETTERHEAD()}${body}</div>`;
}

/* On-screen preview with Print / PDF, Excel and Email buttons. */
function previewDoc(kind, d) {
  const r = document.getElementById('printRoot');
  r.innerHTML = `<div class="pv no-print"><div class="pvbar"><b>${esc(KINDS[kind].label)} ${esc(d.no)}</b><span class="spacer"></span><button class="primary" id="pvPrint">Print / Save as PDF</button><button id="pvXlsx">Excel</button><button id="pvClose">Close</button></div></div><div class="pvpage">${sheetHtml(kind, d)}</div>`;
  document.documentElement.classList.add('previewing');
  const close = () => { r.innerHTML = ''; document.documentElement.classList.remove('previewing'); };
  r.querySelector('#pvClose').onclick = close;
  r.querySelector('#pvPrint').onclick = () => window.print();
  r.querySelector('#pvXlsx').onclick = () => exportXlsx(kind, d);
}
function printDoc(kind, d) { previewDoc(kind, d); setTimeout(() => window.print(), 250); }
