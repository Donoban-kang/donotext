import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { createCommands } from '../../src/renderer/app/commands'
import { applyExternalChange } from '../../src/renderer/app/externalChange'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { allLeaves, countLeaves, findLeaf, MAX_LEAVES, splitLeaf } from '../../src/renderer/layout/tree'
import type { DonotextApi } from '../../src/shared/ipc'

type Choice = 'save' | 'discard' | 'cancel'

function setup(seed: Record<string, string> = { '/w/a.md': '# a\n' }, choice: Choice = 'cancel') {
  const { api, controller } = createMockApi(seed)
  const documents = createDocumentsStore()
  const layout = createLayoutStore()
  const confirmUnsaved = vi.fn(async (_name: string): Promise<Choice> => choice)
  const notify = vi.fn()
  const flush = vi.fn()
  const wrapped: DonotextApi = { ...api }
  const onFileOpened = vi.fn()
  const buildExport = vi.fn((md: string, title: string) => `<html><title>${title}</title>${md}</html>`)
  const commands = createCommands({ api: wrapped, documents, layout, confirmUnsaved, notify, flush, onFileOpened, buildExport })
  return { api: wrapped, controller, documents, layout, confirmUnsaved, notify, flush, commands, onFileOpened, buildExport }
}

async function openA(ctx: ReturnType<typeof setup>, path = '/w/a.md'): Promise<string> {
  ctx.controller.queueOpen([path])
  await ctx.commands.openFile()
  return Object.values(ctx.documents.getState().docs).find((d) => d.path === path)!.id
}

describe('openFile', () => {
  it('opens a markdown file into the active pane as a WYSIWYG tab', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    const leaf = findLeaf(ctx.layout.getState().root, ctx.layout.getState().activeLeafId)!
    expect(leaf.tabs).toEqual([{ kind: 'doc', docId: id, view: 'wysiwyg' }])
  })
  it('opens non-markdown files as source-only tabs', async () => {
    const ctx = setup({ '/w/data.json': '{}' })
    const id = await openA(ctx, '/w/data.json')
    expect(ctx.layout.getState().getActiveTab()!.tab).toMatchObject({ docId: id, view: 'source' })
    expect(ctx.documents.getState().docs[id].sourceOnly).toBe(true)
  })
  it('does not open the same file twice', async () => {
    const ctx = setup()
    const a = await openA(ctx)
    const b = await openA(ctx)
    expect(b).toBe(a)
    expect(ctx.layout.getState().docRefs(a)).toBe(1)
  })
})

describe('openPath', () => {
  it('opens a file by path into the active pane', async () => {
    const ctx = setup({ '/w/tree.md': '# t\n' })
    await ctx.commands.openPath('/w/tree.md')
    const a = ctx.layout.getState().getActiveTab()!
    expect(a.tab).toMatchObject({ kind: 'doc', view: 'wysiwyg' })
    expect(Object.values(ctx.documents.getState().docs).map((d) => d.path)).toEqual(['/w/tree.md'])
  })
  it('reports an error for an unreadable path without opening anything', async () => {
    const ctx = setup()
    await ctx.commands.openPath('/w/missing.md')
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
    expect(Object.keys(ctx.documents.getState().docs)).toHaveLength(0)
  })
})

describe('recent files and external changes', () => {
  it('reports every opened file path to onFileOpened', async () => {
    const ctx = setup({ '/w/a.md': '1', '/w/b.md': '2' })
    await openA(ctx, '/w/a.md')
    await ctx.commands.openPath('/w/b.md')
    expect(ctx.onFileOpened.mock.calls.map((c) => c[0])).toEqual(['/w/a.md', '/w/b.md'])
  })
  it('reloadFromDisk replaces the text with the disk content and clears the flag', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'mine', 'p')
    ctx.documents.getState().setExternal(id, 'changed')
    await ctx.api.writeFile('/w/a.md', 'disk\n', 'lf', false)
    await ctx.commands.reloadFromDisk(id)
    expect(ctx.documents.getState().docs[id].text).toBe('disk\n')
    expect(ctx.documents.getState().docs[id].external).toBe('none')
  })
  it('reloadFromDisk keeps the document and reports an error when the file is gone', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    await ctx.api.deleteEntry('/w/a.md')
    await ctx.commands.reloadFromDisk(id)
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
    expect(ctx.documents.getState().docs[id]).toBeDefined()
  })
  it('keepLocal clears the flag without touching the text; saving then overwrites the disk', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'mine\n', 'p')
    ctx.documents.getState().setExternal(id, 'changed')
    ctx.commands.keepLocal(id)
    expect(ctx.documents.getState().docs[id].external).toBe('none')
    expect(ctx.documents.getState().docs[id].text).toBe('mine\n')
    await ctx.commands.saveActive()
    expect((await ctx.api.readFile('/w/a.md')).text).toBe('mine\n')
  })
})

describe('open warnings', () => {
  it('records the warning on the document and notifies for tooLarge and notUtf8 files', async () => {
    const ctx = setup()
    const base = await ctx.api.readFile('/w/a.md')
    vi.spyOn(ctx.api, 'openFileDialog').mockResolvedValue([
      { ...base, path: '/w/big.md', kind: 'sourceOnly', warning: 'tooLarge' },
      { ...base, path: '/w/bad.md', readOnly: true, warning: 'notUtf8' }
    ])
    await ctx.commands.openFile()
    const docs = Object.values(ctx.documents.getState().docs)
    expect(docs.map((d) => d.warning).sort()).toEqual(['notUtf8', 'tooLarge'])
    expect(ctx.notify).toHaveBeenCalledTimes(2)
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }))
  })
  it('reports a failing open dialog instead of throwing', async () => {
    const ctx = setup()
    vi.spyOn(ctx.api, 'openFileDialog').mockRejectedValue(new Error('EPERM'))
    await expect(ctx.commands.openFile()).resolves.toBeUndefined()
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
  })
})

describe('closeTab', () => {
  it('closes a clean document without asking', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    expect(await ctx.commands.closeTab(ctx.layout.getState().activeLeafId, 0)).toBe(true)
    expect(ctx.confirmUnsaved).not.toHaveBeenCalled()
    expect(ctx.documents.getState().docs[id]).toBeUndefined()
  })
  it('keeps a dirty tab when the user cancels', async () => {
    const ctx = setup(undefined, 'cancel')
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'changed', 'p')
    expect(await ctx.commands.closeTab(ctx.layout.getState().activeLeafId, 0)).toBe(false)
    expect(ctx.confirmUnsaved).toHaveBeenCalledWith('a.md')
    expect(ctx.documents.getState().docs[id]).toBeDefined()
    expect(ctx.layout.getState().docRefs(id)).toBe(1)
  })
  it('discards changes without writing when the user chooses discard', async () => {
    const ctx = setup(undefined, 'discard')
    const id = await openA(ctx)
    const write = vi.spyOn(ctx.api, 'writeFile')
    ctx.documents.getState().setText(id, 'changed', 'p')
    expect(await ctx.commands.closeTab(ctx.layout.getState().activeLeafId, 0)).toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(ctx.documents.getState().docs[id]).toBeUndefined()
  })
  it('saves then closes when the user chooses save', async () => {
    const ctx = setup(undefined, 'save')
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'changed\n', 'p')
    expect(await ctx.commands.closeTab(ctx.layout.getState().activeLeafId, 0)).toBe(true)
    expect((await ctx.api.readFile('/w/a.md')).text).toBe('changed\n')
    expect(ctx.documents.getState().docs[id]).toBeUndefined()
  })
  it('stays open when saving from the dialog fails', async () => {
    const ctx = setup(undefined, 'save')
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'changed\n', 'p')
    vi.spyOn(ctx.api, 'writeFile').mockRejectedValue(new Error('disk full'))
    expect(await ctx.commands.closeTab(ctx.layout.getState().activeLeafId, 0)).toBe(false)
    expect(ctx.documents.getState().docs[id]).toBeDefined()
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
  })
  it('does not ask when the document is still open in another pane', async () => {
    const ctx = setup(undefined, 'cancel')
    const id = await openA(ctx)
    const first = ctx.layout.getState().activeLeafId
    ctx.layout.getState().setRoot(splitLeaf(ctx.layout.getState().root, first, 'row', 'after'))
    const second = ctx.layout.getState().root.type === 'split' ? (ctx.layout.getState().root as { children: { id: string }[] }).children[1].id : ''
    ctx.layout.getState().focusLeaf(second)
    ctx.layout.getState().openDoc(id)
    ctx.documents.getState().setText(id, 'changed', 'p')
    expect(await ctx.commands.closeTab(second, 0)).toBe(true)
    expect(ctx.confirmUnsaved).not.toHaveBeenCalled()
    expect(ctx.documents.getState().docs[id]).toBeDefined()
  })
})

describe('saveActive / saveAsActive', () => {
  it('flushes pending editor edits before reading the text, then writes and clears dirty', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    ctx.flush.mockImplementation(() => ctx.documents.getState().setText(id, 'flushed\n', 'p'))
    expect(await ctx.commands.saveActive()).toBe(true)
    expect(ctx.flush).toHaveBeenCalled()
    expect((await ctx.api.readFile('/w/a.md')).text).toBe('flushed\n')
    expect(ctx.documents.getState().isDirty(id)).toBe(false)
  })
  it('keeps the document dirty and reports an error when the write fails', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'x', 'p')
    vi.spyOn(ctx.api, 'writeFile').mockRejectedValue(new Error('EACCES'))
    expect(await ctx.commands.saveActive()).toBe(false)
    expect(ctx.documents.getState().isDirty(id)).toBe(true)
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
  })
  it('asks for a path for untitled documents and stays dirty if the dialog is cancelled', async () => {
    const ctx = setup()
    ctx.commands.newUntitled()
    const id = ctx.layout.getState().getActiveTab()!.tab.kind === 'doc' ? (ctx.layout.getState().getActiveTab()!.tab as { docId: string }).docId : ''
    ctx.documents.getState().setText(id, 'hello', 'p')
    expect(await ctx.commands.saveActive()).toBe(false)
    expect(ctx.documents.getState().isDirty(id)).toBe(true)
    ctx.controller.queueSaveAs('/w/note.txt')
    expect(await ctx.commands.saveActive()).toBe(true)
    expect(ctx.documents.getState().docs[id].name).toBe('note.txt')
    expect((await ctx.api.readFile('/w/note.txt')).text).toBe('hello')
  })
  it('accepts a .txt target in saveAs and keeps CRLF and BOM', async () => {
    const ctx = setup()
    ctx.controller.files.set('/w/crlf.md', { text: 'a\nb\n', eol: 'crlf', bom: true })
    const id = await openA(ctx, '/w/crlf.md')
    ctx.documents.getState().setText(id, 'a\nb\nc\n', 'p')
    ctx.controller.queueSaveAs('/w/copy.txt')
    expect(await ctx.commands.saveAsActive()).toBe(true)
    const r = await ctx.api.readFile('/w/copy.txt')
    expect(r.eol).toBe('crlf')
    expect(r.bom).toBe(true)
    expect(r.text).toBe('a\nb\nc\n')
  })
  it('routes saving a read-only document to Save As', async () => {
    const ctx = setup()
    ctx.controller.files.set('/w/ro.md', { text: 'x', eol: 'lf', bom: false })
    const id = await openA(ctx, '/w/ro.md')
    ctx.documents.setState((s) => ({ docs: { ...s.docs, [id]: { ...s.docs[id], readOnly: true } } }))
    ctx.controller.queueSaveAs('/w/ro-copy.md')
    expect(await ctx.commands.saveActive()).toBe(true)
    expect(ctx.documents.getState().docs[id].path).toBe('/w/ro-copy.md')
  })
})

describe('saving while the user keeps typing', () => {
  it('does not mark text clean that was never written, and the file watcher echo does not undo it', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'first\n', 'p')
    const realWrite = ctx.api.writeFile.bind(ctx.api)
    let release!: () => void
    vi.spyOn(ctx.api, 'writeFile').mockImplementation(async (path, text, eol, bom) => {
      await new Promise<void>((r) => (release = r)) // a slow disk
      await realWrite(path, text, eol, bom)
    })
    const saving = ctx.commands.saveActive()
    await Promise.resolve()
    ctx.documents.getState().setText(id, 'first\nsecond\n', 'p') // typed during the write
    release()
    expect(await saving).toBe(true)
    expect(ctx.documents.getState().isDirty(id)).toBe(true)
    expect(ctx.documents.getState().docs[id].text).toBe('first\nsecond\n')
    expect((await ctx.api.readFile('/w/a.md')).text).toBe('first\n')
    // the watcher reports our own write: it must neither reload nor flag the document
    const echo = applyExternalChange(ctx.documents.getState().docs[id], { kind: 'change' }, await ctx.api.readFile('/w/a.md'))
    expect(echo.action).toBe('none')
  })
})

describe('toggleView', () => {
  it('flips WYSIWYG and source for markdown documents', async () => {
    const ctx = setup()
    await openA(ctx)
    ctx.commands.toggleView()
    expect(ctx.layout.getState().getActiveTab()!.tab).toMatchObject({ view: 'source' })
    ctx.commands.toggleView()
    expect(ctx.layout.getState().getActiveTab()!.tab).toMatchObject({ view: 'wysiwyg' })
  })
  it('never switches a source-only document to WYSIWYG', async () => {
    const ctx = setup({ '/w/x.json': '{}' })
    await openA(ctx, '/w/x.json')
    ctx.commands.toggleView()
    expect(ctx.layout.getState().getActiveTab()!.tab).toMatchObject({ view: 'source' })
  })
})

describe('pane commands', () => {
  it('splitActive creates a pane, focuses it and shows the same document there', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    const first = ctx.layout.getState().activeLeafId
    expect(ctx.commands.splitActive('row')).toBe(true)
    const leaves = allLeaves(ctx.layout.getState().root)
    expect(leaves).toHaveLength(2)
    expect(ctx.layout.getState().activeLeafId).not.toBe(first)
    expect(findLeaf(ctx.layout.getState().root, ctx.layout.getState().activeLeafId)!.tabs).toEqual([
      { kind: 'doc', docId: id, view: 'wysiwyg' }
    ])
    expect(ctx.layout.getState().docRefs(id)).toBe(2)
  })
  it('splitActive on an empty pane creates an empty pane', () => {
    const ctx = setup()
    expect(ctx.commands.splitActive('col')).toBe(true)
    expect(allLeaves(ctx.layout.getState().root).every((l) => l.tabs.length === 0)).toBe(true)
  })
  it('refuses the 7th pane with a warning and leaves the layout unchanged', () => {
    const ctx = setup()
    for (let i = 1; i < MAX_LEAVES; i++) expect(ctx.commands.splitActive('row')).toBe(true)
    const before = ctx.layout.getState().root
    expect(ctx.commands.splitActive('col')).toBe(false)
    expect(ctx.layout.getState().root).toBe(before)
    expect(countLeaves(before)).toBe(MAX_LEAVES)
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }))
  })
  it('closePane never closes the last remaining pane', async () => {
    const ctx = setup()
    await openA(ctx)
    expect(await ctx.commands.closePane()).toBe(false)
    expect(countLeaves(ctx.layout.getState().root)).toBe(1)
    expect(Object.keys(ctx.documents.getState().docs)).toHaveLength(1)
  })
  it('closePane closes the tabs and the pane, keeping documents that other panes still show', async () => {
    const ctx = setup()
    const id = await openA(ctx)
    ctx.commands.splitActive('row')
    expect(await ctx.commands.closePane()).toBe(true)
    expect(countLeaves(ctx.layout.getState().root)).toBe(1)
    expect(ctx.documents.getState().docs[id]).toBeDefined()
    expect(ctx.layout.getState().docRefs(id)).toBe(1)
  })
  it('closePane stops when the user cancels saving a modified document', async () => {
    const ctx = setup(undefined, 'cancel')
    const id = await openA(ctx)
    ctx.commands.splitActive('row')
    // make the active pane the only holder of a modified second document
    const other = ctx.documents.getState().openUntitled()
    ctx.layout.getState().openDoc(other)
    ctx.documents.getState().setText(other, 'unsaved', 'p')
    expect(await ctx.commands.closePane()).toBe(false)
    expect(countLeaves(ctx.layout.getState().root)).toBe(2)
    expect(ctx.documents.getState().docs[other]).toBeDefined()
    expect(id).toBeDefined()
  })
  it('focusPane cycles through panes in both directions', () => {
    const ctx = setup()
    ctx.commands.splitActive('row')
    ctx.commands.splitActive('row')
    const ids = allLeaves(ctx.layout.getState().root).map((l) => l.id)
    ctx.layout.getState().focusLeaf(ids[0])
    ctx.commands.focusPane(1)
    expect(ctx.layout.getState().activeLeafId).toBe(ids[1])
    ctx.commands.focusPane(-1)
    ctx.commands.focusPane(-1)
    expect(ctx.layout.getState().activeLeafId).toBe(ids[ids.length - 1])
  })
  it('toggleScrollLink pairs the active pane with the next one and clears on the second call', () => {
    const ctx = setup()
    ctx.commands.toggleScrollLink()
    expect(ctx.layout.getState().scrollLink).toBeNull() // one pane: nothing to link
    ctx.commands.splitActive('row')
    const [a, b] = allLeaves(ctx.layout.getState().root).map((l) => l.id)
    ctx.layout.getState().focusLeaf(a)
    ctx.commands.toggleScrollLink()
    expect(ctx.layout.getState().scrollLink).toEqual({ a, b })
    ctx.commands.toggleScrollLink()
    expect(ctx.layout.getState().scrollLink).toBeNull()
  })
  it('drops the scroll link when one of the linked panes is closed', async () => {
    const ctx = setup()
    ctx.commands.splitActive('row')
    const [a] = allLeaves(ctx.layout.getState().root).map((l) => l.id)
    ctx.layout.getState().focusLeaf(a)
    ctx.commands.toggleScrollLink()
    expect(ctx.layout.getState().scrollLink).not.toBeNull()
    await ctx.commands.closePane()
    expect(ctx.layout.getState().scrollLink).toBeNull()
  })
})

describe('compareDocs', () => {
  function twoDocs(ctx: ReturnType<typeof setup>): [string, string] {
    const a = ctx.documents.getState().open({ path: '/w/a.md', text: 'a\n', eol: 'lf', bom: false, kind: 'markdown', readOnly: false })
    const b = ctx.documents.getState().open({ path: '/w/b.md', text: 'b\n', eol: 'lf', bom: false, kind: 'markdown', readOnly: false })
    return [a, b]
  }
  it('opens a compare tab for two different open documents', () => {
    const ctx = setup()
    const [a, b] = twoDocs(ctx)
    expect(ctx.commands.compareDocs(a, b)).toBe(true)
    expect(ctx.layout.getState().getActiveTab()!.tab).toEqual({ kind: 'compare', leftDocId: a, rightDocId: b })
  })
  it('does not open the same comparison twice', () => {
    const ctx = setup()
    const [a, b] = twoDocs(ctx)
    ctx.commands.compareDocs(a, b)
    ctx.commands.compareDocs(a, b)
    const leaf = findLeaf(ctx.layout.getState().root, ctx.layout.getState().activeLeafId)!
    expect(leaf.tabs).toHaveLength(1)
  })
  it('refuses to compare a document with itself or with an unknown document', () => {
    const ctx = setup()
    const [a] = twoDocs(ctx)
    expect(ctx.commands.compareDocs(a, a)).toBe(false)
    expect(ctx.commands.compareDocs(a, 'missing')).toBe(false)
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }))
    expect(ctx.layout.getState().getActiveTab()).toBeNull()
  })
  it('closing a compare tab asks about modified documents that no other tab shows, then closes them', async () => {
    const ctx = setup(undefined, 'discard')
    const [a, b] = twoDocs(ctx)
    ctx.commands.compareDocs(a, b)
    ctx.documents.getState().setText(b, 'changed', 'p')
    expect(await ctx.commands.closeTab(ctx.layout.getState().activeLeafId, 0)).toBe(true)
    expect(ctx.confirmUnsaved).toHaveBeenCalledTimes(1)
    expect(ctx.confirmUnsaved).toHaveBeenCalledWith('b.md')
    expect(Object.keys(ctx.documents.getState().docs)).toHaveLength(0)
  })
  it('closing a compare tab keeps documents that are still open in their own tabs', async () => {
    const ctx = setup({ '/w/a.md': 'a\n', '/w/b.md': 'b\n' })
    const a = await openA(ctx, '/w/a.md')
    const b = await openA(ctx, '/w/b.md')
    ctx.commands.compareDocs(a, b)
    ctx.documents.getState().setText(b, 'changed', 'p')
    const leaf = ctx.layout.getState().activeLeafId
    const idx = findLeaf(ctx.layout.getState().root, leaf)!.tabs.findIndex((t) => t.kind === 'compare')
    expect(await ctx.commands.closeTab(leaf, idx)).toBe(true)
    expect(ctx.confirmUnsaved).not.toHaveBeenCalled()
    expect(ctx.documents.getState().docs[a]).toBeDefined()
    expect(ctx.documents.getState().docs[b]).toBeDefined()
  })
})

describe('exportActive', () => {
  it('builds the html from the flushed text and sends it with the file name and path', async () => {
    const ctx = setup({ '/w/메모.md': '# t\n' })
    const id = await openA(ctx, '/w/메모.md')
    const spy = vi.spyOn(ctx.api, 'exportHtml').mockResolvedValue('/out/메모.html')
    ctx.flush.mockImplementation(() => ctx.documents.getState().setText(id, 'flushed', 'p'))
    expect(await ctx.commands.exportActive('html')).toBe('/out/메모.html')
    expect(ctx.buildExport).toHaveBeenCalledWith('flushed', '메모')
    expect(spy).toHaveBeenCalledWith('<html><title>메모</title>flushed</html>', '메모.md', '/w/메모.md')
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info', message: expect.stringContaining('/out/메모.html') }))
  })
  it('uses the PDF channel for pdf', async () => {
    const ctx = setup()
    await openA(ctx)
    const html = vi.spyOn(ctx.api, 'exportHtml')
    const pdf = vi.spyOn(ctx.api, 'exportPdf').mockResolvedValue('/out/a.pdf')
    expect(await ctx.commands.exportActive('pdf')).toBe('/out/a.pdf')
    expect(pdf).toHaveBeenCalledTimes(1)
    expect(html).not.toHaveBeenCalled()
  })
  it('stays quiet when the save dialog is cancelled', async () => {
    const ctx = setup()
    await openA(ctx)
    vi.spyOn(ctx.api, 'exportHtml').mockResolvedValue(null)
    expect(await ctx.commands.exportActive('html')).toBeNull()
    expect(ctx.notify).not.toHaveBeenCalled()
  })
  it('passes no path for an untitled document', async () => {
    const ctx = setup()
    ctx.commands.newUntitled()
    const spy = vi.spyOn(ctx.api, 'exportHtml').mockResolvedValue('/out/x.html')
    await ctx.commands.exportActive('html')
    expect(spy.mock.calls[0][2]).toBeNull()
  })
  it('refuses non-markdown documents and an empty workspace', async () => {
    const ctx = setup({ '/w/data.json': '{}' })
    const spy = vi.spyOn(ctx.api, 'exportHtml')
    expect(await ctx.commands.exportActive('html')).toBeNull()
    await openA(ctx, '/w/data.json')
    expect(await ctx.commands.exportActive('html')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }))
  })
  it('reports a failing export as an error', async () => {
    const ctx = setup()
    await openA(ctx)
    vi.spyOn(ctx.api, 'exportPdf').mockRejectedValue(new Error('disk full'))
    expect(await ctx.commands.exportActive('pdf')).toBeNull()
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('disk full') }))
  })
})

describe('confirmQuit', () => {
  it('lets a clean workspace quit without asking', async () => {
    const ctx = setup()
    await openA(ctx)
    expect(await ctx.commands.confirmQuit()).toBe(true)
    expect(ctx.confirmUnsaved).not.toHaveBeenCalled()
  })
  it('flushes pending editor edits first, so the last keystrokes count as modifications', async () => {
    const ctx = setup(undefined, 'cancel')
    const id = await openA(ctx)
    ctx.flush.mockImplementation(() => ctx.documents.getState().setText(id, 'typed just now', 'p'))
    expect(await ctx.commands.confirmQuit()).toBe(false)
    expect(ctx.confirmUnsaved).toHaveBeenCalledWith('a.md')
  })
  it('cancel keeps the app open', async () => {
    const ctx = setup(undefined, 'cancel')
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'edit', 'p')
    expect(await ctx.commands.confirmQuit()).toBe(false)
    expect(ctx.documents.getState().docs[id].text).toBe('edit')
  })
  it('save writes every modified document before quitting', async () => {
    const ctx = setup({ '/w/a.md': 'a', '/w/b.md': 'b' }, 'save')
    const a = await openA(ctx, '/w/a.md')
    const b = await openA(ctx, '/w/b.md')
    ctx.documents.getState().setText(a, 'A2', 'p')
    ctx.documents.getState().setText(b, 'B2', 'p')
    expect(await ctx.commands.confirmQuit()).toBe(true)
    expect((await ctx.api.readFile('/w/a.md')).text).toBe('A2')
    expect((await ctx.api.readFile('/w/b.md')).text).toBe('B2')
  })
  it('does not quit when a save fails', async () => {
    const ctx = setup(undefined, 'save')
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'edit', 'p')
    vi.spyOn(ctx.api, 'writeFile').mockRejectedValue(new Error('disk full'))
    expect(await ctx.commands.confirmQuit()).toBe(false)
    expect(ctx.documents.getState().isDirty(id)).toBe(true)
  })
  it('discard reverts the text and removes its crash backup so it cannot come back', async () => {
    const ctx = setup(undefined, 'discard')
    const id = await openA(ctx)
    ctx.documents.getState().setText(id, 'throw me away', 'p')
    await ctx.api.writeBackup(id, 'throw me away')
    const write = vi.spyOn(ctx.api, 'writeFile')
    expect(await ctx.commands.confirmQuit()).toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(ctx.documents.getState().isDirty(id)).toBe(false)
    expect(await ctx.api.loadBackups()).toEqual({})
  })
  it('stops at the first cancelled document', async () => {
    const ctx = setup({ '/w/a.md': 'a', '/w/b.md': 'b' }, 'cancel')
    const a = await openA(ctx, '/w/a.md')
    const b = await openA(ctx, '/w/b.md')
    ctx.documents.getState().setText(a, 'A2', 'p')
    ctx.documents.getState().setText(b, 'B2', 'p')
    expect(await ctx.commands.confirmQuit()).toBe(false)
    expect(ctx.confirmUnsaved).toHaveBeenCalledTimes(1)
  })
})

describe('files that were not valid UTF-8', () => {
  async function openLossy(ctx: ReturnType<typeof setup>): Promise<string> {
    const base = await ctx.api.readFile('/w/a.md')
    vi.spyOn(ctx.api, 'openFileDialog').mockResolvedValue([{ ...base, text: '\ufffd\ufffd 깨진 글', readOnly: true, warning: 'notUtf8' }])
    await ctx.commands.openFile()
    return Object.values(ctx.documents.getState().docs)[0].id
  }
  it('refuses to save the lossy text over the original file', async () => {
    const ctx = setup()
    await openLossy(ctx)
    ctx.controller.queueSaveAs('/w/a.md') // the user just confirms the suggested name
    const write = vi.spyOn(ctx.api, 'writeFile')
    expect(await ctx.commands.saveActive()).toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect((await ctx.api.readFile('/w/a.md')).text).toBe('# a\n')
    expect(ctx.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('UTF-8') }))
  })
  it('lets the user save a copy under another name, which makes the document normal again', async () => {
    const ctx = setup()
    const id = await openLossy(ctx)
    ctx.controller.queueSaveAs('/w/copy.md')
    expect(await ctx.commands.saveActive()).toBe(true)
    expect(ctx.documents.getState().docs[id].path).toBe('/w/copy.md')
    expect(ctx.documents.getState().docs[id].readOnly).toBe(false)
    expect((await ctx.api.readFile('/w/a.md')).text).toBe('# a\n')
  })
})
