import type { ReadResult } from '../../shared/fsTypes'
import type { DonotextApi, FileChange } from '../../shared/ipc'
import type { createDocumentsStore } from '../store/documents'
import { applyExternalChange } from './externalChange'

export interface ExternalWatcherDeps {
  api: DonotextApi
  documents: ReturnType<typeof createDocumentsStore>
}

/** Applies file-watcher events to the open documents. Returns a function that stops listening. */
export function startExternalWatcher({ api, documents }: ExternalWatcherDeps): () => void {
  async function handle(ev: FileChange): Promise<void> {
    if (ev.kind === 'add') return
    for (const d of Object.values(documents.getState().docs)) {
      // A copy has its own text; the file changing on disk is reported on the original only.
      if (d.fork || d.path !== ev.path) continue
      let kind: 'change' | 'unlink' = ev.kind
      let disk: ReadResult | undefined
      if (kind === 'change') {
        try {
          disk = await api.readFile(d.path)
        } catch {
          kind = 'unlink' // unreadable now: treat as gone
        }
      }
      const current = documents.getState().docs[d.id]
      if (!current) continue // closed while we were reading
      const { action } = applyExternalChange(current, { kind }, disk)
      if (action === 'reload' && disk) documents.getState().reload(d.id, disk)
      else if (action === 'banner') documents.getState().setExternal(d.id, 'changed')
      else if (action === 'markDeleted') documents.getState().setExternal(d.id, 'deleted')
    }
  }
  return api.onFileChanged((ev) => void handle(ev))
}
