import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DonotextApi, type FileChange } from '../shared/ipc'

const api: DonotextApi = {
  openFileDialog: () => ipcRenderer.invoke(IPC.openFileDialog),
  openFolderDialog: () => ipcRenderer.invoke(IPC.openFolderDialog),
  saveAsDialog: (suggestedName) => ipcRenderer.invoke(IPC.saveAsDialog, suggestedName),
  readFile: (path) => ipcRenderer.invoke(IPC.readFile, path),
  writeFile: (path, text, eol, bom) => ipcRenderer.invoke(IPC.writeFile, path, text, eol, bom),
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
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url)
}

contextBridge.exposeInMainWorld('api', api)
