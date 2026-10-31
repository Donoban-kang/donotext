import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import type { ReadResult } from '../../src/shared/fsTypes'

const read = (over: Partial<ReadResult> = {}): ReadResult => ({
  path: '/w/a.md',
  text: '* item\n',
  eol: 'lf',
  bom: false,
  kind: 'markdown',
  readOnly: false,
  ...over
})

// A normalizer that rewrites "* " bullets to "- " like a WYSIWYG roundtrip would.
const normalize = (md: string): string => md.replace(/^\* /gm, '- ')

let store: ReturnType<typeof createDocumentsStore>
beforeEach(() => {
  store = createDocumentsStore()
  store.getState().setNormalizer(normalize)
})

describe('dirty tracking', () => {
  it('is clean right after opening even when normalization changes the text', () => {
    const id = store.getState().open(read())
    expect(store.getState().docs[id].text).toBe('* item\n') // original is not rewritten
    expect(store.getState().isDirty(id)).toBe(false)
  })
  it('becomes dirty after an edit and clean after markSaved', () => {
    const id = store.getState().open(read())
    store.getState().setText(id, '* item\nmore\n', 'paneA')
    expect(store.getState().isDirty(id)).toBe(true)
    store.getState().markSaved(id)
    expect(store.getState().isDirty(id)).toBe(false)
  })
  it('treats the normalized form of the original as clean', () => {
    const id = store.getState().open(read())
    store.getState().setText(id, '- item\n', 'paneA')
    expect(store.getState().isDirty(id)).toBe(false)
  })
  it('does not normalize sourceOnly documents', () => {
    const id = store.getState().open(read({ path: '/w/x.json', kind: 'sourceOnly' }))
    expect(store.getState().docs[id].sourceOnly).toBe(true)
    store.getState().setText(id, '- item\n', 'paneA')
    expect(store.getState().isDirty(id)).toBe(true)
  })
  it('falls back to the raw baseline when the normalizer throws', () => {
    store.getState().setNormalizer(() => {
      throw new Error('parse failure')
    })
    const id = store.getState().open(read())
    expect(store.getState().isDirty(id)).toBe(false)
  })
  it('recomputes baselineNormalized for open documents when the normalizer changes', () => {
    const fresh = createDocumentsStore()
    const id = fresh.getState().open(read())
    fresh.getState().setNormalizer(normalize)
    fresh.getState().setText(id, '- item\n', 'paneA')
    expect(fresh.getState().isDirty(id)).toBe(false)
  })
})

describe('open / close', () => {
  it('returns the same id for the same path', () => {
    const a = store.getState().open(read())
    const b = store.getState().open(read())
    expect(b).toBe(a)
    expect(Object.keys(store.getState().docs)).toHaveLength(1)
  })
  it('opens untitled documents with unique ids and no path', () => {
    const a = store.getState().openUntitled()
    const b = store.getState().openUntitled()
    expect(a).not.toBe(b)
    expect(store.getState().docs[a].path).toBeNull()
  })
  it('removes a closed document', () => {
    const id = store.getState().open(read())
    store.getState().close(id)
    expect(store.getState().docs[id]).toBeUndefined()
  })
})

describe('setText and subscriptions', () => {
  it('notifies subscribers with text and origin and bumps version', () => {
    const id = store.getState().open(read())
    const cb = vi.fn()
    store.getState().subscribeText(id, cb)
    const v0 = store.getState().docs[id].version
    store.getState().setText(id, 'x', 'paneA')
    expect(cb).toHaveBeenCalledWith('x', 'paneA')
    expect(store.getState().docs[id].version).toBe(v0 + 1)
  })
  it('ignores a setText that does not change the text', () => {
    const id = store.getState().open(read())
    const cb = vi.fn()
    store.getState().subscribeText(id, cb)
    const v0 = store.getState().docs[id].version
    store.getState().setText(id, '* item\n', 'paneA')
    expect(cb).not.toHaveBeenCalled()
    expect(store.getState().docs[id].version).toBe(v0)
  })
  it('stops notifying after unsubscribe', () => {
    const id = store.getState().open(read())
    const cb = vi.fn()
    const off = store.getState().subscribeText(id, cb)
    off()
    store.getState().setText(id, 'x', 'paneA')
    expect(cb).not.toHaveBeenCalled()
  })
  it('ignores edits to read-only documents', () => {
    const id = store.getState().open(read({ readOnly: true }))
    store.getState().setText(id, 'x', 'paneA')
    expect(store.getState().docs[id].text).toBe('* item\n')
  })
})

describe('save and reload', () => {
  it('keeps CRLF and BOM through markSaved', () => {
    const id = store.getState().open(read({ eol: 'crlf', bom: true }))
    store.getState().setText(id, 'changed\n', 'paneA')
    store.getState().markSaved(id)
    const d = store.getState().docs[id]
    expect(d.eol).toBe('crlf')
    expect(d.bom).toBe(true)
  })
  it('markSaved with a path assigns path and name to an untitled document', () => {
    const id = store.getState().openUntitled()
    store.getState().setText(id, 'hi', 'paneA')
    store.getState().markSaved(id, '/w/한글 문서.txt')
    const d = store.getState().docs[id]
    expect(d.path).toBe('/w/한글 문서.txt')
    expect(d.name).toBe('한글 문서.txt')
    expect(store.getState().isDirty(id)).toBe(false)
  })
  it('markSaved with a new path makes a read-only (non-UTF-8) document editable and clears its warning', () => {
    const id = store.getState().open(read({ readOnly: true, warning: 'notUtf8' }))
    expect(store.getState().docs[id].warning).toBe('notUtf8')
    store.getState().markSaved(id, '/w/copy.md')
    expect(store.getState().docs[id].readOnly).toBe(false)
    expect(store.getState().docs[id].warning).toBeNull()
  })
  it('reload replaces text, clears external state and notifies with origin "reload"', () => {
    const id = store.getState().open(read())
    const cb = vi.fn()
    store.getState().subscribeText(id, cb)
    store.getState().setExternal(id, 'changed')
    store.getState().reload(id, read({ text: 'fresh\n' }))
    expect(store.getState().docs[id].text).toBe('fresh\n')
    expect(store.getState().docs[id].external).toBe('none')
    expect(store.getState().isDirty(id)).toBe(false)
    expect(cb).toHaveBeenCalledWith('fresh\n', 'reload')
  })
})
