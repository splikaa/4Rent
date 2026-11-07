const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function createMainWindow() {
  const iconPath = path.join(__dirname, '..', 'public', '4rent-icon.ico');
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 380,
    minHeight: 640,
    title: '4Rent Management System',
    backgroundColor: '#0B0E14',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  // Prevent external links (like m.me Messenger links) from opening inside the app shell
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(`${devServerUrl}?desktop=1`);
  } else if (fs.existsSync(distIndex)) {
    win.loadFile(distIndex, { query: { desktop: '1' } });
  } else {
    win.loadURL('https://splikaa.github.io/4Rent/?desktop=1');
  }
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
