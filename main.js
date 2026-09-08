const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { buildWorkbook, buildReportHtml } = require('./report');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'RPT Management',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function filterRows(filter) {
  const all = db.listPayments('');
  const from = filter && filter.from;
  const to = filter && filter.to;
  return all.filter(row => {
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

// The GRAND TOTAL always covers the WHOLE month of the selected dates
// (1st to last day), even if only a few days are listed in the detail rows.
function grandFilterFor(filter) {
  const ref = (filter && filter.from) || (filter && filter.to);
  if (!ref) return { from: undefined, to: undefined };
  const year = parseInt(ref.slice(0, 4), 10);
  const month = ref.slice(5, 7);                       // "01".."12"
  const lastDay = new Date(year, parseInt(month, 10), 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`
  };
}

app.whenReady().then(() => {
  db.init(app.getPath('userData'));

  ipcMain.handle('payments:list', (e, search) => db.listPayments(search));
  ipcMain.handle('payments:get', (e, id) => db.getPayment(id));
  ipcMain.handle('payments:save', (e, data) => db.savePayment(data));
  ipcMain.handle('payments:update', (e, id, data) => db.updatePayment(id, data));
  ipcMain.handle('payments:delete', (e, id) => db.deletePayment(id));
  ipcMain.handle('taxpayers:search', (e, term) => db.searchTaxpayers(term));

  ipcMain.handle('report:export', async (e, filter) => {
    const rows = filterRows(filter);
    if (!rows.length) return { ok: false, reason: 'No records for the selected period.' };
    const gf = grandFilterFor(filter);
    const grandRows = filterRows(gf);
    const wb = await buildWorkbook(rows, { ...filter, grandFrom: gf.from, grandTo: gf.to }, grandRows);
    const stamp = [filter && filter.from, filter && filter.to].filter(Boolean).join('_to_') || 'all';
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save RPT Report',
      defaultPath: `RPT_Report_${stamp}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
    await wb.xlsx.writeFile(filePath);
    return { ok: true, path: filePath, count: rows.length };
  });

  ipcMain.handle('db:backup', async () => {
    const src = path.join(app.getPath('userData'), 'rpt_data.db');
    if (!fs.existsSync(src)) return { ok: false, reason: 'No data to back up yet.' };
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Backup Database',
      defaultPath: `RPT_backup_${stamp}.db`,
      filters: [{ name: 'Database File', extensions: ['db'] }]
    });
    if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
    fs.copyFileSync(src, filePath);
    return { ok: true, path: filePath };
  });

  ipcMain.handle('report:pdf', async (e, filter) => {
    const rows = filterRows(filter);
    if (!rows.length) return { ok: false, reason: 'No records for the selected period.' };
    const gf = grandFilterFor(filter);
    const grandRows = filterRows(gf);
    const html = buildReportHtml(rows, { ...filter, grandFrom: gf.from, grandTo: gf.to }, grandRows);
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const data = await pdfWin.webContents.printToPDF({
      landscape: true, pageSize: 'Legal', printBackground: true,
      margins: { top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 }
    });
    pdfWin.destroy();
    const stamp = [filter && filter.from, filter && filter.to].filter(Boolean).join('_to_') || 'all';
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save RPT Report (PDF)',
      defaultPath: `RPT_Report_${stamp}.pdf`,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
    fs.writeFileSync(filePath, data);
    return { ok: true, path: filePath, count: rows.length };
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});