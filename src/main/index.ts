import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } from 'electron'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { buildWebPreferences } from './windowOptions'
import { CSP } from '../shared/csp'
import { CloseGate } from './closeGate'
import { filePathsFromArgv } from './launchArgs'
import { buildMenuTemplate } from './menu'
import { registerIpc } from './ipcHandlers'
import { IPC } from '../shared/ipc'
import { IMAGE_SCHEME } from '../shared/images'
import { FsService } from './services/fsService'
import { ExportService } from './services/exportService'
import { handleImageRequest } from './services/imageProtocol'
import { ImageService } from './services/imageService'
import { ImportService } from './services/importService'
import { runInWorker } from './import/workerRunner'
import { GrantStore } from './services/grantStore'
import { SessionService } from './services/sessionService'
import { SessionStore } from './services/sessionStore'
import { WatchService } from './services/watchService'

// Must run before the app is ready: lets the renderer load images through our scoped scheme.
protocol.registerSchemesAsPrivileged([
  { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let mainWindow: BrowserWindow | null = null
const closeGate = new CloseGate()

// Only one copy may run: two copies would restore the same session and delete each other's backups.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

// Files the OS asks us to open before the app is ready (macOS open-file arrives very early).
const earlyOpenPaths: string[] = []
app.on('open-file', (event, path) => {
  event.preventDefault()
  earlyOpenPaths.push(path)
  if (requestOpen) void requestOpen([path])
})
let requestOpen: ((paths: string[]) => Promise<void>) | null = null

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
  // The renderer asks about unsaved changes before a window may close.
  win.on('close', (event) => {
    if (closeGate.attempt() === 'allow') return
    event.preventDefault()
    win.webContents.send(IPC.requestClose)
  })
  win.webContents.on('render-process-gone', () => closeGate.markUnavailable())
  win.on('unresponsive', () => closeGate.markUnavailable())
  win.on('closed', () => {
    mainWindow = null
    closeGate.reset()
  })
  return win
}

if (gotLock) void app.whenReady().then(() => {
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
  const sessions = new SessionService(new SessionStore(app.getPath('userData')), new GrantStore(app.getPath('userData')), fsService)
  const imageService = new ImageService(fsService)
  // In the installed app pdfjs is unpacked next to app.asar: its files are read by a worker thread, which
  // cannot open files inside the archive.
  const pdfjsDir = dirname(createRequire(__filename).resolve('pdfjs-dist/package.json')).replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked')
  const importService = new ImportService({ run: runInWorker, pdfjsDir, isAllowed: (p) => fsService.isAllowed(p) })
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
    imports: importService,
    sessions,
    watcher,
    getWindow: () => mainWindow
  })

  // Files the user asked the OS to open with us. Launching with a path is the user's approval to use it.
  const pendingOpen: string[] = []
  let rendererReady = false
  requestOpen = async (paths) => {
    const files: string[] = []
    for (const p of paths) {
      try {
        if ((await stat(p)).isFile()) {
          await sessions.grant(p)
          files.push(p)
        }
      } catch {
        // missing or unreadable: ignore
      }
    }
    if (files.length === 0) return
    if (rendererReady && mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.webContents.send(IPC.openPaths, files)
    } else pendingOpen.push(...files)
  }
  ipcMain.handle(IPC.takeOpenPaths, () => {
    rendererReady = true
    return pendingOpen.splice(0)
  })
  ipcMain.on(IPC.closeResponse, (_e, canClose: unknown) => {
    if (closeGate.respond(canClose === true)) mainWindow?.close()
  })
  app.on('second-instance', (_e, argv, cwd) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    void requestOpen?.(filePathsFromArgv(argv, app.isPackaged, cwd))
  })
  void requestOpen([...filePathsFromArgv(process.argv, app.isPackaged, process.cwd()), ...earlyOpenPaths])
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
