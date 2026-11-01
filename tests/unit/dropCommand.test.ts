import { describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { createCommands } from '../../src/renderer/app/commands'
import { allLeaves } from '../../src/renderer/layout/tree'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'

function setup(seed: Record<string, string>) {
  const { api, controller } = createMockApi(seed)
  const documents = createDocumentsStore()
  const layout = createLayoutStore()
  const notify = vi.fn()
  const openFolder = vi.fn()
  const commands = createCommands({ api, documents, layout, confirmUnsaved: async () => 'cancel', notify, flush: () => undefined, openFolder })
  return { controller, documents, layout, commands, notify, openFolder }
}

const tabsOf = (layout: ReturnType<typeof createLayoutStore>, leafId?: string) =>
  allLeaves(layout.getState().root)
    .filter((l) => !leafId || l.id === leafId)
    .flatMap((l) => l.tabs)

describe('openDropped', () => {
  it('opens dropped files as tabs, markdown for md and source-only for json', async () => {
    const c = setup({ '/w/a.md': '# a\n', '/w/b.json': '{}\n' })
    c.controller.queueDrop(['/w/a.md', '/w/b.json'])
    await c.commands.openDropped()
    const views = tabsOf(c.layout).map((t) => (t.kind === 'doc' ? t.view : ''))
    expect(views).toEqual(['wysiwyg', 'source'])
  })

  it('replaces an empty, untouched \"제목 없음\" document with the dropped file', async () => {
    const c = setup({ '/w/a.md': '# a\n' })
    c.commands.newUntitled()
    c.controller.queueDrop(['/w/a.md'])
    await c.commands.openDropped()
    expect(tabsOf(c.layout)).toHaveLength(1)
    expect(Object.values(c.documents.getState().docs).map((d) => d.path)).toEqual(['/w/a.md'])
  })

  it('keeps an untitled document that has text, and several dropped files all open', async () => {
    const c = setup({ '/w/a.md': 'a\n', '/w/b.md': 'b\n' })
    c.commands.newUntitled()
    const untitled = Object.values(c.documents.getState().docs)[0].id
    c.documents.getState().setText(untitled, 'typed', 'p')
    c.controller.queueDrop(['/w/a.md', '/w/b.md'])
    await c.commands.openDropped()
    expect(tabsOf(c.layout)).toHaveLength(3)
  })

  it('a dropped folder opens in the sidebar and does not touch the untitled document', async () => {
    const c = setup({ '/w/notes/a.md': 'a\n' })
    c.commands.newUntitled()
    c.controller.queueDrop(['/w/notes'])
    await c.commands.openDropped()
    expect(c.openFolder).toHaveBeenCalledWith('/w/notes')
    expect(tabsOf(c.layout)).toHaveLength(1)
    expect(Object.values(c.documents.getState().docs)[0].path).toBeNull()
  })

  it('tells the user about binary files and still opens the rest', async () => {
    const c = setup({ '/w/a.md': 'a\n', '/w/pic.png': 'PNG\u0000\u0001' })
    c.controller.queueDrop(['/w/pic.png', '/w/a.md'])
    await c.commands.openDropped()
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning', message: expect.stringContaining('pic.png') }))
    expect(tabsOf(c.layout)).toHaveLength(1)
  })

  it('opens in the pane it was dropped on', async () => {
    const c = setup({ '/w/a.md': 'a\n' })
    c.layout.getState().splitActive('row')
    const [left, right] = allLeaves(c.layout.getState().root)
    c.controller.queueDrop(['/w/a.md'])
    await c.commands.openDropped(left.id)
    expect(tabsOf(c.layout, left.id)).toHaveLength(1)
    expect(tabsOf(c.layout, right.id)).toHaveLength(0)
  })

  it('opening an already open file just shows its tab again', async () => {
    const c = setup({ '/w/a.md': 'a\n' })
    c.controller.queueDrop(['/w/a.md'])
    await c.commands.openDropped()
    c.controller.queueDrop(['/w/a.md'])
    await c.commands.openDropped()
    expect(Object.keys(c.documents.getState().docs)).toHaveLength(1)
    expect(tabsOf(c.layout)).toHaveLength(1)
  })
})
