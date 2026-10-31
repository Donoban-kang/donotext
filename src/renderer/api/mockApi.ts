import { classifyPath } from '../../shared/fileKind'
import type { DirEntry, ReadResult } from '../../shared/fsTypes'
import { IMAGE_EXTENSIONS, type DonotextApi, type FileChange } from '../../shared/ipc'
import type { SessionData } from '../../shared/session'
import type { Eol } from '../../shared/textFormat'

interface Stored {
  text: string
  eol: Eol
  bom: boolean
}

export interface MockController {
  queueOpen(paths: string[]): void
  queueFolder(root: string | null): void
  queueSaveAs(path: string | null): void
  emitChange(e: FileChange): void
  files: Map<string, Stored>
}

function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

function join(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`
}

/** In-memory DonotextApi used when `window.api` is absent (browser mode, tests). */
export function createMockApi(
  seed: Record<string, string> = {},
  initial: { session?: SessionData | null; backups?: Record<string, string> } = {}
): { api: DonotextApi; controller: MockController } {
  const files = new Map<string, Stored>()
  const dirs = new Set<string>()
  const listeners = new Set<(e: FileChange) => void>()
  const openQueue: string[][] = []
  const folderQueue: Array<string | null> = []
  const saveAsQueue: Array<string | null> = []
  let session: SessionData | null = initial.session ?? null
  const backups = new Map<string, string>(Object.entries(initial.backups ?? {}))
  let imageCounter = 0

  for (const [p, text] of Object.entries(seed)) files.set(p, { text, eol: 'lf', bom: false })

  const toResult = (path: string): ReadResult => {
    const f = files.get(path)
    if (!f) throw new Error(`ENOENT: ${path}`)
    return { path, text: f.text, eol: f.eol, bom: f.bom, kind: classifyPath(path), readOnly: false }
  }

  const listDir = (dir: string): DirEntry[] => {
    const prefix = dir === '/' ? '/' : `${dir}/`
    const seen = new Map<string, boolean>()
    for (const p of files.keys()) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) seen.set(rest, seen.get(rest) ?? false)
      else seen.set(rest.slice(0, slash), true)
    }
    for (const d of dirs) {
      if (!d.startsWith(prefix)) continue
      const rest = d.slice(prefix.length)
      const name = rest.split('/')[0]
      if (name) seen.set(name, true)
    }
    return [...seen.entries()]
      .map(([name, isDir]) => ({ name, path: join(dir, name), isDir }))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
  }

  const exists = (p: string): boolean => files.has(p) || dirs.has(p) || [...files.keys()].some((k) => k.startsWith(`${p}/`))

  const api: DonotextApi = {
    async openFileDialog() {
      const paths = openQueue.shift() ?? []
      return paths.map(toResult)
    },
    async openFolderDialog() {
      const root = folderQueue.shift() ?? null
      return root ? { root, entries: listDir(root) } : null
    },
    async saveAsDialog() {
      return saveAsQueue.shift() ?? null
    },
    async readFile(path) {
      return toResult(path)
    },
    async writeFile(path, text, eol, bom) {
      files.set(path, { text, eol, bom })
    },
    async readDir(path) {
      return listDir(path)
    },
    async createEntry(parent, name, isDir) {
      if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Invalid file name')
      const p = join(parent, name)
      if (exists(p)) throw new Error('Already exists')
      if (isDir) dirs.add(p)
      else files.set(p, { text: '', eol: 'lf', bom: false })
      return p
    },
    async renameEntry(path, newName) {
      if (!newName || newName === '.' || newName === '..' || /[\\/]/.test(newName)) throw new Error('Invalid file name')
      const target = join(parentOf(path), newName)
      if (exists(target)) throw new Error('Already exists')
      for (const [k, v] of [...files.entries()]) {
        if (k === path || k.startsWith(`${path}/`)) {
          files.delete(k)
          files.set(target + k.slice(path.length), v)
        }
      }
      if (dirs.delete(path)) dirs.add(target)
      return target
    },
    async deleteEntry(path) {
      for (const k of [...files.keys()]) if (k === path || k.startsWith(`${path}/`)) files.delete(k)
      dirs.delete(path)
    },
    watch() {},
    onFileChanged(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    async loadSession() {
      return session
    },
    async saveSession(s) {
      session = s
    },
    async writeBackup(docId, text) {
      backups.set(docId, text)
    },
    async clearBackup(docId) {
      backups.delete(docId)
    },
    async loadBackups() {
      return Object.fromEntries(backups)
    },
    async exportHtml(html, suggestedName) {
      const p = `/exports/${suggestedName.replace(/\.[^.]*$/, '')}.html`
      files.set(p, { text: html, eol: 'lf', bom: false })
      return p
    },
    async exportPdf(_html, suggestedName) {
      return `/exports/${suggestedName.replace(/\.[^.]*$/, '')}.pdf`
    },
    async saveImage(_docPath, _bytes, ext) {
      if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())) throw new Error('Unsupported image type')
      imageCounter += 1
      return `assets/img-${Date.now()}-${imageCounter}.${ext.toLowerCase()}`
    },
    async openExternal(url) {
      let u: URL
      try {
        u = new URL(url)
      } catch {
        throw new Error('Invalid URL')
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Blocked URL scheme')
    }
  }

  const controller: MockController = {
    queueOpen: (paths) => void openQueue.push(paths),
    queueFolder: (root) => void folderQueue.push(root),
    queueSaveAs: (p) => void saveAsQueue.push(p),
    emitChange: (e) => listeners.forEach((l) => l(e)),
    files
  }
  return { api, controller }
}
