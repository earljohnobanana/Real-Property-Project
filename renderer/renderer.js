const $ = (id) => document.getElementById(id);
const num = (id) => parseFloat($(id).value) || 0;
const peso = (n) => '₱' + n.toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2});

const HEADER_REQ = ['control_no','date_remitted','receipt_no','period_covered','taxpayer_name'];
const AMT_FIELDS = [
  'basic_cy_principal','basic_cy_discount','basic_cy_penalty','basic_cy_net_payment',
  'basic_py_principal','basic_py_penalty','basic_py_total',
  'sef_cy_principal','sef_cy_discount','sef_cy_penalty','sef_cy_net_payment',
  'sef_py_principal','sef_py_penalty','sef_py_total'
];
const TEXT_FIELDS = ['control_no','date_remitted','date_issued','receipt_no','period_covered',
  'taxpayer_name','pin','tax_declaration_no','property_type','location','status'];

let editingId = null;

function recalc() {
  const bnet = num('basic_cy_principal') - Math.abs(num('basic_cy_discount')) + num('basic_cy_penalty');
  const snet = num('sef_cy_principal')   - Math.abs(num('sef_cy_discount'))   + num('sef_cy_penalty');
  $('basic_cy_net_payment').value = bnet ? bnet.toFixed(2) : '';
  $('sef_cy_net_payment').value   = snet ? snet.toFixed(2) : '';
  $('basic_cy_net_payment').classList.toggle('negative', bnet < 0);
  $('sef_cy_net_payment').classList.toggle('negative', snet < 0);

  const bpt = num('basic_py_principal') + num('basic_py_penalty');
  const spt = num('sef_py_principal')   + num('sef_py_penalty');
  $('basic_py_total').value = bpt ? bpt.toFixed(2) : '';
  $('sef_py_total').value   = spt ? spt.toFixed(2) : '';

  const basic = bnet + bpt;
  const sef   = snet + spt;
  $('basic-total').textContent = basic.toFixed(2);
  $('sef-total').textContent   = sef.toFixed(2);
  $('grand-total').textContent = peso(basic + sef);

  $('basic-total').style.color = basic < 0 ? '#dc2626' : '';
  $('sef-total').style.color   = sef   < 0 ? '#dc2626' : '';
  const grand = basic + sef;
  $('grand-total').style.color = grand < 0 ? '#dc2626' : 'var(--brand2)';
}
document.querySelectorAll('.amt').forEach(el => el.addEventListener('input', recalc));

// Show/hide amount + taxpayer sections based on Record Type
function isCancelled() { return $('status').value === 'Cancelled'; }
function isAdvance()   { return $('status').value === 'Advance'; }

function updateMode() {
  const cancelled = isCancelled();
  const advance   = isAdvance();
  const hidePayment = cancelled || advance;

  $('payment-only').classList.toggle('hidden', hidePayment);
  $('cancelled-note').classList.toggle('hidden', !cancelled);
  $('advance-note').classList.toggle('hidden', !advance);
}
$('status').addEventListener('change', updateMode);

function collect() {
  const d = {};
  TEXT_FIELDS.forEach(f => d[f] = $(f).value.trim());
  AMT_FIELDS.forEach(f => d[f] = num(f));
  // Normalize discount to a positive magnitude (it always subtracts).
  d.basic_cy_discount = Math.abs(d.basic_cy_discount || 0);
  d.sef_cy_discount   = Math.abs(d.sef_cy_discount || 0);
  // Keep the combined Disc./Pen. and Net values in sync for storage + reports.
  // Combined = Penalty − Discount (negative when a discount dominates).
  d.basic_cy_discount_penalty = (d.basic_cy_penalty || 0) - d.basic_cy_discount;
  d.sef_cy_discount_penalty   = (d.sef_cy_penalty || 0) - d.sef_cy_discount;
  d.basic_cy_net_payment = (d.basic_cy_principal || 0) - d.basic_cy_discount + (d.basic_cy_penalty || 0);
  d.sef_cy_net_payment   = (d.sef_cy_principal || 0) - d.sef_cy_discount + (d.sef_cy_penalty || 0);
  return d;
}
function fill(rec) {
  TEXT_FIELDS.forEach(f => $(f).value = rec[f] ?? '');
  AMT_FIELDS.forEach(f => $(f).value = rec[f] ? rec[f] : '');
  if (!$('status').value) $('status').value = 'Payment';
  updateMode();
  recalc();
}
function clearForm() {
  [...TEXT_FIELDS, ...AMT_FIELDS].forEach(f => $(f).value = '');
  document.querySelectorAll('input').forEach(i => i.classList.remove('err'));
  $('status').value = 'Payment';
  updateMode();
  editingId = null;
  $('entry-title').textContent = 'New Entry';
  $('btn-delete').classList.add('hidden');
  recalc();
}
function isDirty() {
  return TEXT_FIELDS.some(f => f !== 'status' && $(f).value.trim()) || AMT_FIELDS.some(f => num(f) !== 0);
}
function validate() {
  let ok = true;
  document.querySelectorAll('input').forEach(i => i.classList.remove('err'));

  if (isCancelled()) {
    // Cancelled: only OR No. and Date Remitted required
    ['receipt_no','date_remitted'].forEach(f => { if (!$(f).value.trim()) { $(f).classList.add('err'); ok = false; } });
    if (!ok) toast('Enter the OR No. and Date Remitted.', true);
    return ok;
  }

  if (isAdvance()) {
    // Advance: Date Remitted, Control No., Date Issued, Receipt No., Period Covered required
    ['date_remitted','control_no','receipt_no','period_covered'].forEach(f => {
      if (!$(f).value.trim()) { $(f).classList.add('err'); ok = false; }
    });
    if (!ok) toast('Fill in Date Remitted, Control No., Receipt No., and Period Covered.', true);
    return ok;
  }

  // Normal payment
  HEADER_REQ.forEach(f => { if (!$(f).value.trim()) { $(f).classList.add('err'); ok = false; } });
  const anyAmount = AMT_FIELDS.some(f => num(f) !== 0);
  if (!anyAmount) { ok = false; toast('Enter at least one amount.', true); }
  return ok;
}

let toastTimer;
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', 2600);
}

$('btn-save').addEventListener('click', async () => {
  if (!validate()) { if ($('control_no').classList.contains('err')) toast('Fill the highlighted blanks.', true); return; }
  const data = collect();
  if (editingId) { await window.api.updatePayment(editingId, data); toast('Record updated.'); }
  else { await window.api.savePayment(data); toast('Record saved.'); }
  clearForm();
});
$('btn-clear').addEventListener('click', () => {
  if (isDirty() && !confirm('Clear all blanks? Unsaved data will be lost.')) return;
  clearForm();
});
$('btn-delete').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Delete this record? It will be removed from reports (kept in audit log).')) return;
  await window.api.deletePayment(editingId);
  toast('Record deleted.');
  clearForm();
  showView('history');
});

$('taxpayer_name').addEventListener('input', async (e) => {
  const term = e.target.value.trim();
  if (term.length < 2) return;
  const names = await window.api.searchTaxpayers(term);
  $('taxpayer-list').innerHTML = names.map(n => `<option value="${n}">`).join('');
});

function populateYears(rows) {
  const sel = $('filter-year');
  const current = sel.value;
  const years = [...new Set(rows.map(r => (r.date_remitted || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  sel.innerHTML = '<option value="">All years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
  sel.value = current;
}

// Displayed / reported total per record = CY Net + PY Total (Principal+Penalty)
function basicSum(r) {
  return (r.basic_cy_principal + r.basic_cy_discount_penalty) + (r.basic_py_principal + r.basic_py_penalty);
}
function sefSum(r) {
  return (r.sef_cy_principal + r.sef_cy_discount_penalty) + (r.sef_py_principal + r.sef_py_penalty);
}

async function loadHistory(search) {
  const all = await window.api.listPayments(search);
  populateYears(all);
  const yr = $('filter-year').value;
  const mo = $('filter-month').value;
  const rows = all.filter(r => {
    const d = r.date_remitted || '';
    if (yr && d.slice(0, 4) !== yr) return false;
    if (mo && d.slice(5, 7) !== mo) return false;
    return true;
  });
  let basicTotal = 0, sefTotal = 0;
  rows.forEach(r => { basicTotal += basicSum(r); sefTotal += sefSum(r); });
  $('tot-basic').textContent = peso(basicTotal);
  $('tot-sef').textContent   = peso(sefTotal);
  $('tot-count').textContent = rows.length;
  const wrap = $('cards');
  if (!rows.length) { wrap.innerHTML = '<div class="empty">No records for this filter.</div>'; return; }
  wrap.innerHTML = rows.map(r => {
    const cancelled = r.status === 'Cancelled';
    const advance   = r.status === 'Advance';
    const title = (cancelled || advance) ? (advance ? 'Advance Payment' : 'Cancelled Property') : r.taxpayer_name;
    const badge = cancelled
      ? ' <span class="pill" style="background:#b91c1c">CANCELLED</span>'
      : advance
        ? ' <span class="pill" style="background:#1d4ed8">ADVANCE</span>'
        : '';
    return `<div class="hcard" data-id="${r.id}">
      <div class="name">${title}${badge}</div>
      <div class="meta">
        Control ${r.control_no || '-'} &bull; OR ${r.receipt_no || '-'}<br/>
        Period ${r.period_covered || '-'} &bull; ${r.date_remitted || ''}
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.hcard').forEach(c => c.addEventListener('click', () => openRecord(parseInt(c.dataset.id))));
}

async function openRecord(id) {
  const rec = await window.api.getPayment(id);
  editingId = id;
  fill(rec);
  $('entry-title').innerHTML = 'Edit Record <span class="pill">editing</span>';
  $('btn-delete').classList.remove('hidden');
  showView('entry');
}
$('search').addEventListener('input', () => loadHistory($('search').value.trim()));
$('filter-year').addEventListener('change', () => loadHistory($('search').value.trim()));
$('filter-month').addEventListener('change', () => loadHistory($('search').value.trim()));

$('btn-export').addEventListener('click', async () => {
  const filter = { from: $('rep-from').value, to: $('rep-to').value };
  const btn = $('btn-export');
  btn.disabled = true;
  btn.textContent = 'Exporting...';
  try {
    const res = await window.api.exportReport(filter);
    if (res.ok) toast('Saved ' + res.count + ' records to Excel.');
    else if (res.reason && res.reason !== 'cancelled') toast(res.reason, true);
  } catch (err) { toast('Export failed: ' + err.message, true); }
  btn.disabled = false;
  btn.textContent = 'Export to Excel';
});

$('btn-export-pdf').addEventListener('click', async () => {
  const filter = { from: $('rep-from').value, to: $('rep-to').value };
  const btn = $('btn-export-pdf');
  btn.disabled = true;
  btn.textContent = 'Exporting PDF...';
  try {
    const res = await window.api.exportReportPdf(filter);
    if (res.ok) toast('Saved ' + res.count + ' records to PDF.');
    else if (res.reason && res.reason !== 'cancelled') toast(res.reason, true);
  } catch (err) { toast('PDF export failed: ' + err.message, true); }
  btn.disabled = false;
  btn.textContent = 'Export to PDF (best for printing)';
});

$('btn-backup').addEventListener('click', async () => {
  const btn = $('btn-backup');
  btn.disabled = true;
  btn.textContent = 'Backing up...';
  try {
    const res = await window.api.backupDatabase();
    if (res.ok) toast('Backup saved successfully.');
    else if (res.reason && res.reason !== 'cancelled') toast(res.reason, true);
  } catch (err) { toast('Backup failed: ' + err.message, true); }
  btn.disabled = false;
  btn.textContent = 'Backup Database Now';
});

function showView(name) {
  $('view-entry').classList.toggle('hidden', name !== 'entry');
  $('view-history').classList.toggle('hidden', name !== 'history');
  $('view-reports').classList.toggle('hidden', name !== 'reports');
  $('nav-new').classList.toggle('active', name === 'entry');
  $('nav-history').classList.toggle('active', name === 'history');
  $('nav-reports').classList.toggle('active', name === 'reports');
  if (name === 'history') loadHistory($('search').value.trim());
}

let pendingNav = null;
$('nav-new').addEventListener('click', () => { clearForm(); showView('entry'); });
$('nav-history').addEventListener('click', () => {
  if (isDirty()) { pendingNav = 'history'; $('overlay').classList.add('show'); return; }
  showView('history');
});
$('nav-reports').addEventListener('click', () => {
  if (isDirty()) { pendingNav = 'reports'; $('overlay').classList.add('show'); return; }
  showView('reports');
});
$('m-discard').addEventListener('click', () => {
  $('overlay').classList.remove('show');
  clearForm();
  if (pendingNav) { showView(pendingNav); pendingNav = null; }
});
$('m-save').addEventListener('click', () => {
  $('overlay').classList.remove('show');
  pendingNav = null;
  $('btn-save').click();
});

recalc();