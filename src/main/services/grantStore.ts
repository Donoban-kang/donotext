import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Remembers which files and folders the USER approved (through open/save dialogs) so access can be
 * restored after a restart. Only the main process writes it; nothing the renderer sends is stored.
 */
export class GrantStore {
  private paths: string[] | null = null
  private writing: Promise<void> = Promise.resolve()
  private readonly file: string

  constructor(
    private readonly dir: string,
    private readonly max = 200
  ) {
    this.file = join(dir, 'grants.json')
  }

  private async load(): Promise<string[]> {
    if (this.paths) return this.paths
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      const raw = (parsed as { paths?: unknown } | null)?.paths
      this.paths = Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string' && p.length > 0).slice(0, this.max) : []
    } catch {
      this.paths = []
    }
    return this.paths
  }

  async list(): Promise<string[]> {
    return [...(await this.load())]
  }

  async record(path: string): Promise<void> {
    const list = await this.load()
    this.paths = [path, ...list.filter((p) => p !== path)].slice(0, this.max)
    const snapshot = JSON.stringify({ version: 1, paths: this.paths })
    // Serialize writes so the last record always wins on disk.
    this.writing = this.writing.then(async () => {
      await mkdir(this.dir, { recursive: true })
      const tmp = `${this.file}.${Date.now().toString(36)}.tmp`
      await writeFile(tmp, snapshot)
      try {
        await rename(tmp, this.file)
      } catch (e) {
        await rm(tmp, { force: true })
        throw e
      }
    })
    await this.writing.catch(() => undefined)
  }
}
