import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { loadSettings, saveSettings } from './settings';
import { Recorder, listDevices } from './recorder';

let win: BrowserWindow | null = null;
let statusTimer: NodeJS.Timeout | null = null;
const recorder = new Recorder();
let lastFile: string | null = null;
let lastError: string | null = null;
let lastExitCode: number | null = null;

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

function createWindow() {
  // Instagram story aspect: 9:16 portrait (1080×1920). Lock window to that.
  win = new BrowserWindow({
    width: 450,
    height: 800,
    title: 'Demo Recorder',
    backgroundColor: '#08141f',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    resizable: true,
    minWidth: 360,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAspectRatio(9 / 16);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function pushStatus() {
  const w = win;
  if (!w || w.isDestroyed()) return;
  const wc = w.webContents;
  if (!wc || wc.isDestroyed()) return;
  try {
    wc.send('status', {
      state: recorder.isRecording() ? 'recording' : 'idle',
      elapsedMs: recorder.elapsedMs(),
      output: recorder.output() ?? undefined,
      lastFile: lastFile ?? undefined,
      lastError: lastError ?? undefined,
      lastExitCode: lastExitCode ?? undefined,
    });
  } catch {
    // window/webContents torn down between checks; ignore
  }
}

app.whenReady().then(() => {
  createWindow();
  statusTimer = setInterval(pushStatus, 500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  if (recorder.isRecording()) {
    e.preventDefault();
    await recorder.stop();
    app.quit();
  }
});

ipcMain.handle('settings:get', async () => loadSettings());

ipcMain.handle('settings:chooseDestination', async () => {
  if (!win) return null;
  const current = (await loadSettings()).destination ?? app.getPath('videos');
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose recording destination folder',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  const dest = r.filePaths[0];
  await saveSettings({ destination: dest });
  return dest;
});

ipcMain.handle('settings:setAudioIdx', async (_e, idx: number) => {
  await saveSettings({ audioIdx: idx });
});

ipcMain.handle('settings:setAirpods', async (_e, on: boolean) => {
  await saveSettings({ airpods: on });
});

ipcMain.handle('settings:setAudioOffset', async (_e, ms: number) => {
  await saveSettings({ audioOffsetMs: ms });
});

ipcMain.handle('settings:setSaveScreen', async (_e, on: boolean) => {
  await saveSettings({ saveScreenOnly: on });
});
ipcMain.handle('settings:setSaveCamera', async (_e, on: boolean) => {
  await saveSettings({ saveCameraOnly: on });
});
ipcMain.handle('settings:setSaveLog', async (_e, on: boolean) => {
  await saveSettings({ saveLog: on });
});
ipcMain.handle('settings:setCamShape', async (_e, shape: any) => {
  await saveSettings({ camShape: shape });
});
ipcMain.handle('settings:setCamCorner', async (_e, corner: any) => {
  await saveSettings({ camCorner: corner });
});
ipcMain.handle('settings:setCamSize', async (_e, mult: number) => {
  await saveSettings({ camSizeMult: mult });
});

ipcMain.handle('devices:list', async () => listDevices());

ipcMain.handle('record:start', async () => {
  if (recorder.isRecording()) return { ok: false, error: 'already recording' };
  const s = await loadSettings();
  if (!s.destination) return { ok: false, error: 'choose a destination folder first' };
  if (s.audioIdx == null) return { ok: false, error: 'choose an audio device first' };

  const devices = await listDevices();
  const screen = devices.video.find((d) => /screen/i.test(d.name)) ?? devices.video[devices.video.length - 1];
  const camera = devices.video.find((d) => /facetime/i.test(d.name)) ?? devices.video[0];
  if (!screen || !camera) return { ok: false, error: 'could not detect screen/camera' };

  lastError = null;
  lastExitCode = null;

  try {
    const outs = await recorder.start(
      {
        destination: s.destination,
        screenIdx: screen.idx,
        cameraIdx: camera.idx,
        audioIdx: s.audioIdx,
        airpods: s.airpods,
        audioOffsetMs: s.audioOffsetMs,
        saveScreenOnly: s.saveScreenOnly,
        saveCameraOnly: s.saveCameraOnly,
        saveLog: s.saveLog,
        camShape: s.camShape,
        camCorner: s.camCorner,
        camSizeMult: s.camSizeMult,
      },
      {
        onElapsed: () => pushStatus(),
        onExit: (code, output) => {
          lastFile = output;
          lastExitCode = code;
          if (code !== 0) lastError = `ffmpeg exited with code ${code}`;
          pushStatus();
        },
        onError: (msg) => {
          lastError = msg;
          pushStatus();
        },
      },
    );
    pushStatus();
    return { ok: true, output: outs.combined, outputs: outs };
  } catch (err: any) {
    lastError = err?.message ?? String(err);
    return { ok: false, error: lastError };
  }
});

ipcMain.handle('record:stop', async () => {
  if (!recorder.isRecording()) return { ok: false, error: 'not recording' };
  await recorder.stop();
  pushStatus();
  return { ok: true, output: lastFile ?? undefined };
});

ipcMain.handle('reveal', async (_e, filePath: string) => {
  if (filePath) shell.showItemInFolder(filePath);
});
