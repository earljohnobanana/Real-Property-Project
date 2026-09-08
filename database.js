const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

let db;

function init(userDataPath) {
  const dbPath = path.join(userDataPath, 'rpt_data.db');
  autoBackup(userDataPath, dbPath);
  db = new Database(dbPath);
  createSchema();
  migrate();
  return db;
}

function autoBackup(userDataPath, dbPath) {
  if (!fs.existsSync(dbPath)) return;
  const backupDir = path.join(userDataPath, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const dest = path.join(backupDir, `rpt_data_${stamp}.db`);
  if (!fs.existsSync(dest)) fs.copyFileSync(dbPath, dest);
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort();
  while (files.length > 30) fs.unlinkSync(path.join(backupDir, files.shift()));
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS taxpayers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      control_no TEXT, date_remitted TEXT, date_issued TEXT,
      receipt_no TEXT, period_covered TEXT,
      taxpayer_id INTEGER NOT NULL,
      pin TEXT, tax_declaration_no TEXT, property_type TEXT, location TEXT,
      basic_cy_principal REAL DEFAULT 0, basic_cy_discount_penalty REAL DEFAULT 0, basic_cy_net_payment REAL DEFAULT 0,
      basic_cy_discount REAL DEFAULT 0, basic_cy_penalty REAL DEFAULT 0,
      basic_py_principal REAL DEFAULT 0, basic_py_penalty REAL DEFAULT 0, basic_py_total REAL DEFAULT 0,
      sef_cy_principal REAL DEFAULT 0, sef_cy_discount_penalty REAL DEFAULT 0, sef_cy_net_payment REAL DEFAULT 0,
      sef_cy_discount REAL DEFAULT 0, sef_cy_penalty REAL DEFAULT 0,
      sef_py_principal REAL DEFAULT 0, sef_py_penalty REAL DEFAULT 0, sef_py_total REAL DEFAULT 0,
      status TEXT DEFAULT 'Payment',
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now','localtime')),
      action TEXT, record_id INTEGER, old_values TEXT, new_values TEXT
    );
  `);
}

// Adds new columns to older databases without touching existing data.
function migrate() {
  const cols = db.all('PRAGMA table_info(payments)').map(c => c.name);
  if (!cols.includes('status')) {
    db.exec("ALTER TABLE payments ADD COLUMN status TEXT DEFAULT 'Payment'");
  }
  // Split the combined Current-Year Disc./Pen. into separate Discount + Penalty columns.
  const splitCols = [
    ['basic_cy_discount', 'basic_cy_penalty', 'basic_cy_discount_penalty'],
    ['sef_cy_discount', 'sef_cy_penalty', 'sef_cy_discount_penalty']
  ];
  let added = false;
  splitCols.forEach(([disc, pen]) => {
    if (!cols.includes(disc)) { db.exec(`ALTER TABLE payments ADD COLUMN ${disc} REAL DEFAULT 0`); added = true; }
    if (!cols.includes(pen))  { db.exec(`ALTER TABLE payments ADD COLUMN ${pen} REAL DEFAULT 0`);  added = true; }
  });
  if (added) {
    // Backfill from existing combined values. Combined negative = discount (stored
    // as a positive magnitude); combined positive = penalty.
    splitCols.forEach(([disc, pen, combined]) => {
      db.exec(`UPDATE payments SET ${disc} = CASE WHEN ${combined} < 0 THEN -${combined} ELSE 0 END,
                                   ${pen}  = CASE WHEN ${combined} > 0 THEN ${combined} ELSE 0 END
               WHERE ${disc} = 0 AND ${pen} = 0`);
    });
  }
}

function findOrCreateTaxpayer(name) {
  const clean = (name || 'UNNAMED').trim();
  const found = db.get('SELECT id FROM taxpayers WHERE name = ?', [clean]);
  if (found) return Number(found.id);
  const info = db.run('INSERT INTO taxpayers (name) VALUES (?)', [clean]);
  return Number(info.lastInsertRowid);
}

function logAudit(action, recordId, oldValues, newValues) {
  db.run('INSERT INTO audit_log (action, record_id, old_values, new_values) VALUES (?,?,?,?)',
    [action, recordId, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null]);
}

const PAYMENT_FIELDS = [
  'control_no','date_remitted','date_issued','receipt_no','period_covered',
  'pin','tax_declaration_no','property_type','location',
  'basic_cy_principal','basic_cy_discount_penalty','basic_cy_net_payment',
  'basic_cy_discount','basic_cy_penalty',
  'basic_py_principal','basic_py_penalty','basic_py_total',
  'sef_cy_principal','sef_cy_discount_penalty','sef_cy_net_payment',
  'sef_cy_discount','sef_cy_penalty',
  'sef_py_principal','sef_py_penalty','sef_py_total',
  'status'
];
const AMOUNT_RE = /principal|penalty|payment|discount|total/;

function valueFor(data, f) {
  if (AMOUNT_RE.test(f)) return Number(data[f]) || 0;
  return data[f] ?? '';
}

function savePayment(data) {
  const taxpayerId = findOrCreateTaxpayer(data.taxpayer_name);
  const cols = ['taxpayer_id', ...PAYMENT_FIELDS];
  const placeholders = cols.map(() => '?').join(',');
  const values = [taxpayerId, ...PAYMENT_FIELDS.map(f => valueFor(data, f))];
  const info = db.run(`INSERT INTO payments (${cols.join(',')}) VALUES (${placeholders})`, values);
  const id = Number(info.lastInsertRowid);
  logAudit('INSERT', id, null, data);
  return id;
}

function updatePayment(id, data) {
  const old = db.get('SELECT * FROM payments WHERE id = ?', [id]);
  const taxpayerId = findOrCreateTaxpayer(data.taxpayer_name);
  const sets = ['taxpayer_id = ?', ...PAYMENT_FIELDS.map(f => `${f} = ?`), "updated_at = datetime('now','localtime')"];
  const values = [taxpayerId, ...PAYMENT_FIELDS.map(f => valueFor(data, f)), id];
  db.run(`UPDATE payments SET ${sets.join(',')} WHERE id = ?`, values);
  logAudit('UPDATE', id, old, data);
  return true;
}

function deletePayment(id) {
  const old = db.get('SELECT * FROM payments WHERE id = ?', [id]);
  db.run('UPDATE payments SET is_deleted = 1 WHERE id = ?', [id]);
  logAudit('DELETE', id, old, null);
  return true;
}

function listPayments(search) {
  let sql = `SELECT p.*, t.name AS taxpayer_name
    FROM payments p JOIN taxpayers t ON t.id = p.taxpayer_id
    WHERE p.is_deleted = 0`;
  const params = [];
  if (search) {
    // Match taxpayer name, control no., receipt (OR) no., or tax declaration no.
    sql += ' AND (t.name LIKE ? OR p.control_no LIKE ? OR p.receipt_no LIKE ? OR p.tax_declaration_no LIKE ?)';
    const like = '%' + search + '%';
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY p.id DESC';
  return db.all(sql, params);
}

function getPayment(id) {
  return db.get(`SELECT p.*, t.name AS taxpayer_name
    FROM payments p JOIN taxpayers t ON t.id = p.taxpayer_id WHERE p.id = ?`, [id]);
}

function searchTaxpayers(term) {
  return db.all('SELECT name FROM taxpayers WHERE name LIKE ? ORDER BY name LIMIT 10', ['%' + term + '%'])
    .map(r => r.name);
}

module.exports = { init, savePayment, updatePayment, deletePayment, listPayments, getPayment, searchTaxpayers };