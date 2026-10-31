import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { buildWebPreferences } from './windowOptions'
import { CSP } from '../shared/csp'
import { registerIpc } from './ipcHandlers'
import { IPC } from '../shared/ipc'
import { FsService } from './services/fsService'
import { SessionStore } from './services/sessionStore'
import { WatchService } from './services/watchService'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'donotext',
    webPreferences: buildWebPreferences(join(__dirname, '../preload/index.js'))
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow = win
  win.on('closed', () => {
    mainWindow = null
  })
  return win
}

void app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    })
  })
  const watcher = new WatchService((e) => mainWindow?.webContents.send(IPC.fileChanged, e))
  app.on('before-quit', () => void watcher.close())
  registerIpc({
    fs: new FsService({ trash: (p) => shell.trashItem(p) }),
    sessions: new SessionStore(app.getPath('userData')),
    watcher,
    getWindow: () => mainWindow
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
