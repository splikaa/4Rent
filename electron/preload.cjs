const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure Electron preload bridge exposing minimal native desktop capabilities
 * (such as high-resolution PNG clipboard copy for Messenger pasting) without
 * enabling nodeIntegration in the renderer process.
 */
contextBridge.exposeInMainWorld('electronDesktop', {
  isElectron: true,
  platform: process.platform,
  copyPngToClipboard: async (pngDataUrl) => {
    if (typeof pngDataUrl !== 'string' || !pngDataUrl.startsWith('data:image/png;base64,')) {
      return false;
    }
    return Boolean(await ipcRenderer.invoke('4rent:copy-png-to-clipboard', pngDataUrl));
  },
});
