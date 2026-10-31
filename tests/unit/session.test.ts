import { describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { captureSession, parseSession, restoreSession } from '../../src/renderer/app/session'
import { findLeaf, splitLeaf, allLeaves } from '../../src/renderer/layout/tree'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'
import { createWorkspaceStore } from '../../src/renderer/store/workspace'

function stores() {
  return { documents: createDocumentsStore(), layout: createLayoutStore(), workspace: createWorkspaceStore() }
}

describe('parseSession', () => {
  const valid = {
    version: 1,
    layout: { type: 'leaf', id: 'leaf-1', tabs: [], active: 0 },
    docs: [{ id: 'doc-1', path: '/w/a.md' }, { id: 'doc-2', path: null }],
    folder: '/w',
    activeLeafId: 'leaf-1',
    recent: ['/w/a.md']
  }
  it('accepts a well-formed session', () => {
    expect(parseSession(valid)).toEqual(valid)
  })
  it.each([null, 1, 'x', [], { version: 2 }, { ...valid, docs: 'nope' }, { ...valid, docs: [{ id: 5 }] }])('rejects %j', (bad) => {
    expect(parseSession(bad)).toBeNull()
  })
  it('falls back to a fresh layout when the layout is invalid but keeps the rest', () => {
    const s = parseSession({ ...valid, layout: { garbage: true } })!
    expect(s.layout.type).toBe('leaf')
    expect(s.docs).toHaveLength(2)
  })
  it('drops non-string recent entries and caps the list at 10', () => {
    const recent = [...Array.from({ length: 15 }, (_, i) => `/f${i}`), 7, null]
    expect(parseSession({ ...valid, recent })!.recent).toHaveLength(10)
  })
  it('treats a non-string folder as no folder', () => {
    expect(parseSession({ ...valid, folder: 5 })!.folder).toBeNull()
  })
})

describe('capture and restore', () => {
  async function scenario() {
    const { api, controller } = createMockApi({ '/w/a.md': '# A\n', '/w/한글 문서.md': '둘째\n' })
    const first = stores()
    const notify = vi.fn()
    const open = async (path: string) => {
      controller.queueOpen([path])
      const r = await api.openFileDialog()
      return first.documents.getState().open(r[0])
    }
    const a = await open('/w/a.md')
    first.layout.getState().openDoc(a)
    const leaf1 = first.layout.getState().activeLeafId
    first.layout.getState().setRoot(splitLeaf(first.layout.getState().root, leaf1, 'row', 'after'))
    const second = allLeaves(first.layout.getState().root)[1].id
    first.layout.getState().focusLeaf(second)
    const b = await open('/w/한글 문서.md')
    first.layout.getState().openDoc(b, 'source')
    const untitled = first.documents.getState().openUntitled()
    first.layout.getState().openDoc(untitled)
    first.documents.getState().setText(untitled, '아직 저장 안 한 글', 'p')
    first.documents.getState().setText(a, '# A 수정\n', 'p')
    first.workspace.getState().setRoot('/w')
    first.workspace.getState().addRecent('/w/a.md')
    await api.saveSession(captureSession(first))
    // The backup timer would have written these:
    await api.writeBackup(untitled, '아직 저장 안 한 글')
    await api.writeBackup(a, '# A 수정\n')
    return { api, controller, first, notify, ids: { a, b, untitled }, leaves: { leaf1, second } }
  }

  it('restores layout, documents, unsaved edits, folder and recent files into fresh stores', async () => {
    const { api, notify } = await scenario()
    const next = stores()
    expect(await restoreSession({ api, ...next, notify })).toBe(true)

    const docs = Object.values(next.documents.getState().docs)
    expect(docs.map((d) => d.path ?? '').sort()).toEqual(['', '/w/a.md', '/w/한글 문서.md'])
    const byPath = (p: string | null) => docs.find((d) => d.path === p)!
    expect(byPath('/w/a.md').text).toBe('# A 수정\n')
    expect(next.documents.getState().isDirty(byPath('/w/a.md').id)).toBe(true)
    expect(byPath(null).text).toBe('아직 저장 안 한 글')
    expect(byPath('/w/한글 문서.md').text).toBe('둘째\n')

    const leaves = allLeaves(next.layout.getState().root)
    expect(leaves).toHaveLength(2)
    expect(leaves[0].tabs).toEqual([{ kind: 'doc', docId: byPath('/w/a.md').id, view: 'wysiwyg' }])
    expect(leaves[1].tabs.map((t) => t.kind === 'doc' && t.view)).toEqual(['source', 'wysiwyg'])
    expect(next.workspace.getState().root).toBe('/w')
    expect(next.workspace.getState().recent).toEqual(['/w/a.md'])
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info' }))
  })

  it('keeps the active pane', async () => {
    const { api, notify, leaves } = await scenario()
    const next = stores()
    await restoreSession({ api, ...next, notify })
    const restoredLeaves = allLeaves(next.layout.getState().root)
    expect(next.layout.getState().activeLeafId).toBe(restoredLeaves[1].id)
    expect(leaves.second).toBe(restoredLeaves[1].id)
  })

  it('keeps unsaved edits of a file that has gone missing by reopening them as an untitled document', async () => {
    const { api, controller, notify } = await scenario()
    controller.files.delete('/w/a.md') // moved, renamed or on an unmounted drive
    const next = stores()
    expect(await restoreSession({ api, ...next, notify })).toBe(true)
    const docs = Object.values(next.documents.getState().docs)
    expect(docs.map((d) => d.path)).not.toContain('/w/a.md')
    const rescued = docs.find((d) => d.text === '# A 수정\n')
    expect(rescued).toBeDefined()
    expect(rescued!.path).toBeNull()
    expect(next.documents.getState().isDirty(rescued!.id)).toBe(true)
    expect(next.layout.getState().docRefs(rescued!.id)).toBe(1) // still has a tab
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }))
  })

  it('drops a missing file that has no unsaved edits, without failing', async () => {
    const { api, controller, notify } = await scenario()
    controller.files.delete('/w/한글 문서.md') // this one has no backup
    const next = stores()
    expect(await restoreSession({ api, ...next, notify })).toBe(true)
    expect(Object.values(next.documents.getState().docs).some((d) => d.name.includes('한글'))).toBe(false)
    expect(allLeaves(next.layout.getState().root).flatMap((l) => l.tabs)).toHaveLength(2)
  })

  it('recovers a backup whose document is not in the saved session', async () => {
    const { api, notify } = await scenario()
    await api.writeBackup('orphan-1', '세션에 없는 문서의 내용')
    const next = stores()
    await restoreSession({ api, ...next, notify })
    const orphan = Object.values(next.documents.getState().docs).find((d) => d.text === '세션에 없는 문서의 내용')
    expect(orphan).toBeDefined()
    expect(orphan!.path).toBeNull()
    expect(await api.loadBackups()).not.toHaveProperty('orphan-1')
  })

  it('drops an untitled document that has no backup content', async () => {
    const { api, notify, first } = await scenario()
    const empty = first.documents.getState().openUntitled()
    first.layout.getState().openDoc(empty)
    await api.saveSession(captureSession(first))
    const next = stores()
    await restoreSession({ api, ...next, notify })
    const untitled = Object.values(next.documents.getState().docs).filter((d) => d.path === null)
    expect(untitled).toHaveLength(1)
  })

  it('returns false and leaves the stores untouched when there is no saved session', async () => {
    const { api } = createMockApi()
    const next = stores()
    expect(await restoreSession({ api, ...next, notify: vi.fn() })).toBe(false)
    expect(Object.keys(next.documents.getState().docs)).toHaveLength(0)
  })

  it('clears the old run\'s backups after restoring them', async () => {
    const { api, notify, ids } = await scenario()
    const next = stores()
    await restoreSession({ api, ...next, notify })
    const left = await api.loadBackups()
    expect(Object.keys(left)).not.toContain(ids.untitled)
    expect(findLeaf(next.layout.getState().root, next.layout.getState().activeLeafId)).toBeDefined()
  })
})
