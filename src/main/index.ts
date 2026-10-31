import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { buildWebPreferences } from './windowOptions'
import { CSP } from '../shared/csp'
import { registerIpc } from './ipcHandlers'
import { FsService } from './services/fsService'

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
  registerIpc({
    fs: new FsService({ trash: (p) => shell.trashItem(p) }),
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
