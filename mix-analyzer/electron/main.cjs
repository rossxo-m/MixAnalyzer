const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Mix Analyzer',
    backgroundColor: '#0a0a14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Allow Web Audio API (already enabled by default in Electron/Chromium)
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
