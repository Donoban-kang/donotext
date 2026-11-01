import { describe, expect, it } from 'vitest'
import { createEditRouter, hasCopies } from '../../src/renderer/editor/editRouter'
import { allLeaves } from '../../src/renderer/layout/tree'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'

function setup(sync = false) {
  const documents = createDocumentsStore()
  const layout = createLayoutStore()
  const route = createEditRouter({ documents, layout, splitSync: () => sync })
  const id = documents.getState().open({ path: '/w/a.md', text: 'hello', eol: 'lf', bom: false, readOnly: false, kind: 'markdown' })
  layout.getState().openDoc(id)
  return { documents, layout, route, id }
}

/** Shows the same file in a second pane, the way "좌우 분할" does. */
function split(layout: ReturnType<typeof createLayoutStore>, id: string) {
  layout.getState().splitActive('row')
  layout.getState().openDoc(id)
  const leaves = allLeaves(layout.getState().root)
  return { left: leaves[0].id, right: leaves[1].id }
}

describe('editRouter', () => {
  it('edits go straight to the document while it is shown in only one pane', () => {
    const { route, id, layout } = setup()
    expect(route(id, layout.getState().activeLeafId)).toBe(id)
  })

  it('editing one of two panes splits that pane off as a copy and leaves the other on the original', () => {
    const { documents, layout, route, id } = setup()
    const { left, right } = split(layout, id)
    const target = route(id, right)
    expect(target).not.toBe(id)
    const copy = documents.getState().docs[target]
    expect(copy.fork).toBe(true)
    expect(copy.path).toBe('/w/a.md')
    expect(copy.baseline).toBe('hello')
    const docOf = (leafId: string) => {
      const tab = allLeaves(layout.getState().root).find((l) => l.id === leafId)!.tabs[0]
      return tab.kind === 'doc' ? tab.docId : ''
    }
    expect(docOf(right)).toBe(target)
    expect(docOf(left)).toBe(id)
    expect(documents.getState().docs[id].text).toBe('hello')
  })

  it('once a copy exists, editing the original pane makes a second copy instead of touching the original', () => {
    const { documents, layout, route, id } = setup()
    const { left, right } = split(layout, id)
    const first = route(id, right)
    const second = route(id, left)
    expect(second).not.toBe(first)
    expect(documents.getState().docs[second].fork).toBe(true)
    // Nothing shows the original any more, so it is released.
    expect(documents.getState().docs[id]).toBeUndefined()
  })

  it('keeps editing the same copy once a pane has its own', () => {
    const { layout, route, id } = setup()
    const { right } = split(layout, id)
    const copy = route(id, right)
    expect(route(copy, right)).toBe(copy)
  })

  it('does nothing in sync mode, and never copies read-only documents', () => {
    const synced = setup(true)
    const { right } = split(synced.layout, synced.id)
    expect(synced.route(synced.id, right)).toBe(synced.id)

    const ro = setup()
    ro.documents.setState((s) => ({ docs: { ...s.docs, [ro.id]: { ...s.docs[ro.id], readOnly: true } } }))
    const { right: r2 } = split(ro.layout, ro.id)
    expect(ro.route(ro.id, r2)).toBe(ro.id)
  })

  it('a comparison tab showing the file does not count as a second view', () => {
    const { documents, layout, route, id } = setup()
    const other = documents.getState().open({ path: '/w/b.md', text: 'x', eol: 'lf', bom: false, readOnly: false, kind: 'markdown' })
    layout.getState().openTabInActive({ kind: 'compare', leftDocId: id, rightDocId: other })
    layout.getState().activateTab(layout.getState().activeLeafId, 0)
    expect(route(id, layout.getState().activeLeafId)).toBe(id)
  })

  it('hasCopies matches by source id or path and never flags a copy itself', () => {
    const { documents, id } = setup()
    const copyId = documents.getState().forkDoc(id)!
    const docs = documents.getState().docs
    expect(hasCopies(docs, docs[id])).toBe(true)
    expect(hasCopies(docs, docs[copyId])).toBe(false)
  })
})

describe('documents: copies', () => {
  it('opening the same file again ignores copies and returns the original', () => {
    const { documents, id } = setup()
    documents.getState().forkDoc(id)
    const again = documents.getState().open({ path: '/w/a.md', text: 'hello', eol: 'lf', bom: false, readOnly: false, kind: 'markdown' })
    expect(again).toBe(id)
  })
  it('saving a copy under a new name turns it into an ordinary document', () => {
    const { documents, id } = setup()
    const copy = documents.getState().forkDoc(id)!
    documents.getState().setText(copy, 'edited', 'p')
    documents.getState().markSaved(copy, '/w/b.md', 'edited')
    const d = documents.getState().docs[copy]
    expect(d.fork).toBeUndefined()
    expect(d.name).toBe('b.md')
    expect(documents.getState().isDirty(copy)).toBe(false)
  })
})
