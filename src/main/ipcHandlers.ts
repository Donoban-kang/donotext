import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron'
import { APP_NAME, AUTHOR, RELEASES_URL, REPO_URL, type AppInfo } from '../shared/appInfo'
import { MARKDOWN_EXTENSIONS } from '../shared/fileKind'
import { IPC } from '../shared/ipc'
import type { ExportService } from './services/exportService'
import type { FsService } from './services/fsService'
import type { ImageService } from './services/imageService'
import type { ImportService } from './services/importService'
import type { SessionService } from './services/sessionService'
import { openDropped } from './services/dropService'
import { checkForUpdate, type FetchLike } from './services/updateService'
import type { WatchService } from './services/watchService'

const MAX_PATH = 4096

function str(v: unknown, name: string, max = MAX_PATH): string {
  if (typeof v !== 'string' || v.length > max) throw new Error(`Invalid argument: ${name}`)
  return v
}

function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`Invalid argument: ${name}`)
  return v
}

export interface IpcDeps {
  fs: FsService
  sessions: SessionService
  watcher: WatchService
  images: ImageService
  exports: ExportService
  imports: ImportService
  getWindow: () => BrowserWindow | null
}

export function registerIpc({ fs, sessions, watcher, images, exports, imports, getWindow }: IpcDeps): void {
  const markdownFilter = { name: 'Markdown', extensions: MARKDOWN_EXTENSIONS.map((e) => e.slice(1)) }
  const allFilter = { name: 'All Files', extensions: ['*'] }

  ipcMain.handle(IPC.openFileDialog, async () => {
    const win = getWindow()
    const opts = { properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>, filters: [markdownFilter, allFilter] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled) return []
    for (const p of res.filePaths) await sessions.grant(p)
    return Promise.all(res.filePaths.map((p) => fs.readFile(p)))
  })

  ipcMain.handle(IPC.openFolderDialog, async () => {
    const win = getWindow()
    const opts = { properties: ['openDirectory'] as Array<'openDirectory'> }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return null
    const root = res.filePaths[0]
    await sessions.grant(root)
    return { root, entries: await fs.readDir(root) }
  })

  ipcMain.handle(IPC.saveAsDialog, async (_e, suggested?: unknown) => {
    const win = getWindow()
    const opts = { defaultPath: typeof suggested === 'string' ? suggested : undefined, filters: [markdownFilter, allFilter] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    await sessions.grant(res.filePath)
    return res.filePath
  })

  ipcMain.handle(IPC.readFile, (_e, p) => fs.readFile(str(p, 'path')))
  ipcMain.handle(IPC.writeFile, (_e, p, text, eol, bom, encoding) => {
    if (eol !== 'lf' && eol !== 'crlf') throw new Error('Invalid argument: eol')
    const enc = encoding === undefined ? 'utf-8' : encoding
    if (enc !== 'utf-8' && enc !== 'utf-16le' && enc !== 'utf-16be' && enc !== 'cp949') throw new Error('Invalid argument: encoding')
    return fs.writeFile(str(p, 'path'), str(text, 'text', Number.MAX_SAFE_INTEGER), eol, bool(bom, 'bom'), enc)
  })
  ipcMain.handle(IPC.readDir, (_e, p) => fs.readDir(str(p, 'path')))
  ipcMain.handle(IPC.createEntry, (_e, parent, name, isDir) => fs.createEntry(str(parent, 'parent'), str(name, 'name', 255), bool(isDir, 'isDir')))
  ipcMain.handle(IPC.renameEntry, (_e, p, name) => fs.renameEntry(str(p, 'path'), str(name, 'newName', 255)))
  ipcMain.handle(IPC.deleteEntry, (_e, p) => fs.deleteEntry(str(p, 'path')))

  ipcMain.handle(IPC.openExternal, async (_e, url) => {
    const u = new URL(str(url, 'url', 8192))
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Blocked URL scheme')
    await shell.openExternal(u.toString())
  })

  ipcMain.handle(IPC.getAppInfo, (): AppInfo => ({ name: APP_NAME, version: app.getVersion(), author: AUTHOR, repoUrl: REPO_URL, releasesUrl: RELEASES_URL }))
  ipcMain.handle(IPC.openDropped, (_e, paths) => openDropped(paths, fs, (p) => sessions.grant(p)))
  const labelsOf = (v: unknown): { slide: string; notes: string } => {
    const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
    return { slide: str(o['slide'], 'labels.slide', 40), notes: str(o['notes'], 'labels.notes', 40) }
  }
  ipcMain.handle(IPC.importDialog, async (_e, labels) => {
    const checked = labelsOf(labels)
    const win = getWindow()
    const opts = {
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'html', 'htm'] }, allFilter]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    await sessions.grant(path) // choosing the file is the user's approval to read it
    return imports.importFile(path, checked)
  })
  ipcMain.handle(IPC.importFile, (_e, p, labels) => imports.importFile(str(p, 'path'), labelsOf(labels)))
  ipcMain.handle(IPC.checkUpdate, () => checkForUpdate(app.getVersion(), net.fetch as unknown as FetchLike))

  ipcMain.on(IPC.watch, (_e, paths: unknown) => {
    if (!Array.isArray(paths) || paths.length > 200) return
    watcher.setPaths(paths.filter((p): p is string => typeof p === 'string' && p.length <= MAX_PATH && fs.isAllowed(p)))
  })

  ipcMain.handle(IPC.loadSession, () => sessions.load())
  ipcMain.handle(IPC.saveSession, (_e, s) => {
    if (typeof s !== 'object' || s === null || (s as { version?: unknown }).version !== 1) throw new Error('Invalid session')
    return sessions.save(s)
  })
  ipcMain.handle(IPC.writeBackup, (_e, id, text) => sessions.writeBackup(str(id, 'docId', 64), str(text, 'text', Number.MAX_SAFE_INTEGER)))
  ipcMain.handle(IPC.clearBackup, (_e, id) => sessions.clearBackup(str(id, 'docId', 64)))
  ipcMain.handle(IPC.loadBackups, () => sessions.readBackups())

  ipcMain.handle(IPC.saveImage, (_e, docPath, bytes, ext) => {
    if (docPath !== null) str(docPath, 'docPath')
    if (!(bytes instanceof Uint8Array)) throw new Error('Invalid argument: bytes')
    return images.save(docPath as string | null, bytes, str(ext, 'ext', 16))
  })

  const MAX_EXPORT_HTML = 64 * 1024 * 1024
  const optionalPath = (v: unknown): string | null => (v === null || v === undefined ? null : str(v, 'docPath'))
  ipcMain.handle(IPC.exportHtml, (_e, html, name, docPath) =>
    exports.exportHtml(str(html, 'html', MAX_EXPORT_HTML), str(name, 'name', 255), optionalPath(docPath))
  )
  ipcMain.handle(IPC.exportPdf, (_e, html, name, docPath) =>
    exports.exportPdf(str(html, 'html', MAX_EXPORT_HTML), str(name, 'name', 255), optionalPath(docPath))
  )
}
