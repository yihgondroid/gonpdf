const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWin = null;
let lastDirectory = null;

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

  const menu = Menu.buildFromTemplate([
    {
      label: '파일',
      submenu: [
        {
          label: '열기',
          accelerator: 'CmdOrCtrl+O',
          click: () => win.webContents.send('menu:open'),
        },
        {
          label: '저장',
          accelerator: 'CmdOrCtrl+S',
          click: () => win.webContents.send('menu:save'),
        },
        { type: 'separator' },
        {
          label: '종료',
          accelerator: 'Alt+F4',
          role: 'quit',
        },
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', accelerator: 'CmdOrCtrl+Z', click: () => win.webContents.send('menu:undo') },
        { label: '다시 실행', accelerator: 'CmdOrCtrl+Y', click: () => win.webContents.send('menu:redo') },
        { type: 'separator' },
        { label: '잘라내기', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '복사', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '붙여넣기', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '새로 고침', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { type: 'separator' },
        { label: '확대', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '축소', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '기본 크기', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '전체화면', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: '개발자 도구', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        {
          label: 'PDF 편집 툴 정보',
          click: () => dialog.showMessageBox(win, {
            title: 'PDF 편집 툴',
            message: 'PDF 편집 툴 v1.0.0',
            detail: 'PDF 파일 편집, 합치기, 나누기, 자동 분류 기능을 제공합니다.',
          }),
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
  win.loadFile('renderer/index.html');

  win.on('close', (e) => {
    e.preventDefault();
    win.webContents.send('app:will-close');
  });

  mainWin = win;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: 'PDF 파일 열기',
    filters: [{ name: 'PDF 파일', extensions: ['pdf'] }],
    properties: ['openFile'],
    ...(lastDirectory ? { defaultPath: lastDirectory } : {}),
  });
  if (canceled || filePaths.length === 0) return null;
  lastDirectory = path.dirname(filePaths[0]);
  const fileData = fs.readFileSync(filePaths[0]);
  const arrayBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
  return { buffer: arrayBuffer, name: path.basename(filePaths[0]) };
});

ipcMain.handle('dialog:saveFile', async (_, { buffer, defaultName }) => {
  const filePath = await showSaveDialogWithPath(defaultName);
  if (!filePath) return false;
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return true;
});

async function showSaveDialogWithPath(defaultName) {
  const defaultPath = lastDirectory
    ? path.join(lastDirectory, defaultName || 'output.pdf')
    : (defaultName || 'output.pdf');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
    title: 'PDF 저장',
    defaultPath,
    filters: [{ name: 'PDF 파일', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;
  lastDirectory = path.dirname(filePath);
  return filePath;
}

ipcMain.handle('dialog:saveFileFromClose', async (_, { buffer, defaultName }) => {
  await new Promise(resolve => setTimeout(resolve, 150));
  if (mainWin && !mainWin.isDestroyed()) mainWin.focus();
  const filePath = await showSaveDialogWithPath(defaultName);
  if (!filePath) return false;
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return true;
});

ipcMain.handle('dialog:confirmClose', async (_, filename) => {
  const { response } = await dialog.showMessageBox(mainWin, {
    type: 'warning',
    title: 'PDF 편집 툴',
    message: `${filename}의 변경사항을 저장하시겠습니까?`,
    buttons: ['예(Y)', '아니오(N)', '취소'],
    defaultId: 0,
    cancelId: 2,
  });
  return response;
});

ipcMain.on('app:close', () => {
  if (mainWin) mainWin.destroy();
});

ipcMain.handle('dialog:saveFiles', async (_, files) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: '저장할 폴더 선택',
    properties: ['openDirectory'],
    ...(lastDirectory ? { defaultPath: lastDirectory } : {}),
  });
  if (canceled || filePaths.length === 0) return false;
  for (const file of files) {
    fs.writeFileSync(path.join(filePaths[0], file.name), Buffer.from(file.buffer));
  }
  lastDirectory = filePaths[0];
  return true;
});
