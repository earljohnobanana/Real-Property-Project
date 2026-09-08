# RPT Management — Prototype

Offline desktop app (Electron + SQLite) for recording Real Property Tax
BASIC and SEF payments in an LGU Treasurer's Office. Single PC, no login.

## What works in this prototype
- One screen to record BASIC + SEF side by side, with live totals.
- Blank fillable form; nothing is saved until you press **Save Record**.
- Validation: required blanks highlight red; at least one amount required.
- Unsaved-changes warning when leaving the form (save or discard).
- **Payment History**: name cards — click one to view and edit the record.
- Edit and Delete existing records (soft delete + audit log).
- Local SQLite file + automatic daily backup (last 30 kept).

## Where the data lives
`rpt_data.db` is stored in Electron's userData folder:
`C:\Users\<you>\AppData\Roaming\rpt-management\`
Daily backups are in the `backups` subfolder there.

---

# Step-by-step: run it in VS Code

## 1. Install the tools (one-time, needs internet)
- Install **Node.js LTS**: https://nodejs.org  (this also installs npm)
- Install **VS Code**: https://code.visualstudio.com
- Windows only: install build tools so the SQLite native module compiles.
  Open **PowerShell as Administrator** and run:
  ```
  npm install --global windows-build-tools
  ```
  (On newer setups this is usually already covered by installing Node with the
  "Tools for Native Modules" checkbox ticked during install.)

## 2. Open the project
- Copy the `rpt-app` folder somewhere permanent, e.g. `C:\rpt-app`.
- In VS Code: **File → Open Folder…** and choose that folder.

## 3. Open the terminal in VS Code
- Menu: **Terminal → New Terminal** (or Ctrl+`).

## 4. Install dependencies (needs internet, one-time)
```
npm install
```
This downloads Electron and better-sqlite3 and rebuilds SQLite for Electron
(the `postinstall` script does the rebuild automatically).

## 5. Run the app
```
npm start
```
The RPT Management window opens. Try adding an entry, saving, then check the
History tab. From now on the app runs fully offline.

## 6. (Later) Build a Windows installer
```
npm run dist
```
Produces a setup `.exe` in the `dist` folder that you can install on the
office PC. After that, the office PC needs no internet at all.

---

## Troubleshooting
- **"better-sqlite3 was compiled against a different Node/Electron"**
  Run: `npm run rebuild`  then `npm start` again.
- **Blank window / errors**: open DevTools with Ctrl+Shift+I to see messages.