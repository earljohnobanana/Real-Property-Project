/* ============================================================================
 * RPT Management - web server (LAN)
 * ----------------------------------------------------------------------------
 * Wraps the existing database.js (node-sqlite3-wasm) as a small REST API and
 * serves the renderer/ UI to browsers, so the app can run on one server PC and
 * be used from any client at  http://<server-ip>:4000
 * ==========================================================================*/
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { buildWorkbook, buildReportHtml } = require('./report');

// ── Where the database + daily backups live ──
const DATA_DIR = process.env.RPT_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
db.init(DATA_DIR);

const app = express();
app.use(express.json({ limit: '2mb' }));

// ── Report helpers (moved verbatim from the old Electron main.js) ──
function filterRows(filter) {
  const all = db.listPayments('');
  const from = filter && filter.from;
  const to = filter && filter.to;
  return all.filter((row) => {
    const d = row.date_remitted || '';
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }).sort((a, b) => {
    const dd = (a.date_remitted || '').localeCompare(b.date_remitted || '');
    if (dd !== 0) return dd;
    return (a.control_no || '').localeCompare(b.control_no || '', undefined, { numeric: true });
  });
}
function grandFilterFor(filter) {
  const ref = (filter && filter.from) || (filter && filter.to);
  if (!ref) return { from: undefined, to: undefined };
  const year = parseInt(ref.slice(0, 4), 10);
  const month = ref.slice(5, 7);
  const lastDay = new Date(year, parseInt(month, 10), 0).getDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(lastDay).padStart(2, '0')}` };
}

// ── Health ──
app.get('/api/health', (_req, res) => res.json({ ok: true, count: db.listPayments('').length }));

// ── Payments API ──
app.get('/api/payments', (req, res) => res.json(db.listPayments(req.query.search || '')));
app.get('/api/payments/:id', (req, res) => {
  const r = db.getPayment(Number(req.params.id));
  if (!r) return res.status(404).json({ message: 'Not found' });
  res.json(r);
});
app.post('/api/payments', (req, res) => res.status(201).json({ id: db.savePayment(req.body) }));
app.put('/api/payments/:id', (req, res) => { db.updatePayment(Number(req.params.id), req.body); res.json({ ok: true }); });
app.delete('/api/payments/:id', (req, res) => { db.deletePayment(Number(req.params.id)); res.json({ ok: true }); });
app.get('/api/taxpayers/search', (req, res) => res.json(db.searchTaxpayers(req.query.term || '')));

// ── Excel report (streamed as a download) ──
app.post('/api/report/export', async (req, res) => {
  const filter = req.body || {};
  const rows = filterRows(filter);
  if (!rows.length) return res.json({ ok: false, reason: 'No records for the selected period.' });
  const gf = grandFilterFor(filter);
  const grandRows = filterRows(gf);
  const wb = await buildWorkbook(rows, { ...filter, grandFrom: gf.from, grandTo: gf.to }, grandRows);
  const stamp = [filter.from, filter.to].filter(Boolean).join('_to_') || 'all';
  res.setHeader('Content-Disposition', `attachment; filename="RPT_Report_${stamp}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('X-Record-Count', String(rows.length));
  res.setHeader('Access-Control-Expose-Headers', 'X-Record-Count');
  await wb.xlsx.write(res);
  res.end();
});

// ── PDF report (returns printable HTML; the browser prints/saves as PDF) ──
app.post('/api/report/pdf', (req, res) => {
  const filter = req.body || {};
  const rows = filterRows(filter);
  if (!rows.length) return res.json({ ok: false, reason: 'No records for the selected period.' });
  const gf = grandFilterFor(filter);
  const grandRows = filterRows(gf);
  const html = buildReportHtml(rows, { ...filter, grandFrom: gf.from, grandTo: gf.to }, grandRows);
  res.json({ ok: true, count: rows.length, html });
});

// ── Manual backup (downloads a copy of the live database) ──
app.get('/api/backup', (req, res) => {
  const src = path.join(DATA_DIR, 'rpt_data.db');
  if (!fs.existsSync(src)) return res.status(404).json({ ok: false, reason: 'No data to back up yet.' });
  const stamp = new Date().toISOString().slice(0, 10);
  res.download(src, `RPT_backup_${stamp}.db`);
});

// ── Serve the UI ──
app.use(express.static(path.join(__dirname, 'renderer')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ message: 'Not found' });
  res.sendFile(path.join(__dirname, 'renderer', 'index.html'));
});

// Safety net: never let one bad request crash the whole server
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RPT server running at http://0.0.0.0:${PORT}  (LAN reachable)`);
  console.log(`Data dir: ${DATA_DIR}`);
});
