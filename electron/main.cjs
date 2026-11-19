const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  ipcMain,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_TITLE = '4Rent Management System';
const isMac = process.platform === 'darwin';

let mainWindow = null;

function resolveAppIconPath() {
  const candidates = isMac
    ? [
        path.join(__dirname, '..', 'build', 'icon.png'),
        path.join(__dirname, '..', 'dist', 'icon-512.png'),
        path.join(__dirname, '..', 'public', 'icon-512.png'),
      ]
    : process.platform === 'win32'
    ? [
        path.join(__dirname, '..', 'build', 'icon.ico'),
        path.join(__dirname, '..', 'dist', '4rent-icon.ico'),
        path.join(__dirname, '..', 'public', '4rent-icon.ico'),
      ]
    : [
        path.join(__dirname, '..', 'build', 'icon.png'),
        path.join(__dirname, '..', 'dist', 'icon-512.png'),
        path.join(__dirname, '..', 'public', 'icon-512.png'),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function isAllowedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function configureApplicationMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name || '4Rent',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
            ]
          : [{ role: 'close' }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createMainWindow() {
  const iconPath = resolveAppIconPath();
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
  const preloadPath = path.join(__dirname, 'preload.cjs');

  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 380,
    minHeight: 640,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#0B0E14',
    icon: iconPath,
    autoHideMenuBar: !isMac,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
    },
  });

  if (!isMac) {
    win.setMenuBarVisibility(false);
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  // Prevent external links (like m.me Messenger links) from opening inside the app shell
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
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

  mainWindow = win;
  return win;
}

// Native high-resolution PNG clipboard handler (used by Copy Receipt as PNG on macOS & Windows)
ipcMain.handle('4rent:copy-png-to-clipboard', (_event, pngDataUrl) => {
  try {
    if (
      typeof pngDataUrl !== 'string' ||
      !pngDataUrl.startsWith('data:image/png;base64,')
    ) {
      return false;
    }
    const img = nativeImage.createFromDataURL(pngDataUrl);
    if (img.isEmpty()) {
      return false;
    }
    clipboard.writeImage(img);
    return true;
  } catch {
    return false;
  }
});

// Single-instance lock so opening the app twice focuses the active window
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (app.isReady()) {
      createMainWindow();
    }
  });

  app.whenReady().then(() => {
    app.setName('4Rent');
    configureApplicationMenu();

    if (isMac && app.dock) {
      const dockIconPath = resolveAppIconPath();
      if (dockIconPath) {
        try {
          app.dock.setIcon(nativeImage.createFromPath(dockIconPath));
        } catch {
          // ignore dock icon fallback error
        }
      }
    }

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      } else if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) {
      app.quit();
    }
  });
}
