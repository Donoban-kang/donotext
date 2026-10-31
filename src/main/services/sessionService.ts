import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SessionData } from '../../shared/session'
import type { FsService } from './fsService'
import type { GrantStore } from './grantStore'
import type { SessionStore } from './sessionStore'

/**
 * Session persistence plus the memory of user-approved locations.
 * The session file is written with data from the renderer, so it is returned as data but never
 * used to grant file access; access comes only from locations the user approved in a dialog.
 */
export class SessionService {
  constructor(
    private readonly store: SessionStore,
    private readonly grants: GrantStore,
    private readonly fs: FsService
  ) {}

  /** Grant access now and remember the approval for the next start. */
  async grant(path: string): Promise<void> {
    this.fs.grant(path)
    await this.grants.record(path)
  }

  async load(): Promise<SessionData | null> {
    for (const p of await this.grants.list()) {
      this.fs.grant(p)
      try {
        // A document the user opened by file may show images saved next to it (see ImageService).
        if ((await stat(p)).isFile()) this.fs.grant(join(dirname(p), 'assets'))
      } catch {
        // the path no longer exists: its grant is harmless
      }
    }
    return this.store.load()
  }

  save(s: SessionData): Promise<void> {
    return this.store.save(s)
  }

  writeBackup(docId: string, text: string): Promise<void> {
    return this.store.writeBackup(docId, text)
  }

  clearBackup(docId: string): Promise<void> {
    return this.store.clearBackup(docId)
  }

  readBackups(): Promise<Record<string, string>> {
    return this.store.readBackups()
  }
}
