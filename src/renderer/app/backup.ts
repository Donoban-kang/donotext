import type { DonotextApi } from '../../shared/ipc'
import type { createDocumentsStore } from '../store/documents'

export interface BackupDeps {
  api: DonotextApi
  documents: ReturnType<typeof createDocumentsStore>
}

/** Keeps one backup file per modified document and removes it once the document is saved or closed. */
export function createBackupWriter({ api, documents }: BackupDeps) {
  const backedUp = new Map<string, number>() // doc id -> version last written

  async function tick(): Promise<void> {
    const state = documents.getState()
    for (const d of Object.values(state.docs)) {
      try {
        if (state.isDirty(d.id)) {
          if (backedUp.get(d.id) !== d.version) {
            await api.writeBackup(d.id, d.text)
            backedUp.set(d.id, d.version)
          }
        } else if (backedUp.has(d.id)) {
          await api.clearBackup(d.id)
          backedUp.delete(d.id)
        }
      } catch {
        // Retried on the next tick; a failing backup must never disturb editing.
      }
    }
    for (const id of [...backedUp.keys()]) {
      if (state.docs[id]) continue
      try {
        await api.clearBackup(id)
        backedUp.delete(id)
      } catch {
        // retried on the next tick
      }
    }
  }

  return { tick }
}

/**
 * Backs up on a fixed interval and also shortly after the last edit, so a crash loses seconds, not minutes.
 */
export function startBackups(deps: BackupDeps, intervalMs = 30_000, afterEditMs = 2_000): () => void {
  const writer = createBackupWriter(deps)
  const interval = setInterval(() => void writer.tick(), intervalMs)
  let pending: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = deps.documents.subscribe(() => {
    if (pending !== undefined) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = undefined
      void writer.tick()
    }, afterEditMs)
  })
  const onHide = (): void => void writer.tick()
  window.addEventListener('beforeunload', onHide)
  return () => {
    clearInterval(interval)
    if (pending !== undefined) clearTimeout(pending)
    unsubscribe()
    window.removeEventListener('beforeunload', onHide)
  }
}
