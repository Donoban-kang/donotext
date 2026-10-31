import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { MARKDOWN_EXTENSIONS } from '../shared/fileKind'
import { IPC } from '../shared/ipc'
import type { FsService } from './services/fsService'
import type { ImageService } from './services/imageService'
import type { SessionStore } from './services/sessionStore'
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

function notImplemented(task: number): () => never {
  return () => {
    throw new Error(`Not implemented yet (plan Task ${task})`)
  }
}

export interface IpcDeps {
  fs: FsService
  sessions: SessionStore
  watcher: WatchService
  images: ImageService
  getWindow: () => BrowserWindow | null
}

export function registerIpc({ fs, sessions, watcher, images, getWindow }: IpcDeps): void {
  const markdownFilter = { name: 'Markdown', extensions: MARKDOWN_EXTENSIONS.map((e) => e.slice(1)) }
  const allFilter = { name: 'All Files', extensions: ['*'] }

  ipcMain.handle(IPC.openFileDialog, async () => {
    const win = getWindow()
    const opts = { properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>, filters: [markdownFilter, allFilter] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled) return []
    res.filePaths.forEach((p) => fs.grant(p))
    return Promise.all(res.filePaths.map((p) => fs.readFile(p)))
  })

  ipcMain.handle(IPC.openFolderDialog, async () => {
    const win = getWindow()
    const opts = { properties: ['openDirectory'] as Array<'openDirectory'> }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return null
    const root = res.filePaths[0]
    fs.grant(root)
    return { root, entries: await fs.readDir(root) }
  })

  ipcMain.handle(IPC.saveAsDialog, async (_e, suggested?: unknown) => {
    const win = getWindow()
    const opts = { defaultPath: typeof suggested === 'string' ? suggested : undefined, filters: [markdownFilter, allFilter] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    fs.grant(res.filePath)
    return res.filePath
  })

  ipcMain.handle(IPC.readFile, (_e, p) => fs.readFile(str(p, 'path')))
  ipcMain.handle(IPC.writeFile, (_e, p, text, eol, bom) => {
    if (eol !== 'lf' && eol !== 'crlf') throw new Error('Invalid argument: eol')
    return fs.writeFile(str(p, 'path'), str(text, 'text', Number.MAX_SAFE_INTEGER), eol, bool(bom, 'bom'))
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

  ipcMain.on(IPC.watch, (_e, paths: unknown) => {
    if (!Array.isArray(paths) || paths.length > 200) return
    watcher.setPaths(paths.filter((p): p is string => typeof p === 'string' && p.length <= MAX_PATH && fs.isAllowed(p)))
  })

  ipcMain.handle(IPC.loadSession, async () => {
    const s = await sessions.load()
    if (s) {
      // The session file is written by this app into its own data folder; paths it lists
      // were granted in the previous run, so grant them again for the restored workspace.
      for (const d of s.docs) if (typeof d.path === 'string') fs.grant(d.path)
      if (typeof s.folder === 'string') fs.grant(s.folder)
      for (const p of s.recent) if (typeof p === 'string') fs.grant(p)
    }
    return s
  })
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

  // Replaced by a later task (export: Task 17).
  ipcMain.handle(IPC.exportHtml, notImplemented(17))
  ipcMain.handle(IPC.exportPdf, notImplemented(17))
}
