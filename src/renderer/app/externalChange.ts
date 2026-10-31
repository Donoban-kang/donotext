import type { ReadResult } from '../../shared/fsTypes'
import type { Doc } from '../store/documents'

export type ExternalAction = 'none' | 'reload' | 'banner' | 'markDeleted'

/** Decides how an open document reacts to a change reported by the file watcher. */
export function applyExternalChange(
  doc: Doc,
  ev: { kind: 'change' | 'unlink' },
  r?: ReadResult
): { action: ExternalAction } {
  if (ev.kind === 'unlink') return { action: 'markDeleted' }
  // Disk still equals what we last loaded or saved: this is the echo of our own write.
  if (r && r.text === doc.baseline) return { action: 'none' }
  const dirty = doc.text !== doc.baseline && doc.text !== doc.baselineNormalized
  return { action: dirty ? 'banner' : 'reload' }
}

/** Newest first, de-duplicated, capped at `max`. */
export function pushRecent(recent: string[], path: string, max = 10): string[] {
  return [path, ...recent.filter((p) => p !== path)].slice(0, max)
}
