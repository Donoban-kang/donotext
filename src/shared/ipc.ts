import type { DirEntry, ReadResult } from './fsTypes'
import type { SessionData } from './session'
import type { Eol } from './textFormat'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const

export interface FileChange {
  path: string
  kind: 'change' | 'unlink' | 'add'
}

export const IPC = {
  openFileDialog: 'fs:openDialog',
  openFolderDialog: 'fs:openFolder',
  saveAsDialog: 'fs:saveAsDialog',
  readFile: 'fs:read',
  writeFile: 'fs:write',
  readDir: 'fs:readDir',
  createEntry: 'fs:create',
  renameEntry: 'fs:rename',
  deleteEntry: 'fs:delete',
  watch: 'fs:watch',
  fileChanged: 'fs:changed',
  loadSession: 'session:load',
  saveSession: 'session:save',
  writeBackup: 'session:backup',
  clearBackup: 'session:clearBackup',
  loadBackups: 'session:backups',
  exportHtml: 'export:html',
  exportPdf: 'export:pdf',
  saveImage: 'image:save',
  openExternal: 'app:openExternal'
} as const

export interface DonotextApi {
  openFileDialog(): Promise<ReadResult[]>
  openFolderDialog(): Promise<{ root: string; entries: DirEntry[] } | null>
  saveAsDialog(suggestedName?: string): Promise<string | null>
  readFile(path: string): Promise<ReadResult>
  writeFile(path: string, text: string, eol: Eol, bom: boolean): Promise<void>
  readDir(path: string): Promise<DirEntry[]>
  createEntry(parent: string, name: string, isDir: boolean): Promise<string>
  renameEntry(path: string, newName: string): Promise<string>
  deleteEntry(path: string): Promise<void>
  watch(paths: string[]): void
  onFileChanged(cb: (e: FileChange) => void): () => void
  loadSession(): Promise<SessionData | null>
  saveSession(s: SessionData): Promise<void>
  writeBackup(docId: string, text: string): Promise<void>
  clearBackup(docId: string): Promise<void>
  loadBackups(): Promise<Record<string, string>>
  exportHtml(html: string, suggestedName: string): Promise<string | null>
  exportPdf(html: string, suggestedName: string): Promise<string | null>
  saveImage(docPath: string | null, bytes: Uint8Array, ext: string): Promise<string>
  openExternal(url: string): Promise<void>
}
