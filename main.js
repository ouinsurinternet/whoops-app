const { app, BrowserWindow, shell, desktopCapturer, session, systemPreferences } = require('electron');
const path = require('path');

const APP_URL = 'https://whoops.krakenbots.com';

let mainWindow;

function createWindow() {
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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0a0a0a',
    show: false,
    // Windows title bar overlay
    ...(process.platform === 'win32' && {
      titleBarOverlay: {
        color: '#0a0a0a',
        symbolColor: '#ffffff',
        height: 48
      }
    })
  });

  mainWindow.loadURL(APP_URL);

  // Handle screen sharing on macOS/Linux - Electron needs special handling
  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    // Check screen recording permission on macOS
    if (process.platform === 'darwin') {
      const screenStatus = systemPreferences.getMediaAccessStatus('screen');
      console.log('Screen recording permission status:', screenStatus);

      if (screenStatus !== 'granted') {
        // This will prompt the user to grant permission in System Preferences
        console.log('Screen recording permission not granted. Please enable in System Preferences.');
      }
    }

    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      // If only one screen, use it directly. Otherwise, use the first one.
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
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

app.whenReady().then(createWindow);

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
