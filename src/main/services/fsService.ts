import { mkdir, readdir, readFile, rename, rm, stat, writeFile, open } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { classifyPath, type FileKind } from '../../shared/fileKind'
import { decodeText, encodeText, type Eol } from '../../shared/textFormat'

export type Warning = 'notUtf8' | 'tooLarge'

export interface ReadResult {
  path: string
  text: string
  eol: Eol
  bom: boolean
  kind: FileKind
  readOnly: boolean
  warning?: Warning
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface FsServiceOptions {
  maxBytes?: number
  trash?: (path: string) => Promise<void>
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024

function assertValidName(name: string): void {
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new Error(`Invalid file name: ${JSON.stringify(name)}`)
  }
}

export class FsService {
  private readonly grants = new Set<string>()
  private readonly maxBytes: number
  private readonly trash?: (path: string) => Promise<void>

  constructor(opts: FsServiceOptions = {}) {
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.trash = opts.trash
  }

  grant(path: string): void {
    this.grants.add(resolve(path))
  }

  isAllowed(path: string): boolean {
    const target = resolve(path)
    for (const g of this.grants) {
      if (target === g) return true
      const rel = relative(g, target)
      if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return true
    }
    return false
  }

  private assertAllowed(path: string): string {
    if (!this.isAllowed(path)) throw new Error(`Path not allowed: ${path}`)
    return resolve(path)
  }

  async readFile(path: string): Promise<ReadResult> {
    const p = this.assertAllowed(path)
    const size = (await stat(p)).size
    const decoded = decodeText(new Uint8Array(await readFile(p)))
    const tooLarge = size > this.maxBytes
    const result: ReadResult = {
      path: p,
      text: decoded.text,
      eol: decoded.eol,
      bom: decoded.bom,
      kind: tooLarge ? 'sourceOnly' : classifyPath(p),
      readOnly: !decoded.validUtf8
    }
    if (tooLarge) result.warning = 'tooLarge'
    else if (!decoded.validUtf8) result.warning = 'notUtf8'
    return result
  }

  async writeFile(path: string, text: string, eol: Eol, bom: boolean): Promise<void> {
    const p = this.assertAllowed(path)
    const tmp = join(dirname(p), `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.tmp`)
    await writeFile(tmp, encodeText(text, eol, bom))
    try {
      await rename(tmp, p)
    } catch (e) {
      await rm(tmp, { force: true })
      throw e
    }
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const p = this.assertAllowed(path)
    const entries = await readdir(p, { withFileTypes: true })
    return entries
      .map((e) => ({ name: e.name, path: join(p, e.name), isDir: e.isDirectory() }))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
  }

  async createEntry(parent: string, name: string, isDir: boolean): Promise<string> {
    const base = this.assertAllowed(parent)
    assertValidName(name)
    const target = join(base, name)
    if (isDir) {
      await mkdir(target)
    } else {
      const handle = await open(target, 'wx')
      await handle.close()
    }
    return target
  }

  async renameEntry(path: string, newName: string): Promise<string> {
    const p = this.assertAllowed(path)
    assertValidName(newName)
    const target = join(dirname(p), newName)
    try {
      await stat(target)
      throw new Error(`Target already exists: ${target}`)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    await rename(p, target)
    if (this.grants.has(p)) this.grants.add(target)
    return target
  }

  async deleteEntry(path: string): Promise<void> {
    const p = this.assertAllowed(path)
    if (this.trash) await this.trash(p)
    else await rm(p, { recursive: true })
  }
}
