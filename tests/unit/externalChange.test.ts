import { describe, expect, it } from 'vitest'
import { applyExternalChange, pushRecent } from '../../src/renderer/app/externalChange'
import type { Doc } from '../../src/renderer/store/documents'
import type { ReadResult } from '../../src/shared/fsTypes'

const doc = (over: Partial<Doc> = {}): Doc => ({
  id: 'doc-1',
  path: '/w/a.md',
  name: 'a.md',
  text: 'v1',
  baseline: 'v1',
  baselineNormalized: 'v1',
  eol: 'lf',
  bom: false,
  encoding: 'utf-8',
  readOnly: false,
  sourceOnly: false,
  warning: null,
  version: 0,
  external: 'none',
  ...over
})
const read = (text: string): ReadResult => ({ path: '/w/a.md', text, eol: 'lf', bom: false, kind: 'markdown', readOnly: false })

describe('applyExternalChange', () => {
  it('reloads a clean document when the file changed on disk', () => {
    expect(applyExternalChange(doc(), { kind: 'change' }, read('v2')).action).toBe('reload')
  })
  it('shows a banner instead of reloading a modified document', () => {
    expect(applyExternalChange(doc({ text: 'edited' }), { kind: 'change' }, read('v2')).action).toBe('banner')
  })
  it('ignores the echo of our own save (disk equals the saved baseline)', () => {
    expect(applyExternalChange(doc({ text: 'v1' }), { kind: 'change' }, read('v1')).action).toBe('none')
    expect(applyExternalChange(doc({ text: 'edited' }), { kind: 'change' }, read('v1')).action).toBe('none')
  })
  it('marks the document deleted on unlink, even if modified', () => {
    expect(applyExternalChange(doc(), { kind: 'unlink' }).action).toBe('markDeleted')
    expect(applyExternalChange(doc({ text: 'edited' }), { kind: 'unlink' }).action).toBe('markDeleted')
  })
  it('falls back to reload/banner when the disk content is unknown', () => {
    expect(applyExternalChange(doc(), { kind: 'change' }).action).toBe('reload')
    expect(applyExternalChange(doc({ text: 'edited' }), { kind: 'change' }).action).toBe('banner')
  })
})

describe('pushRecent', () => {
  it('puts the newest first and removes duplicates', () => {
    expect(pushRecent(['/a', '/b', '/c'], '/b')).toEqual(['/b', '/a', '/c'])
  })
  it('caps the list length (default 10)', () => {
    const many = Array.from({ length: 10 }, (_, i) => `/f${i}`)
    const next = pushRecent(many, '/new')
    expect(next).toHaveLength(10)
    expect(next[0]).toBe('/new')
    expect(next).not.toContain('/f9')
    expect(pushRecent(['/a', '/b'], '/c', 2)).toEqual(['/c', '/a'])
  })
})
