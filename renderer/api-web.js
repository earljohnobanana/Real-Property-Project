/* Web shim: provides window.api (previously supplied by Electron's preload)
   by calling the server over HTTP. This lets renderer.js run unchanged in a
   normal browser over the network. */
(function () {
  const BASE = '/api';

  async function j(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      let msg = 'Request failed (' + r.status + ')';
      try { const b = await r.json(); if (b && b.message) msg = b.message; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }
  const jsonBody = (data) => ({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function filenameFrom(r, fallback) {
    const cd = r.headers.get('content-disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/);
    return m ? m[1] : fallback;
  }

  window.api = {
    listPayments: (search) => j(`${BASE}/payments?search=${encodeURIComponent(search || '')}`),
    getPayment: (id) => j(`${BASE}/payments/${id}`),
    savePayment: (data) => j(`${BASE}/payments`, jsonBody(data)).then((r) => r.id),
    updatePayment: (id, data) => j(`${BASE}/payments/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }).then(() => true),
    deletePayment: (id) => j(`${BASE}/payments/${id}`, { method: 'DELETE' }).then(() => true),
    searchTaxpayers: (term) => j(`${BASE}/taxpayers/search?term=${encodeURIComponent(term || '')}`),

    exportReport: async (filter) => {
      const r = await fetch(`${BASE}/report/export`, jsonBody(filter));
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/json')) return r.json();   // {ok:false, reason}
      const count = r.headers.get('X-Record-Count') || '';
      downloadBlob(await r.blob(), filenameFrom(r, 'RPT_Report.xlsx'));
      return { ok: true, count };
    },

    exportReportPdf: async (filter) => {
      const r = await j(`${BASE}/report/pdf`, jsonBody(filter));
      if (!r.ok) return r;
      const w = window.open('', '_blank');
      if (w) {
        w.document.open(); w.document.write(r.html); w.document.close(); w.focus();
        setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
      }
      return { ok: true, count: r.count };
    },

    backupDatabase: async () => {
      const r = await fetch(`${BASE}/backup`);
      if (!r.ok) {
        try { const b = await r.json(); return { ok: false, reason: b.reason || 'Backup failed' }; }
        catch { return { ok: false, reason: 'Backup failed' }; }
      }
      downloadBlob(await r.blob(), filenameFrom(r, 'RPT_backup.db'));
      return { ok: true };
    },
  };
})();
