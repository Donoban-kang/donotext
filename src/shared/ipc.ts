import type { AppInfo, UpdateResult } from './appInfo'
import type { DirEntry, DropEntry, ReadResult } from './fsTypes'
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
  openExternal: 'app:openExternal',
  getAppInfo: 'app:info',
  openDropped: 'fs:openDropped',
  checkUpdate: 'app:checkUpdate',
  requestClose: 'app:requestClose',
  closeResponse: 'app:closeResponse',
  openPaths: 'app:openPaths',
  takeOpenPaths: 'app:takeOpenPaths'
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
  /** Both resolve to the chosen file path, or null when the user cancels the save dialog. */
  exportHtml(html: string, suggestedName: string, docPath: string | null): Promise<string | null>
  exportPdf(html: string, suggestedName: string, docPath: string | null): Promise<string | null>
  saveImage(docPath: string | null, bytes: Uint8Array, ext: string): Promise<string>
  openExternal(url: string): Promise<void>
  getAppInfo(): Promise<AppInfo>
  /**
   * Opens what the user just dropped on the window. The paths come from the preload script, which only
   * accepts real (trusted) drop events, so the page cannot ask for files the user did not drop.
   */
  takeDrop(): Promise<DropEntry[]>
  /** One plain GET to GitHub's latest-release API; never sends document content. */
  checkForUpdate(): Promise<UpdateResult>
  /** The window is about to close; answer with respondToClose(true) to allow it. */
  onCloseRequested(cb: () => void): () => void
  respondToClose(canClose: boolean): void
  /** Files the OS asked us to open (double-click, `donotext file.md`, second launch). */
  onOpenPaths(cb: (paths: string[]) => void): () => void
  /** Paths queued before the renderer was ready; returns and clears them. */
  takeOpenPaths(): Promise<string[]>
}
