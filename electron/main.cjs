const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

// Configure auto-updater
autoUpdater.autoDownload = false; // Require user permission to download
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version (v${info.version}) of ADK Smart POS is available. Do you want to download and install it now?`,
    buttons: ['Update', 'Maybe Later']
  }).then((returnValue) => {
    if (returnValue.response === 0) {
      // User clicked 'Update'
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'The update has been downloaded. The application will restart now to install it.',
    buttons: ['Restart Now']
  }).then(() => {
    autoUpdater.quitAndInstall();
  });
});

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.webContents.setWindowOpenHandler((details) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        resizable: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      }
    };
  });

  win.webContents.on('did-create-window', (childWindow, details) => {
    childWindow.maximize();
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
    
    // Check for updates after the app is loaded
    win.webContents.once('did-finish-load', () => {
      autoUpdater.checkForUpdatesAndNotify();
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Register IPC handler to open PDF files in OS default reader
ipcMain.handle('open-pdf', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
