const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new update for ADK Smart POS is available and is downloading in the background. Please continue your work, we will notify you when it is ready.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready to Install',
    message: 'The new update has been downloaded successfully. Do you want to restart and install it now?',
    buttons: ['Restart Now', 'Later']
  }).then((returnValue) => {
    if (returnValue.response === 0) {
      autoUpdater.quitAndInstall();
    }
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
