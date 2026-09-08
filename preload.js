const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listPayments: (search) => ipcRenderer.invoke('payments:list', search),
  getPayment: (id) => ipcRenderer.invoke('payments:get', id),
  savePayment: (data) => ipcRenderer.invoke('payments:save', data),
  updatePayment: (id, data) => ipcRenderer.invoke('payments:update', id, data),
  deletePayment: (id) => ipcRenderer.invoke('payments:delete', id),
  searchTaxpayers: (term) => ipcRenderer.invoke('taxpayers:search', term),
  exportReport: (filter) => ipcRenderer.invoke('report:export', filter),
  exportReportPdf: (filter) => ipcRenderer.invoke('report:pdf', filter),
  backupDatabase: () => ipcRenderer.invoke('db:backup')
});