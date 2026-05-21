const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFile: (buffer, defaultName) =>
    ipcRenderer.invoke('dialog:saveFile', { buffer, defaultName }),
  saveFiles: (files) => ipcRenderer.invoke('dialog:saveFiles', files),
  selectSaveFolder: (fileNames) => ipcRenderer.invoke('dialog:selectSaveFolder', fileNames),
  saveFilesToFolder: (folderPath, files) => ipcRenderer.invoke('dialog:saveFilesToFolder', { folderPath, files }),
  onMenuOpen: (cb) => ipcRenderer.on('menu:open', cb),
  onMenuSave: (cb) => ipcRenderer.on('menu:save', cb),
  onMenuUndo: (cb) => ipcRenderer.on('menu:undo', cb),
  onMenuRedo: (cb) => ipcRenderer.on('menu:redo', cb),
  saveFileFromClose: (buffer, defaultName) => ipcRenderer.invoke('dialog:saveFileFromClose', { buffer, defaultName }),
  confirmClose: (filename) => ipcRenderer.invoke('dialog:confirmClose', filename),
  closeApp: () => ipcRenderer.send('app:close'),
  onWillClose: (cb) => ipcRenderer.on('app:will-close', cb),
});
