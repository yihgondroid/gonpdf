const { app, BrowserWindow, ipcMain, dialog, Menu, protocol } = require('electron');

// pdffile:// 커스텀 프로토콜 (스트리밍용) — must be before ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'pdffile', privileges: { bypassCSP: true, supportFetchAPI: true } }
]);
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

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
    {
      label: '업데이트',
      submenu: [
        {
          label: '업데이트 확인',
          click: () => checkForUpdates(win),
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

app.whenReady().then(() => {
  // Range 요청 지원 파일 스트리밍 프로토콜
  protocol.handle('pdffile', async (request) => {
    try {
      const filePath = decodeURIComponent(request.url.slice('pdffile://'.length));
      const stat = fs.statSync(filePath);
      const size = stat.size;
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (m) {
          const start = parseInt(m[1], 10);
          const end   = m[2] ? parseInt(m[2], 10) : size - 1;
          const len   = end - start + 1;
          const buf   = Buffer.allocUnsafe(len);
          const fd    = fs.openSync(filePath, 'r');
          fs.readSync(fd, buf, 0, len, start);
          fs.closeSync(fd);
          return new Response(buf, {
            status: 206,
            headers: {
              'Content-Type':  'application/pdf',
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(len),
            }
          });
        }
      }
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type':  'application/pdf',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size),
        }
      });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  });
  createWindow();
});

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
  try {
    const fileData = fs.readFileSync(filePaths[0]);
    const arrayBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
    return { buffer: arrayBuffer, filePath: filePaths[0], name: path.basename(filePaths[0]) };
  } catch (err) {
    throw new Error('파일을 읽을 수 없습니다: ' + err.message);
  }
});

ipcMain.handle('dialog:saveFile', async (_, { buffer, defaultName }) => {
  const filePath = await showSaveDialogWithPath(defaultName);
  if (!filePath) return false;
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return true;
  } catch (err) {
    throw new Error('파일 저장 실패: ' + err.message);
  }
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
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return true;
  } catch (err) {
    throw new Error('파일 저장 실패: ' + err.message);
  }
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
  try {
    for (const file of files) {
      fs.writeFileSync(path.join(filePaths[0], file.name), Buffer.from(file.buffer));
    }
    lastDirectory = filePaths[0];
    return true;
  } catch (err) {
    throw new Error('파일 저장 실패: ' + err.message);
  }
});

function generateUniqueName(folderPath, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let i = 1;
  let candidate;
  do {
    candidate = base + '_' + i + ext;
    i++;
  } while (fs.existsSync(path.join(folderPath, candidate)));
  return candidate;
}

ipcMain.handle('dialog:selectSaveFolder', async (_, fileNames) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: '저장할 폴더 선택',
    properties: ['openDirectory'],
    ...(lastDirectory ? { defaultPath: lastDirectory } : {}),
  });
  if (canceled || filePaths.length === 0) return null;
  const folderPath = filePaths[0];
  lastDirectory = folderPath;
  const conflicts = [];
  for (const name of fileNames) {
    if (fs.existsSync(path.join(folderPath, name))) {
      conflicts.push({ original: name, suggested: generateUniqueName(folderPath, name) });
    }
  }
  return { folderPath, conflicts };
});

ipcMain.handle('dialog:saveFilesToFolder', async (_, { folderPath, files }) => {
  try {
    for (const file of files) {
      fs.writeFileSync(path.join(folderPath, file.name), Buffer.from(file.buffer));
    }
    return true;
  } catch (err) {
    throw new Error('파일 저장 실패: ' + err.message);
  }
});

ipcMain.handle('dialog:openFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: 'PDF 및 이미지 파일 열기',
    filters: [
      { name: 'PDF 및 이미지', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'] },
      { name: 'PDF 파일', extensions: ['pdf'] },
      { name: '이미지 파일', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'] },
    ],
    properties: ['openFile', 'multiSelections'],
    ...(lastDirectory ? { defaultPath: lastDirectory } : {}),
  });
  if (canceled || filePaths.length === 0) return null;
  lastDirectory = path.dirname(filePaths[0]);
  const results = [];
  for (const fp of filePaths) {
    try {
      const fileData = fs.readFileSync(fp);
      const stat = fs.statSync(fp);
      const arrayBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
      results.push({ buffer: arrayBuffer, name: path.basename(fp), size: stat.size, modified: stat.mtime.toISOString() });
    } catch (err) {
      console.error('[main] 파일 읽기 실패:', fp, err.message);
    }
  }
  return results.length > 0 ? results : null;
});

function checkForUpdates(win) {
  autoUpdater.removeAllListeners();

  autoUpdater.on('update-not-available', () => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '업데이트 확인',
      message: '현재 최신 버전입니다.',
      detail: `버전: v${app.getVersion()}`,
    });
  });

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '업데이트 발견',
      message: `새 버전 v${info.version}이 있습니다.`,
      detail: '다운로드를 시작합니다...',
      buttons: ['다운로드', '나중에'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
        dialog.showMessageBox(win, {
          type: 'info',
          title: '다운로드 중',
          message: '백그라운드에서 업데이트를 다운로드하고 있습니다.',
          detail: '완료되면 알림이 표시됩니다.',
        });
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: '업데이트 준비 완료',
      message: '업데이트 다운로드가 완료되었습니다.',
      detail: '지금 재시작하여 설치하시겠습니까?',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    dialog.showMessageBox(win, {
      type: 'error',
      title: '업데이트 오류',
      message: '업데이트 확인 중 오류가 발생했습니다.',
      detail: err.message,
    });
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

ipcMain.handle('dialog:openFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: '폴더 선택',
    properties: ['openDirectory'],
    ...(lastDirectory ? { defaultPath: lastDirectory } : {}),
  });
  if (canceled || filePaths.length === 0) return null;
  const folderPath = filePaths[0];
  lastDirectory = folderPath;
  const supportedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];
  const entries = fs.readdirSync(folderPath);
  const pdfNames = entries.filter(function(e) {
    return supportedExts.includes(path.extname(e).toLowerCase());
  }).sort();
  const folderResults = [];
  for (const name of pdfNames) {
    try {
      const fp = path.join(folderPath, name);
      const fileData = fs.readFileSync(fp);
      const stat = fs.statSync(fp);
      const arrayBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
      folderResults.push({ buffer: arrayBuffer, name, size: stat.size, modified: stat.mtime.toISOString() });
    } catch (err) {
      console.error('[main] 파일 읽기 실패:', name, err.message);
    }
  }
  return folderResults.length > 0 ? folderResults : null;
});
