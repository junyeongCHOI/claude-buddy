const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  onEvent: (cb) => ipcRenderer.on('buddy:event', (_e, msg) => cb(msg)),
  ready: () => ipcRenderer.send('buddy:ready'),
  setInteractive: (on, viewId) => ipcRenderer.send('buddy:interactive', !!on, String(viewId ?? '')),
  openSession: (sessionId) => ipcRenderer.send('buddy:open-session', String(sessionId ?? '')),
  showView: (viewId, on) => ipcRenderer.send('buddy:view-visible', String(viewId ?? ''), !!on),
  setConfig: (patch) => ipcRenderer.send('buddy:set-config', patch),
  openMenu: (x, y, viewId) => ipcRenderer.send('buddy:menu', Number(x) || 0, Number(y) || 0, String(viewId ?? '')),
});
