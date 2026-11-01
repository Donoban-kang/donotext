import { chmod, mkdir, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { classifyPath } from '../../shared/fileKind'
import type { DirEntry, ReadResult, Warning } from '../../shared/fsTypes'
import { decodeText, encodeText, type Encoding, type Eol } from '../../shared/textFormat'

export interface FsServiceOptions {
  /** Above this size a file opens source-only with a warning. */
  maxBytes?: number
  /** Above this size a file is not read at all. */
  hardMaxBytes?: number
  trash?: (path: string) => Promise<void>
}

export type { DirEntry, ReadResult, Warning }

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_HARD_MAX_BYTES = 64 * 1024 * 1024

function assertValidName(name: string): void {
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new Error(`Invalid file name: ${JSON.stringify(name)}`)
  }
}

export class FsService {
  private readonly grants = new Set<string>()
  private readonly maxBytes: number
  private readonly hardMaxBytes: number
  private readonly trash?: (path: string) => Promise<void>

  constructor(opts: FsServiceOptions = {}) {
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.hardMaxBytes = opts.hardMaxBytes ?? DEFAULT_HARD_MAX_BYTES
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
    if (size > this.hardMaxBytes) throw new Error(`File is too large to open (${size} bytes)`)
    const decoded = decodeText(new Uint8Array(await readFile(p)))
    const tooLarge = size > this.maxBytes
    const result: ReadResult = {
      path: p,
      text: decoded.text,
      eol: decoded.eol,
      bom: decoded.bom,
      encoding: decoded.encoding,
      kind: tooLarge ? 'sourceOnly' : classifyPath(p),
      readOnly: !decoded.validUtf8
    }
    if (tooLarge) result.warning = 'tooLarge'
    else if (!decoded.validUtf8) result.warning = 'notUtf8'
    return result
  }

  async writeFile(path: string, text: string, eol: Eol, bom: boolean, encoding: Encoding = 'utf-8'): Promise<void> {
    // Encode first: a character the file's encoding cannot hold must fail before anything is touched.
    await this.atomicWrite(path, encodeText(text, eol, bom, encoding))
  }

  /** Writes raw bytes (e.g. a PDF) to an allowed path, replacing the file atomically. */
  async writeBinary(path: string, bytes: Uint8Array): Promise<void> {
    await this.atomicWrite(path, bytes)
  }

  /**
   * Temp file + rename, so a crash never leaves a half-written document. The write goes to the
   * link's target (a symlink stays a symlink) and the original permission bits are kept.
   */
  private async atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
    const requested = this.assertAllowed(path)
    let target = requested
    let mode: number | undefined
    try {
      target = await realpath(requested)
      mode = (await stat(target)).mode & 0o7777
    } catch {
      // a new file (or a dangling link): nothing to preserve
    }
    const tmp = join(dirname(target), `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.tmp`)
    await writeFile(tmp, bytes)
    try {
      if (mode !== undefined) await chmod(tmp, mode)
      await rename(tmp, target)
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
