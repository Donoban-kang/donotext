import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { createCommands } from '../../src/renderer/app/commands'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { findLeaf, splitLeaf } from '../../src/renderer/layout/tree'
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
  const commands = createCommands({ api: wrapped, documents, layout, confirmUnsaved, notify, flush, onFileOpened })
  return { api: wrapped, controller, documents, layout, confirmUnsaved, notify, flush, commands, onFileOpened }
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
