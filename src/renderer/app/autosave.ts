import type { createDocumentsStore } from '../store/documents'

export interface AutoSaveDeps {
  documents: ReturnType<typeof createDocumentsStore>
  save(docId: string): Promise<boolean>
  enabled(): boolean
  /** Milliseconds to wait after the last edit; a function is read again for every edit. */
  delayMs?: number | (() => number)
}

/** Saves modified, file-backed documents a short while after their last edit. */
export function createAutoSaver({ documents, save, enabled, delayMs = 1500 }: AutoSaveDeps) {
  const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; version: number }>()

  const cancel = (id: string): void => {
    const cur = timers.get(id)
    if (cur) clearTimeout(cur.timer)
    timers.delete(id)
  }

  const evaluate = (): void => {
    const state = documents.getState()
    for (const d of Object.values(state.docs)) {
      // Edited copies are never written automatically: they must not touch the original.
      const eligible = enabled() && d.path !== null && !d.readOnly && !d.fork && state.isDirty(d.id)
      if (!eligible) {
        cancel(d.id)
        continue
      }
      const cur = timers.get(d.id)
      if (cur && cur.version === d.version) continue
      cancel(d.id)
      const timer = setTimeout(() => {
        timers.delete(d.id)
        const s = documents.getState()
        if (s.docs[d.id] && enabled() && s.isDirty(d.id)) void save(d.id)
      }, typeof delayMs === 'function' ? delayMs() : delayMs)
      timers.set(d.id, { timer, version: d.version })
    }
    for (const id of [...timers.keys()]) if (!state.docs[id]) cancel(id)
  }

  const unsubscribe = documents.subscribe(evaluate)
  return {
    /** Re-evaluates all documents, e.g. after the setting was switched on. */
    recheck: evaluate,
    dispose(): void {
      unsubscribe()
      for (const id of [...timers.keys()]) cancel(id)
    }
  }
}
