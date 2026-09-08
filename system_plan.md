# Real Property Tax (RPT) Management System — Project Plan

**Purpose:** Offline desktop application for an LGU Treasurer's Office to record yearly Real Property Tax payments, covering both **BASIC** and **SEF** collections, on a single PC with no login and local data storage.

---

## 1. Technology Framework

| Layer | Choice | Why |
|-------|--------|-----|
| App shell | **Electron** | Packages the HTML/Tailwind UI into a real installable Windows `.exe`. Works fully offline, no browser needed. |
| Database | **SQLite** via `better-sqlite3` | All data in one local file (`rpt_data.db`). Fast, reliable, easy to back up by copying the file. |
| UI | **HTML + Tailwind CSS** (compiled locally, no CDN) | Professional look, offline-ready. |
| Packaging | **electron-builder** | Produces a Windows installer. |
| Export | SheetJS (Excel) + built-in PDF | For paper filing and backup copies. |

**Why not browser-only:** plain HTML in a browser cannot read/write a true local SQLite file, and browser storage can be wiped by clearing cache — unsafe for official records. Electron gives a genuine local database file and a real desktop program.

---

## 2. Data Model

A single payment produces **one BASIC line and one SEF line together** — they share the same header (control no, dates, receipt, period) and differ only in amounts and property identifiers.

```
taxpayers
  id, name, created_at

properties
  id, taxpayer_id, pin, tax_declaration_no,
  property_type (AGRI / RES.LAND / RES.BLDG), location

payments
  id, control_no, date_remitted, date_issued,
  receipt_no, period_covered,           -- free text e.g. "2017-2025"
  period_year_from, period_year_to,      -- for filtering
  taxpayer_id, property_id,

  -- BASIC
  basic_cy_principal, basic_cy_discount_penalty, basic_cy_net_payment,
  basic_py_principal, basic_py_penalty, basic_py_total,

  -- SEF
  sef_cy_principal, sef_cy_discount_penalty, sef_cy_net_payment,
  sef_py_principal, sef_py_penalty, sef_py_total,

  is_deleted,                            -- soft delete
  created_at, updated_at

audit_log
  id, timestamp, action, table_name, record_id,
  old_values (JSON), new_values (JSON)
```

Relationship: **Taxpayer → Properties → Payments (BASIC + SEF on one row).**

---

## 3. Recording Screen (Side-by-Side)

1. Staff searches or adds a **taxpayer**.
2. A modal opens with:
   - **Header strip:** Control No., Date Remitted, Date Issued, Receipt No., Period Covered.
   - **Property selector:** PIN, Tax Declaration No., Type of Property, Location.
   - **Two equal panels:** BASIC (left) and SEF (right), each with:
     - *Current Year:* Principal, Discount/Penalty, Net/Total Payment
     - *Prior Years:* Principal, Penalty, Total
     - Live panel total.
   - **Grand total** at the bottom, auto-calculated.
3. **"Add another period"** button lets staff enter multiple payment rows for the same taxpayer in one session (e.g. one year + a prior-year range) before closing.
4. **Save** writes the complete row(s). No login required.

### Fillable-blanks behavior

- The screen is **blank input fields only**. Every field starts empty on a fresh form; only the totals auto-fill as amounts are typed.
- **Nothing is stored until Save** on a completed row. Only finished data enters the database — no partial drafts.
- **Validation:** required blanks (control no., date, taxpayer, receipt no., period, and the relevant amounts) must be filled or Save stays disabled and missing blanks are highlighted.
- Empty amount blanks are treated as the "–" dash (zero / not applicable) in the printed forms, not saved as clutter.
- **Closing with unfinished blanks:** show a warning — "You have unsaved entries" — with the choice to **go back and save** or **discard**. Nothing is written if they discard.

---

## 3b. Payment History (view & edit records)

- **History list:** scrollable **cards, one per saved payment, showing the taxpayer's name** (with a small sub-line — date remitted / receipt no. — to tell duplicates apart). Searchable by name.
- **Click a card** → opens the full record with everything that was inputted: header, property, BASIC and SEF amounts, and totals.
- **Edit:** any wrong data can be corrected and re-saved. Validation runs again on save.
- Every edit is written to the **audit log** (old → new values) so corrections are traceable, and reports refresh automatically.

---

## 4. Reports (mirror the printed forms)

- **BASIC Collection Report** — grouped by control number, with subtotal rows and grand total.
- **SEF Collection Report** — same layout, showing PIN / Tax Declaration / Type of Property.
- Filter by date remitted, period year, control number, or location.
- Export each to **Excel and PDF** for filing.

---

## 5. Data Safety (high priority)

- **Automatic backups:** copy `rpt_data.db` into `/backups` on every app launch and once daily; keep the last 30.
- **Audit log:** every insert/edit/delete stored with old and new values — nothing lost silently.
- **Soft delete:** records marked inactive, not erased.
- **Confirm-before-delete** dialogs.
- **Manual backup button** to copy the database anywhere (USB, network folder).

---

## 6. Build Phases

1. Scaffold Electron + SQLite + Tailwind; create schema and auto-backup.
2. Taxpayer + property management (add / search / edit).
3. Combined BASIC/SEF recording modal with live totals and "add another period."
4. Records list, filters, and BASIC/SEF report views matching the printed layout.
5. Audit log, delete confirmations, Excel/PDF export.
6. Package into a Windows installer.

---

## 7. Open Questions / Future Options

- Multi-user or multi-PC later? (Current plan is single PC, offline.)
- Do you need an official receipt (OR) printout from the app, or only reports?
- Should totals reconcile against an expected assessment figure per property?