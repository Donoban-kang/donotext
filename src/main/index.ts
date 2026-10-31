import { app, BrowserWindow, dialog, Menu, protocol, session, shell } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildWebPreferences } from './windowOptions'
import { CSP } from '../shared/csp'
import { buildMenuTemplate } from './menu'
import { registerIpc } from './ipcHandlers'
import { IPC } from '../shared/ipc'
import { IMAGE_SCHEME } from '../shared/images'
import { FsService } from './services/fsService'
import { ExportService } from './services/exportService'
import { handleImageRequest } from './services/imageProtocol'
import { ImageService } from './services/imageService'
import { GrantStore } from './services/grantStore'
import { SessionService } from './services/sessionService'
import { SessionStore } from './services/sessionStore'
import { WatchService } from './services/watchService'

// Must run before the app is ready: lets the renderer load images through our scoped scheme.
protocol.registerSchemesAsPrivileged([
  { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let mainWindow: BrowserWindow | null = null

/** Renders a complete HTML document to PDF in a hidden window that cannot run scripts. */
async function renderPdf(html: string): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'donotext-pdf-'))
  const file = join(dir, 'document.html')
  await writeFile(file, html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false }
  })
  try {
    await win.loadFile(file)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    return new Uint8Array(pdf)
  } finally {
    win.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}

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
  const fsService = new FsService({ trash: (p) => shell.trashItem(p) })
  const imageService = new ImageService(fsService)
  protocol.handle(IMAGE_SCHEME, (request) => handleImageRequest(request, fsService))
  registerIpc({
    fs: fsService,
    images: imageService,
    exports: new ExportService(fsService, imageService, {
      showSaveDialog: async ({ defaultName, ext }) => {
        const opts = { defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }
        const res = mainWindow ? await dialog.showSaveDialog(mainWindow, opts) : await dialog.showSaveDialog(opts)
        return res.canceled || !res.filePath ? null : res.filePath
      },
      renderPdf
    }),
    sessions: new SessionService(new SessionStore(app.getPath('userData')), new GrantStore(app.getPath('userData')), fsService),
    watcher,
    getWindow: () => mainWindow
  })
  const template = buildMenuTemplate({ isMac: process.platform === 'darwin', isDev: !app.isPackaged, appName: app.name })
  Menu.setApplicationMenu(template ? Menu.buildFromTemplate(template) : null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
