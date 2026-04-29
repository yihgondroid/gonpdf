const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (buffer, defaultName) =>
    ipcRenderer.invoke('dialog:saveFile', { buffer, defaultName }),
  saveFiles: (files) => ipcRenderer.invoke('dialog:saveFiles', files),
  onMenuOpen: (cb) => ipcRenderer.on('menu:open', cb),
  onMenuSave: (cb) => ipcRenderer.on('menu:save', cb),
  onMenuUndo: (cb) => ipcRenderer.on('menu:undo', cb),
  onMenuRedo: (cb) => ipcRenderer.on('menu:redo', cb),
});
