const { app, BrowserWindow, shell, desktopCapturer, session, systemPreferences, ipcMain, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://whoops.ws';

// Auto-updater config
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;
let pickerWindow = null;
let pendingSourceCallback = null;

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
        // macOS: hidden title bar with traffic lights
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 18 },
      }
    : process.platform === 'win32'
    ? {
        // Windows: custom title bar overlay with dark theme
        titleBarOverlay: {
          color: '#0a0a0a',
          symbolColor: '#ffffff',
          height: 40
        },
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
      webSecurity: true
    },
    backgroundColor: '#0a0a0a',
    show: false,
    ...platformOptions
  });

  mainWindow.loadURL(APP_URL);

  // Handle screen sharing on macOS/Linux - Electron needs special handling
  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    // Check screen recording permission on macOS
    if (process.platform === 'darwin') {
      const screenStatus = systemPreferences.getMediaAccessStatus('screen');
      console.log('Screen recording permission status:', screenStatus);

      if (screenStatus !== 'granted') {
        console.log('Screen recording permission not granted. Please enable in System Preferences.');
      }
    }

    try {
      // Show picker and wait for user selection
      const selectedSourceId = await showScreenPicker();

      if (!selectedSourceId) {
        // User cancelled
        callback({});
        return;
      }

      // Get the selected source
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

  // Afficher la fenêtre quand c'est prêt
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Ouvrir les liens externes dans le navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Gérer les liens target="_blank"
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
  // Remove menu bar on Windows
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
});

// Auto-updater events
autoUpdater.on('update-available', () => {
  console.log('Update available, downloading...');
});

autoUpdater.on('update-downloaded', () => {
  console.log('Update downloaded, will install on quit');
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

// Empêcher plusieurs instances
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
}
