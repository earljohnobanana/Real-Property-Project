const ExcelJS = require('exceljs');

const THIN = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const PINK = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE4E4' } };
const PINK2 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6C9C9' } };
const HEADFILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };

const NUMCOLS = ['H','I','J','K','L','M','Q','R','S','T','U','V','W'];
const LABELCOLS = ['A','B','C','D','E','F','G','N','O','P'];

function money(v) { return Number(v) || 0; }
// Current-Year discount magnitude for a record (always a positive number).
// Prefers the separate column; falls back to the old combined field for legacy rows.
function cyDiscMag(row, discKey, combinedKey) {
  if (row[discKey] !== undefined && row[discKey] !== null) return Math.abs(money(row[discKey]));
  const c = money(row[combinedKey]); return c < 0 ? -c : 0;
}
function cyPenOf(row, penKey, combinedKey) {
  if (row[penKey] !== undefined && row[penKey] !== null) return money(row[penKey]);
  const c = money(row[combinedKey]); return c > 0 ? c : 0;
}
// For Cancelled / Advance records, the taxpayer name is blank — show the status word instead.
function displayName(row) {
  return (row.status === 'Cancelled' || row.status === 'Advance') ? row.status : row.taxpayer_name;
}
function zeros() { const o = {}; NUMCOLS.forEach(c => o[c] = 0); return o; }
function addInto(dst, src) { NUMCOLS.forEach(c => dst[c] += src[c]); }

// Numeric column values for one record (used for both detail rows and totals).
function numVals(row) {
  return {
    H: money(row.basic_cy_principal), I: money(row.basic_cy_discount_penalty), J: money(row.basic_cy_net_payment),
    K: money(row.basic_py_principal), L: money(row.basic_py_penalty),
    M: money(row.basic_cy_net_payment) + money(row.basic_py_principal) + money(row.basic_py_penalty),
    Q: money(row.sef_cy_principal), R: money(row.sef_cy_discount_penalty), S: money(row.sef_cy_net_payment),
    T: money(row.sef_py_principal), U: money(row.sef_py_penalty),
    V: money(row.sef_cy_net_payment) + money(row.sef_py_principal) + money(row.sef_py_penalty),
    W: (money(row.basic_cy_principal) + money(row.basic_cy_discount_penalty)) +
       (money(row.basic_py_principal) + money(row.basic_py_penalty)) +
       (money(row.sef_cy_principal) + money(row.sef_cy_discount_penalty)) +
       (money(row.sef_py_principal) + money(row.sef_py_penalty))
  };
}

// Grand-total column sums + Current-Year discount/penalty totals over a set of rows.
function totalsOf(rows) {
  const grand = zeros();
  const cyDisc = { basic: 0, sef: 0 };
  const cyPen  = { basic: 0, sef: 0 };
  rows.forEach(row => {
    const nv = numVals(row);
    NUMCOLS.forEach(c => grand[c] += nv[c]);
    // Discount shown negative (it reduces the total); penalty positive.
    cyDisc.basic -= cyDiscMag(row, 'basic_cy_discount', 'basic_cy_discount_penalty');
    cyPen.basic  += cyPenOf(row, 'basic_cy_penalty', 'basic_cy_discount_penalty');
    cyDisc.sef   -= cyDiscMag(row, 'sef_cy_discount', 'sef_cy_discount_penalty');
    cyPen.sef    += cyPenOf(row, 'sef_cy_penalty', 'sef_cy_discount_penalty');
  });
  return { grand, cyDisc, cyPen };
}

async function buildWorkbook(rows, filter, grandRows) {
  grandRows = grandRows || rows;               // grand total may cover a wider period
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RPT Management';
  const ws = wb.addWorksheet('RPT Collection', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      paperSize: 5,               // 5 = Legal / long bondpaper (8.5 x 14)
      horizontalCentered: false,
      margins: { left: 0.35, right: 0.2, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 }
    },
    properties: { defaultRowHeight: 16 }
  });

  const period = (filter && (filter.from || filter.to)) ? ((filter.from || '...') + ' to ' + (filter.to || '...')) : 'All records';
  ws.mergeCells('A1:W1');
  const t = ws.getCell('A1');
  t.value = 'REAL PROPERTY TAX COLLECTION - BASIC & SEF   (' + period + ')';
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 18;

  const H = 2, S = 3;
  const single = [
    ['A', 'CONTROL NO.'], ['B', 'DATE REMITTED'], ['C', 'DATE ISSUED'],
    ['D', 'NAME OF TAXPAYER'], ['E', 'RECEIPT NO.'], ['F', 'PERIOD COVERED'],
    ['G', 'LOCATION'], ['N', 'PIN'], ['O', 'TAX DEC. NO.'], ['P', 'TYPE OF PROPERTY'],
    ['W', 'GRAND TOTAL']
  ];
  single.forEach(([col, label]) => { ws.mergeCells(`${col}${H}:${col}${S}`); setHead(ws.getCell(`${col}${H}`), label); });
  ws.mergeCells(`H${H}:M${H}`); setHead(ws.getCell(`H${H}`), 'BASIC');
  ws.mergeCells(`Q${H}:V${H}`); setHead(ws.getCell(`Q${H}`), 'SEF');

  const subs = ['CY Principal', 'CY Disc./Pen.', 'CY Net Pmt', 'PY Principal', 'PY Penalty', 'Total'];
  ['H', 'I', 'J', 'K', 'L', 'M'].forEach((c, i) => setHead(ws.getCell(`${c}${S}`), subs[i]));
  ['Q', 'R', 'S', 'T', 'U', 'V'].forEach((c, i) => setHead(ws.getCell(`${c}${S}`), subs[i]));

  const widths = { A: 9, B: 11, C: 11, D: 26, E: 10, F: 12, G: 18,
    H: 11, I: 11, J: 11, K: 11, L: 11, M: 11,
    N: 16, O: 17, P: 13,
    Q: 11, R: 11, S: 11, T: 11, U: 11, V: 11, W: 13 };
  Object.entries(widths).forEach(([c, w]) => ws.getColumn(c).width = w);

  // Sort by Date Remitted, then Control No.
  const sorted = rows.slice().sort((a, b) => {
    const d = (a.date_remitted || '').localeCompare(b.date_remitted || '');
    if (d !== 0) return d;
    return (a.control_no || '').localeCompare(b.control_no || '', undefined, { numeric: true });
  });

  let r = S + 1;
  let group = zeros();
  let groupKey = null;

  function writeDataRow(row) {
    const nv = numVals(row);
    const vals = {
      A: row.control_no, B: row.date_remitted, C: row.date_issued, D: displayName(row),
      E: row.receipt_no, F: row.period_covered, G: row.location,
      N: row.pin, O: row.tax_declaration_no, P: row.property_type,
      ...nv
    };
    Object.entries(vals).forEach(([c, v]) => {
      const cell = ws.getCell(`${c}${r}`);
      cell.value = v;
      cell.border = BORDER;
      cell.font = { size: 12 };
      if (NUMCOLS.includes(c)) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
        group[c] += Number(v) || 0;   // subtotals come from the detail rows shown
      } else {
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
    });
    r++;
  }

  function writeTotalRow(label, sums, big) {
    ws.mergeCells(`A${r}:G${r}`);
    const st = ws.getCell(`A${r}`);
    st.value = label;
    st.font = { bold: true, size: big ? 12 : 11 };
    st.alignment = { horizontal: 'center', vertical: 'middle' };
    const fill = big ? PINK2 : PINK;
    LABELCOLS.forEach(c => { const cell = ws.getCell(`${c}${r}`); cell.fill = fill; cell.border = BORDER; });
    NUMCOLS.forEach(c => {
      const cell = ws.getCell(`${c}${r}`);
      cell.value = sums[c];
      cell.numFmt = '#,##0.00';
      cell.font = { bold: true, size: 12 };
      cell.alignment = { horizontal: 'right' };
      cell.fill = fill;
      cell.border = BORDER;
    });
    r++;
  }

  sorted.forEach(row => {
    const key = row.date_remitted || '';
    if (groupKey !== null && key !== groupKey) {
      writeTotalRow('SUBTOTAL  ' + groupKey, group, false);
      group = zeros();
    }
    groupKey = key;
    writeDataRow(row);
  });
  // Grand total (and CY discount/penalty summary) computed over the wider grandRows.
  const totals = totalsOf(grandRows);
  if (sorted.length) {
    writeTotalRow('SUBTOTAL  ' + groupKey, group, false);
    writeTotalRow('GRAND TOTAL', totals.grand, true);
  }

  // ---------- Footer: Discount/Penalty summary, then signatories ----------
  let footRow = r + 2;                       // 2 rows below the grand total
  footRow = writeSummaryBlock(ws, footRow, totals.cyDisc, totals.cyPen);   // Current-Year BASIC + SEF totals
  footRow += 2;                              // gap before the signatories
  footRow = writeSignatureBlock(ws, footRow);
  r = footRow;

  ws.pageSetup.printArea = 'A1:W' + (r - 1);
  ws.pageSetup.printTitlesRow = '2:3';
  return wb;
}

// Draws the BASIC and SEF Current-Year Discount/Penalty summary in the footer.
// DISCOUNT = total of all current-year discounts (negative disc/pen entries), shown red.
// PENALTY  = total of all current-year penalties (positive disc/pen entries).
// Prior-year amounts are NOT included here.
function writeSummaryBlock(ws, startRow, cyDisc, cyPen) {
  const RED = { argb: 'FFCC0000' };
  const GREEN = { argb: 'FF128A2B' };
  // Section label on top; DISCOUNT and PENALTY stacked underneath it.
  // kCol = "DISCOUNT ="/"PENALTY =" label column, vCol = the amount column.
  function block(labelCol, kCol, vCol, sectionLabel, discVal, penVal) {
    const s = ws.getCell(`${labelCol}${startRow}`);
    s.value = sectionLabel;
    s.font = { bold: true, size: 15 };
    s.alignment = { vertical: 'middle' };

    const dl = ws.getCell(`${kCol}${startRow + 1}`);
    dl.value = 'DISCOUNT =';
    dl.font = { bold: true, size: 10 };
    dl.alignment = { horizontal: 'right' };
    const dv = ws.getCell(`${vCol}${startRow + 1}`);
    dv.value = discVal;
    dv.numFmt = '#,##0.00';
    dv.alignment = { horizontal: 'right' };
    dv.font = { bold: true, size: 11, color: RED };

    const pl = ws.getCell(`${kCol}${startRow + 2}`);
    pl.value = 'PENALTY =';
    pl.font = { bold: true, size: 10 };
    pl.alignment = { horizontal: 'right' };
    const pv = ws.getCell(`${vCol}${startRow + 2}`);
    pv.value = penVal;
    pv.numFmt = '#,##0.00';
    pv.alignment = { horizontal: 'right' };
    pv.font = { bold: true, size: 11, color: GREEN };
  }
  ws.getRow(startRow).height = 21;                 // room for the size-15 BASIC/SEF text
  // BASIC on the left, SEF a few columns over — amounts stacked under each label.
  block('A', 'A', 'B', 'BASIC', cyDisc.basic, cyPen.basic);
  block('E', 'E', 'F', 'SEF', cyDisc.sef, cyPen.sef);
  return startRow + 3;
}

// Draws the two signatories at the bottom, matching the printed report layout.
// "PREPARED BY" sits on the left (columns A-G), "CERTIFIED CORRECT BY" on the
// right (columns Q-W). Change the names/title here if the office signatories change.
function writeSignatureBlock(ws, startRow) {
  const PREPARED_BY = 'JOY T. NUIQUE';
  const CERTIFIED_BY = 'BERNADETTE O. FRANCISCO';
  const CERTIFIED_TITLE = 'MUNICIPAL TREASURER';

  const labelRow = startRow;      // "PREPARED BY:" / "CERTIFIED CORRECT BY:"
  const nameRow = startRow + 3;   // the printed names (space above for signatures)
  const titleRow = startRow + 4;  // title under the certifying officer

  // Columns where each signatory sits. Move the letters right/left to nudge
  // the whole block sideways (e.g. 'C' -> 'D' shifts the left name further right).
  const LEFT_COL = 'C';           // PREPARED BY / JOY T. NUIQUE
  const RIGHT_COL = 'S';          // CERTIFIED CORRECT BY / BERNADETTE O. FRANCISCO

  ws.getCell(`${LEFT_COL}${labelRow}`).value = 'PREPARED BY:';
  ws.getCell(`${LEFT_COL}${labelRow}`).font = { bold: true, size: 11 };
  ws.getCell(`${RIGHT_COL}${labelRow}`).value = 'CERTIFIED CORRECT BY:';
  ws.getCell(`${RIGHT_COL}${labelRow}`).font = { bold: true, size: 11 };

  const nameL = ws.getCell(`${LEFT_COL}${nameRow}`);
  nameL.value = PREPARED_BY;
  nameL.font = { bold: true, size: 11 };

  const nameR = ws.getCell(`${RIGHT_COL}${nameRow}`);
  nameR.value = CERTIFIED_BY;
  nameR.font = { bold: true, size: 11 };

  const title = ws.getCell(`${RIGHT_COL}${titleRow}`);
  title.value = CERTIFIED_TITLE;
  title.font = { size: 10 };
  return titleRow + 1;
}

function setHead(cell, label) {
  cell.value = label;
  cell.font = { bold: true, size: 10 };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.fill = HEADFILL;
  cell.border = BORDER;
}

function monthName(mm) {
  return ['', 'January','February','March','April','May','June','July','August',
    'September','October','November','December'][parseInt(mm, 10)] || '';
}

module.exports = { buildWorkbook };

// ---------- HTML builder for print-perfect PDF (works on any printer) ----------
function fmt(v) { return (Number(v) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function buildReportHtml(rows, filter, grandRows) {
  grandRows = grandRows || rows;               // grand total may cover a wider period
  const period = (filter && (filter.from || filter.to))
    ? ((filter.from || '...') + ' to ' + (filter.to || '...')) : 'All records';

  const sorted = rows.slice().sort((a, b) => {
    const d = (a.date_remitted || '').localeCompare(b.date_remitted || '');
    if (d !== 0) return d;
    return (a.control_no || '').localeCompare(b.control_no || '', undefined, { numeric: true });
  });

  const NUM = ['bH','bI','bJ','bK','bL','bM','sQ','sR','sS','sT','sU','sV','W'];
  const grand = {}; NUM.forEach(k => grand[k] = 0);
  const cyDisc = { basic: 0, sef: 0 };   // Current-Year discounts only (negatives)
  const cyPen  = { basic: 0, sef: 0 };   // Current-Year penalties only (positives)
  let group = {}; NUM.forEach(k => group[k] = 0);
  let groupKey = null;

  function rowVals(r) {
    const bM = m(r.basic_cy_net_payment) + m(r.basic_py_principal) + m(r.basic_py_penalty);
    const sV = m(r.sef_cy_net_payment) + m(r.sef_py_principal) + m(r.sef_py_penalty);
    return {
      bH: m(r.basic_cy_principal), bI: m(r.basic_cy_discount_penalty), bJ: m(r.basic_cy_net_payment),
      bK: m(r.basic_py_principal), bL: m(r.basic_py_penalty), bM: bM,
      sQ: m(r.sef_cy_principal), sR: m(r.sef_cy_discount_penalty), sS: m(r.sef_cy_net_payment),
      sT: m(r.sef_py_principal), sU: m(r.sef_py_penalty), sV: sV,
      W: bM + sV
    };
  }
  function m(v) { return Number(v) || 0; }

  let body = '';
  function totalRow(label, sums, cls) {
    return '<tr class="' + (cls || 'sub') + '">' +
      '<td colspan="7" class="lbl">' + label + '</td>' +
      '<td class="n">' + fmt(sums.bH) + '</td><td class="n">' + fmt(sums.bI) + '</td><td class="n">' + fmt(sums.bJ) + '</td>' +
      '<td class="n">' + fmt(sums.bK) + '</td><td class="n">' + fmt(sums.bL) + '</td><td class="n">' + fmt(sums.bM) + '</td>' +
      '<td colspan="3"></td>' +
      '<td class="n">' + fmt(sums.sQ) + '</td><td class="n">' + fmt(sums.sR) + '</td><td class="n">' + fmt(sums.sS) + '</td>' +
      '<td class="n">' + fmt(sums.sT) + '</td><td class="n">' + fmt(sums.sU) + '</td><td class="n">' + fmt(sums.sV) + '</td>' +
      '<td class="n">' + fmt(sums.W) + '</td></tr>';
  }

  sorted.forEach(r => {
    const key = r.date_remitted || '';
    if (groupKey !== null && key !== groupKey) { body += totalRow('SUBTOTAL ' + groupKey, group, 'sub'); group = {}; NUM.forEach(k => group[k] = 0); }
    groupKey = key;
    const v = rowVals(r);
    NUM.forEach(k => { group[k] += v[k]; });   // subtotals from the detail rows shown
    body += '<tr>' +
      '<td>' + esc(r.control_no) + '</td><td>' + esc(r.date_remitted) + '</td><td>' + esc(r.date_issued) + '</td>' +
      '<td class="name">' + esc(displayName(r)) + '</td><td>' + esc(r.receipt_no) + '</td><td>' + esc(r.period_covered) + '</td><td>' + esc(r.location) + '</td>' +
      '<td class="n">' + fmt(v.bH) + '</td><td class="n">' + fmt(v.bI) + '</td><td class="n">' + fmt(v.bJ) + '</td>' +
      '<td class="n">' + fmt(v.bK) + '</td><td class="n">' + fmt(v.bL) + '</td><td class="n">' + fmt(v.bM) + '</td>' +
      '<td>' + esc(r.pin) + '</td><td>' + esc(r.tax_declaration_no) + '</td><td>' + esc(r.property_type) + '</td>' +
      '<td class="n">' + fmt(v.sQ) + '</td><td class="n">' + fmt(v.sR) + '</td><td class="n">' + fmt(v.sS) + '</td>' +
      '<td class="n">' + fmt(v.sT) + '</td><td class="n">' + fmt(v.sU) + '</td><td class="n">' + fmt(v.sV) + '</td>' +
      '<td class="n">' + fmt(v.W) + '</td></tr>';
  });
  // Grand total + CY discount/penalty summary computed over the wider grandRows.
  grandRows.forEach(r => {
    const v = rowVals(r);
    NUM.forEach(k => { grand[k] += v[k]; });
    cyDisc.basic -= cyDiscMag(r, 'basic_cy_discount', 'basic_cy_discount_penalty');
    cyPen.basic  += cyPenOf(r, 'basic_cy_penalty', 'basic_cy_discount_penalty');
    cyDisc.sef   -= cyDiscMag(r, 'sef_cy_discount', 'sef_cy_discount_penalty');
    cyPen.sef    += cyPenOf(r, 'sef_cy_penalty', 'sef_cy_discount_penalty');
  });
  if (sorted.length) { body += totalRow('SUBTOTAL ' + groupKey, group, 'sub'); body += totalRow('GRAND TOTAL', grand, 'grand'); }

  function side(name, disc, pen) {
    return '<div class="s-sec">' + name + '</div>' +
      '<div class="s-line"><span class="s-k">DISCOUNT =</span> <span class="s-neg">' + fmt(disc) + '</span></div>' +
      '<div class="s-line"><span class="s-k">PENALTY =</span> <span class="s-pos">' + fmt(pen) + '</span></div>';
  }
  const sumBlock =
    '<table class="summ"><tr>' +
      '<td>' + side('BASIC', cyDisc.basic, cyPen.basic) + '</td>' +
      '<td class="s-gap2"></td>' +
      '<td>' + side('SEF', cyDisc.sef, cyPen.sef) + '</td>' +
    '</tr></table>';

  const signBlock =
    '<table class="sign"><tr>' +
      '<td class="s-lbl">PREPARED BY:</td><td class="s-gap"></td><td class="s-lbl">CERTIFIED CORRECT BY:</td>' +
    '</tr><tr>' +
      '<td class="s-name">JOY T. NUIQUE</td><td class="s-gap"></td>' +
      '<td class="s-name">BERNADETTE O. FRANCISCO<div class="s-title">MUNICIPAL TREASURER</div></td>' +
    '</tr></table>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page{size:legal landscape;margin:8mm;}' +
    'body{font-family:Arial,sans-serif;margin:0;color:#000;}' +
    'h2{text-align:center;font-size:12px;margin:4px 0 6px;}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed;}' +
    'th,td{border:1px solid #000;padding:2px 3px;font-size:8px;word-wrap:break-word;overflow:hidden;}' +
    'th{background:#ededed;text-align:center;}' +
    'td.n{text-align:right;} td.name{text-align:left;} td{text-align:center;}' +
    'tr.sub td{background:#fbe4e4;font-weight:bold;} tr.grand td{background:#f6c9c9;font-weight:bold;}' +
    '.lbl{text-align:center;font-weight:bold;}' +
    'thead{display:table-header-group;}' +
    'table.sign{margin-top:24px;border-collapse:collapse;}' +
    'table.sign td{border:none;font-size:10px;padding:0;text-align:left;vertical-align:top;}' +
    'table.sign .s-lbl{font-weight:bold;padding-bottom:34px;}' +
    'table.sign .s-gap{width:40%;}' +
    'table.sign .s-name{font-weight:bold;}' +
    'table.sign .s-title{font-weight:normal;font-size:9px;}' +
    'table.summ{margin-top:18px;border-collapse:collapse;}' +
    'table.summ td{border:none;padding:0 8px;text-align:left;vertical-align:top;}' +
    'table.summ .s-sec{font-weight:bold;font-size:15px;margin-bottom:2px;}' +
    'table.summ .s-line{font-size:11px;line-height:1.3;}' +
    'table.summ .s-k{font-weight:bold;}' +
    'table.summ .s-neg{color:#cc0000;}' +
    'table.summ .s-pos{color:#128a2b;}' +
    'table.summ .s-gap2{width:40px;}' +
    '</style></head><body>' +
    '<h2>REAL PROPERTY TAX COLLECTION - BASIC &amp; SEF (' + period + ')</h2>' +
    '<table><thead>' +
    '<tr>' +
      '<th rowspan="2">Control No.</th><th rowspan="2">Date Remitted</th><th rowspan="2">Date Issued</th>' +
      '<th rowspan="2">Name of Taxpayer</th><th rowspan="2">Receipt No.</th><th rowspan="2">Period</th><th rowspan="2">Location</th>' +
      '<th colspan="6">BASIC</th>' +
      '<th rowspan="2">PIN</th><th rowspan="2">Tax Dec. No.</th><th rowspan="2">Type</th>' +
      '<th colspan="6">SEF</th>' +
      '<th rowspan="2">Grand Total</th>' +
    '</tr>' +
    '<tr>' +
      '<th>CY Principal</th><th>CY Disc./Pen.</th><th>CY Net Pmt</th><th>PY Principal</th><th>PY Penalty</th><th>Total</th>' +
      '<th>CY Principal</th><th>CY Disc./Pen.</th><th>CY Net Pmt</th><th>PY Principal</th><th>PY Penalty</th><th>Total</th>' +
    '</tr></thead><tbody>' + body + '</tbody></table>' + sumBlock + signBlock + '</body></html>';
}

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports.buildReportHtml = buildReportHtml;