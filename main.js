const { app, BrowserWindow, shell, desktopCapturer, session, systemPreferences, ipcMain, Menu, globalShortcut } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://whoops.ws';

let mainWindow;
let pickerWindow = null;
let pendingSourceCallback = null;

// Single instance lock - MUST be before app.whenReady()
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Show screen picker window
  async function showScreenPicker() {
    return new Promise((resolve) => {
      pickerWindow = new BrowserWindow({
        width: 800,
        height: 600,
        parent: mainWindow,
        modal: true,
        show: false,
        resizable: false,
        title: 'Partage d\'écran',
        backgroundColor: '#18181b',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload-picker.js')
        }
      });

      pendingSourceCallback = resolve;

      pickerWindow.loadFile('picker.html');
      pickerWindow.once('ready-to-show', () => pickerWindow.show());
      pickerWindow.on('closed', () => {
        pickerWindow = null;
        if (pendingSourceCallback) {
          pendingSourceCallback(null);
          pendingSourceCallback = null;
        }
      });
    });
  }

  // IPC handlers for picker
  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 400, height: 300 }
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  });

  ipcMain.on('source-selected', (event, sourceId) => {
    if (pendingSourceCallback) {
      pendingSourceCallback(sourceId);
      pendingSourceCallback = null;
    }
    if (pickerWindow) {
      pickerWindow.close();
    }
  });

  function createWindow() {
    // Platform-specific window options
    const platformOptions = process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {};

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: 'Whoops',
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, 'preload.js')
      },
      backgroundColor: '#0a0a0a',
      show: false,
      ...platformOptions
    });

    mainWindow.loadURL(APP_URL);

    // Grant media permissions automatically (microphone, camera, etc.)
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = ['media', 'mediaKeySystem', 'geolocation', 'notifications'];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    // Also handle permission check
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      const allowedPermissions = ['media', 'mediaKeySystem'];
      if (allowedPermissions.includes(permission)) {
        return true;
      }
      return false;
    });

    // Handle screen sharing
    mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
      if (process.platform === 'darwin') {
        const screenStatus = systemPreferences.getMediaAccessStatus('screen');
        console.log('Screen recording permission status:', screenStatus);
        if (screenStatus !== 'granted') {
          console.log('Screen recording permission not granted.');
        }
      }

      try {
        const selectedSourceId = await showScreenPicker();

        if (!selectedSourceId) {
          callback({});
          return;
        }

        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const selectedSource = sources.find(s => s.id === selectedSourceId);

        if (selectedSource) {
          callback({ video: selectedSource, audio: 'loopback' });
        } else {
          callback({});
        }
      } catch (error) {
        console.error('Error getting sources:', error);
        callback({});
      }
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    // Raccourci Ctrl+R / Cmd+R pour vider le cache et rafraîchir
    mainWindow.webContents.on('before-input-event', async (event, input) => {
      if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
        event.preventDefault();

        // Ctrl+Shift+R : Hard refresh (vide TOUT le cache)
        if (input.shift) {
          console.log('Hard refresh: clearing ALL cache...');
          await mainWindow.webContents.session.clearCache();
          await mainWindow.webContents.session.clearStorageData({
            storages: ['appcache', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
          });
          mainWindow.webContents.reloadIgnoringCache();
          console.log('Hard refresh complete!');
        }
        // Ctrl+R : Clear cache et reload (pour les problèmes de logos)
        else {
          console.log('Clearing cache and reloading...');
          await mainWindow.webContents.session.clearCache();
          mainWindow.webContents.reloadIgnoringCache();
          console.log('Cache cleared and reloaded!');
        }
      }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith(APP_URL)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(APP_URL)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      Menu.setApplicationMenu(null);
    }

    createWindow();

    // Auto-updater: only when app is packaged
    if (app.isPackaged) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  // Auto-updater events
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No update available');
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded, will install on quit');
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
}
