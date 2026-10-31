import { create } from 'zustand'
import type { ReadResult, Warning } from '../../shared/fsTypes'
import type { Eol } from '../../shared/textFormat'

export interface Doc {
  id: string
  path: string | null
  name: string
  text: string
  baseline: string
  baselineNormalized: string
  eol: Eol
  bom: boolean
  readOnly: boolean
  sourceOnly: boolean
  warning: Warning | null
  version: number
  external: 'none' | 'changed' | 'deleted'
}

export type TextListener = (text: string, origin: string) => void

export interface DocumentsState {
  docs: Record<string, Doc>
  open(r: ReadResult): string
  openUntitled(): string
  setText(id: string, text: string, origin: string): void
  markSaved(id: string, path?: string): void
  reload(id: string, r: ReadResult): void
  setExternal(id: string, state: Doc['external']): void
  /** Repoints documents at `oldPath` (or inside it, for folders) to `newPath`. */
  renamePath(oldPath: string, newPath: string): void
  close(id: string): void
  isDirty(id: string): boolean
  subscribeText(id: string, cb: TextListener): () => void
  setNormalizer(fn: (md: string) => string): void
}

function baseName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

export function createDocumentsStore() {
  let normalizer: (md: string) => string = (md) => md
  const listeners = new Map<string, Set<TextListener>>()
  let counter = 0
  // Unique per run so ids of backups left by an earlier run can never collide with new documents.
  const run = Date.now().toString(36)
  let untitledCounter = 0

  const normalizedBaseline = (text: string, sourceOnly: boolean): string => {
    if (sourceOnly) return text
    try {
      return normalizer(text)
    } catch {
      return text // parse failure: treat the raw text as the only clean state
    }
  }

  const notify = (id: string, text: string, origin: string): void => {
    listeners.get(id)?.forEach((cb) => cb(text, origin))
  }

  return create<DocumentsState>()((set, get) => ({
    docs: {},

    open(r) {
      const existing = Object.values(get().docs).find((d) => d.path === r.path)
      if (existing) return existing.id
      const id = `doc-${run}-${++counter}`
      const sourceOnly = r.kind === 'sourceOnly'
      const doc: Doc = {
        id,
        path: r.path,
        name: baseName(r.path),
        text: r.text,
        baseline: r.text,
        baselineNormalized: normalizedBaseline(r.text, sourceOnly),
        eol: r.eol,
        bom: r.bom,
        readOnly: r.readOnly,
        sourceOnly,
        warning: r.warning ?? null,
        version: 0,
        external: 'none'
      }
      set((s) => ({ docs: { ...s.docs, [id]: doc } }))
      return id
    },

    openUntitled() {
      const id = `doc-${run}-${++counter}`
      const doc: Doc = {
        id,
        path: null,
        name: `제목 없음 ${++untitledCounter}`,
        text: '',
        baseline: '',
        baselineNormalized: '',
        eol: 'lf',
        bom: false,
        readOnly: false,
        sourceOnly: false,
        warning: null,
        version: 0,
        external: 'none'
      }
      set((s) => ({ docs: { ...s.docs, [id]: doc } }))
      return id
    },

    setText(id, text, origin) {
      const doc = get().docs[id]
      if (!doc || doc.readOnly || doc.text === text) return
      set((s) => ({ docs: { ...s.docs, [id]: { ...doc, text, version: doc.version + 1 } } }))
      notify(id, text, origin)
    },

    markSaved(id, path) {
      const doc = get().docs[id]
      if (!doc) return
      const next: Doc = { ...doc, baseline: doc.text, baselineNormalized: doc.text, external: 'none' }
      if (path) {
        next.path = path
        next.name = baseName(path)
        // Saving under a new path writes valid UTF-8, so a read-only/lossy document becomes editable.
        next.readOnly = false
        next.warning = null
      }
      set((s) => ({ docs: { ...s.docs, [id]: next } }))
    },

    reload(id, r) {
      const doc = get().docs[id]
      if (!doc) return
      const sourceOnly = r.kind === 'sourceOnly'
      const next: Doc = {
        ...doc,
        text: r.text,
        baseline: r.text,
        baselineNormalized: normalizedBaseline(r.text, sourceOnly),
        eol: r.eol,
        bom: r.bom,
        readOnly: r.readOnly,
        sourceOnly,
        warning: r.warning ?? null,
        version: doc.version + 1,
        external: 'none'
      }
      set((s) => ({ docs: { ...s.docs, [id]: next } }))
      notify(id, r.text, 'reload')
    },

    setExternal(id, state) {
      const doc = get().docs[id]
      if (!doc) return
      set((s) => ({ docs: { ...s.docs, [id]: { ...doc, external: state } } }))
    },

    renamePath(oldPath, newPath) {
      set((s) => {
        const docs: Record<string, Doc> = {}
        for (const [id, d] of Object.entries(s.docs)) {
          if (d.path === oldPath || d.path?.startsWith(`${oldPath}/`)) {
            const path = newPath + d.path.slice(oldPath.length)
            docs[id] = { ...d, path, name: baseName(path) }
          } else docs[id] = d
        }
        return { docs }
      })
    },

    close(id) {
      listeners.delete(id)
      set((s) => {
        const { [id]: _removed, ...rest } = s.docs
        return { docs: rest }
      })
    },

    isDirty(id) {
      const doc = get().docs[id]
      if (!doc) return false
      return doc.text !== doc.baseline && doc.text !== doc.baselineNormalized
    },

    subscribeText(id, cb) {
      let set_ = listeners.get(id)
      if (!set_) {
        set_ = new Set()
        listeners.set(id, set_)
      }
      set_.add(cb)
      return () => {
        listeners.get(id)?.delete(cb)
      }
    },

    setNormalizer(fn) {
      normalizer = fn
      set((s) => {
        const docs: Record<string, Doc> = {}
        for (const [id, d] of Object.entries(s.docs)) {
          docs[id] = { ...d, baselineNormalized: normalizedBaseline(d.baseline, d.sourceOnly) }
        }
        return { docs }
      })
    }
  }))
}

export const useDocuments = createDocumentsStore()
