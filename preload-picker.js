const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  selectSource: (sourceId) => ipcRenderer.send('source-selected', sourceId)
});
