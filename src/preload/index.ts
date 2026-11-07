import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type DonotextApi, type FileChange } from '../shared/ipc'

/**
 * Paths of the latest drop from the file manager. Only a real (trusted) drop event is recorded, and the path
 * is read here, in the preload, so page scripts cannot name arbitrary files; they can only open what the user dropped.
 */
let lastDrop: { paths: string[]; at: number } | null = null
window.addEventListener(
  'drop',
  (e) => {
    if (!e.isTrusted) return
    const paths = Array.from(e.dataTransfer?.files ?? [])
      .map((f) => webUtils.getPathForFile(f))
      .filter((p) => p !== '')
    lastDrop = paths.length > 0 ? { paths, at: Date.now() } : null
  },
  true
)

const api: DonotextApi = {
  openFileDialog: () => ipcRenderer.invoke(IPC.openFileDialog),
  openFolderDialog: () => ipcRenderer.invoke(IPC.openFolderDialog),
  saveAsDialog: (suggestedName) => ipcRenderer.invoke(IPC.saveAsDialog, suggestedName),
  readFile: (path) => ipcRenderer.invoke(IPC.readFile, path),
  writeFile: (path, text, eol, bom, encoding) => ipcRenderer.invoke(IPC.writeFile, path, text, eol, bom, encoding),
  readDir: (path) => ipcRenderer.invoke(IPC.readDir, path),
  createEntry: (parent, name, isDir) => ipcRenderer.invoke(IPC.createEntry, parent, name, isDir),
  renameEntry: (path, newName) => ipcRenderer.invoke(IPC.renameEntry, path, newName),
  deleteEntry: (path) => ipcRenderer.invoke(IPC.deleteEntry, path),
  watch: (paths) => ipcRenderer.send(IPC.watch, paths),
  onFileChanged: (cb) => {
    const listener = (_e: unknown, change: FileChange): void => cb(change)
    ipcRenderer.on(IPC.fileChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.fileChanged, listener)
    }
  },
  loadSession: () => ipcRenderer.invoke(IPC.loadSession),
  saveSession: (s) => ipcRenderer.invoke(IPC.saveSession, s),
  writeBackup: (docId, text) => ipcRenderer.invoke(IPC.writeBackup, docId, text),
  clearBackup: (docId) => ipcRenderer.invoke(IPC.clearBackup, docId),
  loadBackups: () => ipcRenderer.invoke(IPC.loadBackups),
  exportHtml: (html, name, docPath) => ipcRenderer.invoke(IPC.exportHtml, html, name, docPath),
  exportPdf: (html, name, docPath) => ipcRenderer.invoke(IPC.exportPdf, html, name, docPath),
  saveImage: (docPath, bytes, ext) => ipcRenderer.invoke(IPC.saveImage, docPath, bytes, ext),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  takeDrop: () => {
    const drop = lastDrop
    lastDrop = null // one drop, one use
    if (!drop || Date.now() - drop.at > 10_000) return Promise.resolve([])
    return ipcRenderer.invoke(IPC.openDropped, drop.paths)
  },
  importDialog: (labels) => ipcRenderer.invoke(IPC.importDialog, labels),
  importFile: (path, labels) => ipcRenderer.invoke(IPC.importFile, path, labels),
  checkForUpdate: () => ipcRenderer.invoke(IPC.checkUpdate),
  onCloseRequested: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.requestClose, listener)
    return () => {
      ipcRenderer.removeListener(IPC.requestClose, listener)
    }
  },
  respondToClose: (canClose) => ipcRenderer.send(IPC.closeResponse, canClose),
  onOpenPaths: (cb) => {
    const listener = (_e: unknown, paths: string[]): void => cb(paths)
    ipcRenderer.on(IPC.openPaths, listener)
    return () => {
      ipcRenderer.removeListener(IPC.openPaths, listener)
    }
  },
  takeOpenPaths: () => ipcRenderer.invoke(IPC.takeOpenPaths)
}

contextBridge.exposeInMainWorld('api', api)
