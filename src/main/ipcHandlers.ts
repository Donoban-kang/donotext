import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { MARKDOWN_EXTENSIONS } from '../shared/fileKind'
import { IPC } from '../shared/ipc'
import type { FsService } from './services/fsService'

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
  getWindow: () => BrowserWindow | null
}

export function registerIpc({ fs, getWindow }: IpcDeps): void {
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

  // Replaced by later tasks (watch/session: Task 12, image: Task 15, export: Task 17).
  ipcMain.on(IPC.watch, () => {})
  ipcMain.handle(IPC.loadSession, notImplemented(12))
  ipcMain.handle(IPC.saveSession, notImplemented(12))
  ipcMain.handle(IPC.writeBackup, notImplemented(12))
  ipcMain.handle(IPC.saveImage, notImplemented(15))
  ipcMain.handle(IPC.exportHtml, notImplemented(17))
  ipcMain.handle(IPC.exportPdf, notImplemented(17))
}
