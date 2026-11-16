/* ============================================================
   ARC+ Procurement — Excel export (ExcelJS), laid out like the owner's Liquidation sheet:
   logo + company block top left, big blue title, magenta labels, grey striped rows,
   TOTAL / DEFICIT formulas, signature lines. Budget Request and Purchase Order use the same look.
   ============================================================ */
const XL = { blue: 'FF0A0A0A', blue2: 'FF0A0A0A', pink: 'FFFF8A00', grey: 'FF0A0A0A', text: 'FF666666', stripe: 'FFF4F2EE' };
const XL_NUM = '#,##0.00;(#,##0.00)';
const xlFont = (size, color, bold) => ({ name: 'Arial', size, bold: !!bold, color: { argb: color } });
const xlDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };

async function buildXlsx(kind, d) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'ARC+ Procurement';
  const ws = wb.addWorksheet(kind === 'lq' ? String(d.no || 'LQ').replace(/[\\\/?*\[\]:]/g, '-').slice(0, 31) : KINDS[kind].label, { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .5, right: .5, top: .5, bottom: .5, header: .3, footer: .3 } } });
  ws.views = [{ showGridLines: false }];
  const cell = (a, v, o) => { const c = ws.getCell(a); if (v !== undefined) c.value = v; o = o || {}; if (o.font) c.font = o.font; if (o.fmt) c.numFmt = o.fmt; if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }; if (o.al) c.alignment = o.al; if (o.border) c.border = o.border; return c; };
  const merge = r => ws.mergeCells(r);
  const bottom = { bottom: { style: 'thin', color: { argb: 'FF444444' } } }, top = { top: { style: 'thin', color: { argb: 'FF444444' } } };
  /* letterhead */
  try {
    const buf = await (await fetch('/logo_dark.png')).arrayBuffer();
    const img = wb.addImage({ buffer: buf, extension: 'png' });
    ws.addImage(img, { tl: { col: 1, row: 1 }, ext: { width: 92, height: 58 } });
  } catch (e) { }
  const head = (c1, c2) => {
    cell(c1 + '3', COMPANY.name, { font: xlFont(12, 'FF111111', true) }); merge(`${c1}3:${c2}3`);
    cell(c1 + '4', COMPANY.address, { font: xlFont(9, 'FF222222') }); merge(`${c1}4:${c2}4`);
    cell(c1 + '5', COMPANY.email, { font: xlFont(9, 'FF222222') }); merge(`${c1}5:${c2}5`);
    cell(c1 + '6', COMPANY.phone, { font: xlFont(9, 'FF222222') }); merge(`${c1}6:${c2}6`);
  };
  if (kind === 'lq') {
    ws.columns = [6.13, 14, 13.5, 10.13, 12.63, 20.13, 11.13, 6.13].map(w => ({ width: w }));
    // company block sits to the right of the logo, like the original sheet's top rows
    ws.getCell('D3').value = COMPANY.name; ws.getCell('D3').font = xlFont(11, 'FF111111', true); merge('D3:G3');
    ws.getCell('D4').value = COMPANY.address; ws.getCell('D4').font = xlFont(9, 'FF222222'); merge('D4:G4');
    ws.getCell('D5').value = COMPANY.email; ws.getCell('D5').font = xlFont(9, 'FF222222'); merge('D5:G5');
    ws.getCell('D6').value = COMPANY.phone; ws.getCell('D6').font = xlFont(9, 'FF222222'); merge('D6:G6');
    cell('B9', 'Liquidation', { font: xlFont(34, XL.blue, true) }); merge('B9:G9'); ws.getRow(9).height = 44;
    cell('B10', 'Date', { font: xlFont(12, XL.pink, true) }); merge('B10:C10');
    cell('B11', xlDate(d.date), { font: xlFont(12, XL.text), fmt: 'M/d/yyyy', al: { horizontal: 'left' } });
    const b = brOf(d.brId);
    cell('B12', 'BUDGET REQUEST #', { font: xlFont(12, XL.grey, true) }); merge('B12:C12');
    cell('D12', 'LIQUIDATION #', { font: xlFont(12, XL.grey, true) }); merge('D12:E12');
    cell('F12', 'BUDGET', { font: xlFont(12, XL.grey, true) }); merge('F12:G12');
    cell('B13', b ? b.no : '', { font: xlFont(12, XL.text) }); merge('B13:C13');
    cell('D13', d.no, { font: xlFont(12, XL.text) }); merge('D13:E13');
    cell('F13', lqBudget(d), { font: xlFont(12, XL.grey, true), fmt: '[$₱]#,##0.00', al: { horizontal: 'left' } }); merge('F13:G13');
    cell('B15', 'PROJECT', { font: xlFont(12, XL.grey, true) }); merge('B15:C15');
    cell('B16', projName(d), { font: xlFont(12, XL.text) });
    cell('B19', 'Date', { font: xlFont(12, XL.blue2, true) });
    cell('C19', 'Description', { font: xlFont(12, XL.blue2, true) }); merge('C19:F19');
    cell('G19', 'Amount', { font: xlFont(12, XL.blue2, true), al: { horizontal: 'right' } });
    ws.getRow(19).height = 19.5;
    const first = 20, slots = Math.max(16, (d.rows || []).length), last = first + slots - 1;
    for (let i = 0; i < slots; i++) {
      const r = first + i, row = (d.rows || [])[i], fill = i % 2 === 0 ? XL.stripe : 'FFFFFFFF';
      ws.getRow(r).height = 19.5;
      cell('B' + r, row ? xlDate(row.date) : null, { font: xlFont(12, XL.text), fill, fmt: 'M/d/yyyy', al: { horizontal: 'left' } });
      cell('C' + r, row ? row.desc : null, { font: xlFont(12, XL.text), fill }); merge(`C${r}:F${r}`);
      cell('G' + r, row && row.amount !== '' ? num(row.amount) : null, { font: xlFont(12, XL.text), fill, fmt: XL_NUM });
    }
    const tr = last + 2;
    cell('E' + tr, 'TOTAL', { font: xlFont(14, XL.pink, true), border: top });
    cell('F' + tr, null, { border: top });
    cell('G' + tr, { formula: `SUM(G${first}:G${last})`, result: lqSpent(d) }, { font: xlFont(14, XL.pink, true), fmt: XL_NUM, border: top });
    cell('E' + (tr + 1), 'DEFICIT', { font: xlFont(13, XL.blue, true) });
    cell('G' + (tr + 1), { formula: `G${tr}-F13`, result: lqDeficit(d) }, { font: xlFont(13, XL.blue, true), fmt: XL_NUM });
    const sr = tr + 3;
    cell('B' + sr, 'Submitted By:', { font: xlFont(12, XL.blue, true) }); merge(`B${sr}:D${sr}`);
    cell('F' + sr, 'Date', { font: xlFont(12, XL.blue, true) }); merge(`F${sr}:G${sr}`);
    cell('B' + (sr + 1), d.submittedBy, { font: xlFont(12, 'FF222222', true), border: bottom }); merge(`B${sr + 1}:D${sr + 1}`);
    cell('F' + (sr + 1), xlDate(d.submittedDate), { font: xlFont(12, 'FF222222', true), fmt: 'M/d/yyyy', border: bottom, al: { horizontal: 'left' } }); merge(`F${sr + 1}:G${sr + 1}`);
    return wb.xlsx.writeBuffer();
  }
  /* Budget Request / Purchase Order */
  const isPo = kind === 'po', items = d.items || [];
  ws.columns = [4, 9, 40, 9, 15, 17, 4].map(w => ({ width: w }));
  ws.getCell('C3').value = COMPANY.name; ws.getCell('C3').font = xlFont(11, 'FF111111', true); merge('C3:F3');
  ws.getCell('C4').value = COMPANY.address; ws.getCell('C4').font = xlFont(9, 'FF222222'); merge('C4:F4');
  ws.getCell('C5').value = COMPANY.email; ws.getCell('C5').font = xlFont(9, 'FF222222'); merge('C5:F5');
  ws.getCell('C6').value = COMPANY.phone; ws.getCell('C6').font = xlFont(9, 'FF222222'); merge('C6:F6');
  cell('B9', isPo ? 'Purchase Order' : 'Budget Request', { font: xlFont(34, XL.blue, true) }); merge('B9:F9'); ws.getRow(9).height = 44;
  cell('B11', 'Date', { font: xlFont(12, XL.blue2, true) }); merge('B11:C11');
  cell('E11', isPo ? 'PO #' : 'Budget Request #', { font: xlFont(12, XL.blue2, true) }); merge('E11:F11');
  cell('B12', xlDate(d.date), { font: xlFont(12, XL.text), fmt: 'M/d/yyyy', al: { horizontal: 'left' } }); merge('B12:C12');
  cell('E12', d.no, { font: xlFont(12, XL.text) }); merge('E12:F12');
  cell('B14', 'Project', { font: xlFont(12, XL.blue2, true) }); merge('B14:C14');
  cell('E14', isPo ? 'Payment To' : 'Requested By', { font: xlFont(12, XL.blue2, true) }); merge('E14:F14');
  cell('B15', projName(d), { font: xlFont(12, XL.text) }); merge('B15:C15');
  cell('E15', isPo ? (d.supplierName || (supplierOf(d.supplierId) || {}).name || '') : d.requestedBy, { font: xlFont(12, XL.text) }); merge('E15:F15');
  ['Item #', 'Description', 'Qty', 'Unit price', 'Total price'].forEach((h, i) => cell('BCDEF'[i] + '17', h, { font: xlFont(12, XL.blue2, true), al: { horizontal: i > 1 ? 'right' : 'left' } }));
  const first = 18, slots = Math.max(12, items.length), last = first + slots - 1;
  for (let i = 0; i < slots; i++) {
    const r = first + i, it = items[i], fill = i % 2 === 0 ? XL.stripe : 'FFFFFFFF';
    ws.getRow(r).height = 19.5;
    cell('B' + r, it ? i + 1 : null, { font: xlFont(12, XL.text), fill, al: { horizontal: 'left' } });
    cell('C' + r, it ? it.desc : null, { font: xlFont(12, XL.text), fill });
    cell('D' + r, it ? num(it.qty) : null, { font: xlFont(12, XL.text), fill, fmt: '0.00' });
    cell('E' + r, it ? num(it.price) : null, { font: xlFont(12, XL.text), fill, fmt: XL_NUM });
    cell('F' + r, it ? { formula: `D${r}*E${r}`, result: lineTotal(it) } : null, { font: xlFont(12, XL.text), fill, fmt: XL_NUM });
  }
  const tr = last + 2;
  cell('E' + tr, 'TOTAL=', { font: xlFont(14, XL.pink, true), border: top });
  cell('F' + tr, { formula: `SUM(F${first}:F${last})`, result: itemsTotal(items) }, { font: xlFont(14, XL.pink, true), fmt: XL_NUM, border: top });
  let r = tr + 2;
  if (isPo) {
    const nm = d.accName || d.supplierName || (supplierOf(d.supplierId) || {}).name || '';
    const put = (l, v, bold) => { cell('B' + r, l, { font: xlFont(11, XL.text, true) }); merge('B' + r + ':C' + r); cell('D' + r, v, { font: xlFont(11, 'FF222222', true) }); merge('D' + r + ':F' + r); r++; };
    put('BANK DETAILS:', '');
    put('ACCOUNT NAME:', nm);
    const ac = acctsOf(d);
    if (!ac.length) put('ACCOUNT NUMBER:', '');
    ac.forEach((a, k) => put(k ? '' : 'ACCOUNT NUMBER:', (a.bank ? a.bank + '   ' : '') + a.accNo));
    r++;
  }
  cell('B' + r, 'Requested By:', { font: xlFont(12, XL.blue, true) }); merge(`B${r}:C${r}`);
  cell('E' + r, 'Date', { font: xlFont(12, XL.blue, true) }); merge(`E${r}:F${r}`);
  cell('B' + (r + 1), d.requestedBy, { font: xlFont(12, 'FF222222', true), border: bottom }); merge(`B${r + 1}:C${r + 1}`);
  cell('E' + (r + 1), xlDate(d.date), { font: xlFont(12, 'FF222222', true), fmt: 'M/d/yyyy', border: bottom, al: { horizontal: 'left' } }); merge(`E${r + 1}:F${r + 1}`);
  const signed = !isPo ? (d.approvedAt && ['approved', 'liquidated'].includes(d.status) ? ['Approved By:', S.settings.approverName || d.approvedBy, S.settings.approverTitle || d.approvedTitle, d.approvedAt] : null)
    : (d.status === 'released' ? ['Released By:', S.settings.releaserName || S.settings.approverName || d.releasedBy, S.settings.approverTitle || d.releasedTitle, d.releasedAt] : null);
  if (signed) {
    const sr = r + 3;
    cell('B' + sr, signed[0], { font: xlFont(12, XL.blue, true) }); merge(`B${sr}:C${sr}`);
    cell('E' + sr, 'Date', { font: xlFont(12, XL.blue, true) }); merge(`E${sr}:F${sr}`);
    cell('B' + (sr + 1), signed[1] || '', { font: xlFont(12, 'FF222222', true), border: bottom }); merge(`B${sr + 1}:C${sr + 1}`);
    cell('E' + (sr + 1), xlDate(signed[3]), { font: xlFont(12, 'FF222222', true), fmt: 'M/d/yyyy', border: bottom, al: { horizontal: 'left' } }); merge(`E${sr + 1}:F${sr + 1}`);
    cell('B' + (sr + 2), signed[2] || '', { font: xlFont(10, XL.text) }); merge(`B${sr + 2}:C${sr + 2}`);
  }
  return wb.xlsx.writeBuffer();
}
async function exportXlsx(kind, d) {
  try { const buf = await buildXlsx(kind, d); download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), docFileName(kind, d) + '.xlsx'); toast('Excel saved'); }
  catch (e) { toast('Could not make the Excel file', 'error'); }
}
