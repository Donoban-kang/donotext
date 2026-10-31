import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionData } from '../../shared/session'

const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/

function assertDocId(id: string): void {
  if (!DOC_ID.test(id)) throw new Error(`Invalid document id: ${JSON.stringify(id)}`)
}

/** Persists session.json and unsaved-content backups under the app's user-data folder. */
export class SessionStore {
  private readonly sessionFile: string
  private readonly backupDir: string

  constructor(private readonly dir: string) {
    this.sessionFile = join(dir, 'session.json')
    this.backupDir = join(dir, 'backup')
  }

  async load(): Promise<SessionData | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.sessionFile, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
      return (parsed as { version?: unknown }).version === 1 ? (parsed as SessionData) : null
    } catch {
      return null
    }
  }

  async save(s: SessionData): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const tmp = `${this.sessionFile}.${Date.now().toString(36)}.tmp`
    await writeFile(tmp, JSON.stringify(s))
    try {
      await rename(tmp, this.sessionFile)
    } catch (e) {
      await rm(tmp, { force: true })
      throw e
    }
  }

  async writeBackup(docId: string, text: string): Promise<void> {
    assertDocId(docId)
    await mkdir(this.backupDir, { recursive: true })
    await writeFile(join(this.backupDir, `${docId}.md`), text, 'utf8')
  }

  async clearBackup(docId: string): Promise<void> {
    assertDocId(docId)
    await rm(join(this.backupDir, `${docId}.md`), { force: true })
  }

  async readBackups(): Promise<Record<string, string>> {
    let names: string[]
    try {
      names = await readdir(this.backupDir)
    } catch {
      return {}
    }
    const out: Record<string, string> = {}
    for (const name of names) {
      const m = /^([A-Za-z0-9_-]{1,64})\.md$/.exec(name)
      if (m) out[m[1]] = await readFile(join(this.backupDir, name), 'utf8')
    }
    return out
  }
}
