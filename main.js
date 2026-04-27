const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PDF 편집 툴',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'PDF 파일 열기',
    filters: [{ name: 'PDF 파일', extensions: ['pdf'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  const fileData = fs.readFileSync(filePaths[0]);
  const arrayBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
  return { buffer: arrayBuffer, name: path.basename(filePaths[0]) };
});

ipcMain.handle('dialog:saveFile', async (_, { buffer, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'PDF 저장',
    defaultPath: defaultName || 'output.pdf',
    filters: [{ name: 'PDF 파일', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return true;
});

ipcMain.handle('dialog:saveFiles', async (_, files) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '저장할 폴더 선택',
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length === 0) return false;
  for (const file of files) {
    fs.writeFileSync(path.join(filePaths[0], file.name), Buffer.from(file.buffer));
  }
  return true;
});
