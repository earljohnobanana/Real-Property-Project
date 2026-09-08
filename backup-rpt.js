#!/usr/bin/env node
/* ============================================================================
 * RPT Management - safe database backup (VACUUM INTO, WAL-safe consistent copy)
 * Verifies each snapshot, keeps the newest 30, and (if a USB with an
 * "RPTBackups" folder is present) copies the snapshot off-device too.
 * ==========================================================================*/
'use strict';

const path = require('path');
const fs = require('fs');

const PROJECT_DIR = __dirname;
const DATA_DIR    = process.env.RPT_DATA_DIR || path.join(PROJECT_DIR, 'data');
const LIVE_DB     = path.join(DATA_DIR, 'rpt_data.db');
const BACKUP_DIR  = path.join(PROJECT_DIR, 'backups');
const KEEP_COPIES = Number(process.env.RPT_BACKUP_KEEP) || 30;
const LOG_FILE    = path.join(BACKUP_DIR, 'backup.log');
const USB_MARKER  = 'RPTBackups';

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\r\n'); } catch {}
}

let Database;
try { ({ Database } = require(path.join(PROJECT_DIR, 'node_modules', 'node-sqlite3-wasm'))); }
catch { try { ({ Database } = require('node-sqlite3-wasm')); }
  catch { log('FATAL: cannot load node-sqlite3-wasm.'); process.exit(2); } }

function findUsbDir() {
  for (let c = 'D'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const dir = `${String.fromCharCode(c)}:\\${USB_MARKER}`;
    try { if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir; } catch {}
  }
  return null;
}
function copyToUsb(localBackupPath) {
  const usbDir = findUsbDir();
  if (!usbDir) { log(`NOTE: USB not detected (no "${USB_MARKER}" folder) - laptop copy only.`); return; }
  try {
    fs.copyFileSync(localBackupPath, path.join(usbDir, path.basename(localBackupPath)));
    log(`USB copy saved to ${usbDir}`);
    const files = fs.readdirSync(usbDir).filter((f) => /^rpt_.*\.db$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(usbDir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const old of files.slice(KEEP_COPIES)) fs.unlinkSync(path.join(usbDir, old.f));
  } catch (e) { log(`WARN: USB copy failed: ${e.message}`); }
}

function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(LIVE_DB)) { log(`FATAL: database not found at ${LIVE_DB}`); process.exit(3); }

  const outPath = path.join(BACKUP_DIR, `rpt_${stamp()}.db`);

  try {
    const src = new Database(LIVE_DB);
    src.exec(`VACUUM INTO '${outPath.replace(/'/g, "''")}'`);
    src.close();
  } catch (e) { log(`FATAL: snapshot failed: ${e.message}`); process.exit(4); }

  try {
    const chk = new Database(outPath);
    const integ = chk.get('PRAGMA integrity_check');
    const ok = integ && (integ.integrity_check === 'ok');
    const cnt = chk.get('SELECT COUNT(*) c FROM payments').c;
    chk.close();
    if (!ok) { fs.unlinkSync(outPath); log(`FAILED integrity check - bad backup deleted.`); process.exit(5); }
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    log(`OK  ${path.basename(outPath)}  (${kb} KB | payments=${cnt})`);
  } catch (e) {
    try { fs.unlinkSync(outPath); } catch {}
    log(`FATAL: verification error: ${e.message}`); process.exit(6);
  }

  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^rpt_.*\.db$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const old of files.slice(KEEP_COPIES)) { fs.unlinkSync(path.join(BACKUP_DIR, old.f)); log(`rotated out ${old.f}`); }
  } catch (e) { log(`WARN: rotation issue: ${e.message}`); }

  copyToUsb(outPath);
  log(`Backup complete. Keeping newest ${KEEP_COPIES} in ${BACKUP_DIR}`);
}

main();
