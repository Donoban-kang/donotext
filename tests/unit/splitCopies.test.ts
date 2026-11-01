import { describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { createAutoSaver } from '../../src/renderer/app/autosave'
import { createCommands, type ForkChoice } from '../../src/renderer/app/commands'
import { startExternalWatcher } from '../../src/renderer/app/externalWatcher'
import { captureSession, parseSession, restoreSession } from '../../src/renderer/app/session'
import { createEditRouter } from '../../src/renderer/editor/editRouter'
import { allLeaves } from '../../src/renderer/layout/tree'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'
import { createWorkspaceStore } from '../../src/renderer/store/workspace'

const ORIGINAL = '# a\n\nbody\n'

/** Two panes on /w/a.md where the right pane has been edited into its own copy. */
async function withCopy(opts: { fork?: ForkChoice; overwrite?: boolean } = {}) {
  const { api, controller } = createMockApi({ '/w/a.md': ORIGINAL })
  const documents = createDocumentsStore()
  const layout = createLayoutStore()
  const notify = vi.fn()
  const confirmForkClose = vi.fn(async (): Promise<ForkChoice> => opts.fork ?? 'cancel')
  const confirmOverwrite = vi.fn(async () => opts.overwrite ?? false)
  const commands = createCommands({
    api,
    documents,
    layout,
    confirmUnsaved: async () => 'cancel',
    confirmForkClose,
    confirmOverwrite,
    notify,
    flush: () => undefined
  })
  controller.queueOpen(['/w/a.md'])
  await commands.openFile()
  const original = Object.values(documents.getState().docs)[0].id
  commands.splitActive('row')
  const [left, right] = allLeaves(layout.getState().root)
  const route = createEditRouter({ documents, layout, splitSync: () => false })
  const copy = route(original, right.id)
  documents.getState().setText(copy, ORIGINAL + 'more\n', right.id)
  return { api, controller, documents, layout, commands, notify, confirmForkClose, confirmOverwrite, original, copy, left, right }
}

describe('closing an edited copy', () => {
  it('cancel keeps the tab and everything as it was', async () => {
    const c = await withCopy({ fork: 'cancel' })
    expect(await c.commands.closeTab(c.right.id, 0)).toBe(false)
    expect(c.documents.getState().docs[c.copy]).toBeDefined()
  })
  it('discard closes it without touching any file', async () => {
    const c = await withCopy({ fork: 'discard' })
    expect(await c.commands.closeTab(c.right.id, 0)).toBe(true)
    expect(c.documents.getState().docs[c.copy]).toBeUndefined()
    expect((await c.api.readFile('/w/a.md')).text).toBe(ORIGINAL)
  })
  it('save as writes to the chosen new file and the original file stays the same', async () => {
    const c = await withCopy({ fork: 'saveAs' })
    c.controller.queueSaveAs('/w/b.md')
    expect(await c.commands.closeTab(c.right.id, 0)).toBe(true)
    expect((await c.api.readFile('/w/b.md')).text).toBe(ORIGINAL + 'more\n')
    expect((await c.api.readFile('/w/a.md')).text).toBe(ORIGINAL)
  })
  it('save as stays open when the dialog is cancelled', async () => {
    const c = await withCopy({ fork: 'saveAs' })
    c.controller.queueSaveAs(null)
    expect(await c.commands.closeTab(c.right.id, 0)).toBe(false)
    expect(c.documents.getState().docs[c.copy]).toBeDefined()
  })
  it('replace overwrites the original only after the extra confirmation', async () => {
    const declined = await withCopy({ fork: 'replace', overwrite: false })
    expect(await declined.commands.closeTab(declined.right.id, 0)).toBe(false)
    expect(declined.confirmOverwrite).toHaveBeenCalled()
    expect((await declined.api.readFile('/w/a.md')).text).toBe(ORIGINAL)

    const accepted = await withCopy({ fork: 'replace', overwrite: true })
    expect(await accepted.commands.closeTab(accepted.right.id, 0)).toBe(true)
    expect((await accepted.api.readFile('/w/a.md')).text).toBe(ORIGINAL + 'more\n')
    // the original that is still open shows the new content
    expect(accepted.documents.getState().docs[accepted.original].text).toBe(ORIGINAL + 'more\n')
  })
  it('a copy without changes closes silently', async () => {
    const c = await withCopy({ fork: 'cancel' })
    c.documents.getState().setText(c.copy, ORIGINAL, 'p') // back to the saved text
    expect(await c.commands.closeTab(c.right.id, 0)).toBe(true)
    expect(c.confirmForkClose).not.toHaveBeenCalled()
  })
})

describe('saving an edited copy', () => {
  it('a plain save asks for a new name and never writes the original path', async () => {
    const c = await withCopy()
    c.controller.queueSaveAs(null)
    expect(await c.commands.saveDoc(c.copy)).toBe(false)
    expect((await c.api.readFile('/w/a.md')).text).toBe(ORIGINAL)
  })
  it('refuses to save over the original path from the save dialog', async () => {
    const c = await withCopy()
    c.controller.queueSaveAs('/w/a.md')
    expect(await c.commands.saveDoc(c.copy)).toBe(false)
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
    expect((await c.api.readFile('/w/a.md')).text).toBe(ORIGINAL)
  })
})

describe('background writers ignore copies', () => {
  it('auto-save skips a modified copy', () => {
    vi.useFakeTimers()
    const documents = createDocumentsStore()
    const id = documents.getState().open({ path: '/w/a.md', text: 'x', eol: 'lf', bom: false, readOnly: false, kind: 'markdown' })
    const copy = documents.getState().forkDoc(id)!
    const save = vi.fn(async () => true)
    const saver = createAutoSaver({ documents, save, enabled: () => true, delayMs: 100 })
    documents.getState().setText(copy, 'y', 'p')
    vi.advanceTimersByTime(500)
    expect(save).not.toHaveBeenCalled()
    saver.dispose()
    vi.useRealTimers()
  })
  it('a change on disk is not applied to a copy', async () => {
    const { api, controller } = createMockApi({ '/w/a.md': 'v1\n' })
    const documents = createDocumentsStore()
    const id = documents.getState().open(await api.readFile('/w/a.md'))
    const copy = documents.getState().forkDoc(id)!
    documents.getState().setText(copy, 'mine\n', 'p')
    const stop = startExternalWatcher({ api, documents })
    await api.writeFile('/w/a.md', 'v2\n', 'lf', false)
    controller.emitChange({ path: '/w/a.md', kind: 'change' })
    await new Promise((r) => setTimeout(r, 30))
    expect(documents.getState().docs[copy].text).toBe('mine\n')
    expect(documents.getState().docs[copy].external).toBe('none')
    expect(documents.getState().docs[id].text).toBe('v2\n')
    stop()
  })
})

describe('session with an edited copy', () => {
  it('is remembered as a copy and restored next to the original with its unsaved text', async () => {
    const { api } = createMockApi({ '/w/a.md': ORIGINAL })
    const first = { documents: createDocumentsStore(), layout: createLayoutStore(), workspace: createWorkspaceStore() }
    const original = first.documents.getState().open(await api.readFile('/w/a.md'))
    first.layout.getState().openDoc(original)
    first.layout.getState().splitActive('row')
    first.layout.getState().openDoc(original)
    const [, right] = allLeaves(first.layout.getState().root)
    const route = createEditRouter({ documents: first.documents, layout: first.layout, splitSync: () => false })
    const copy = route(original, right.id)
    first.documents.getState().setText(copy, 'edited copy\n', right.id)

    const snap = captureSession(first)
    expect(snap.docs.find((d) => d.id === copy)).toEqual({ id: copy, path: '/w/a.md', fork: true })
    await api.saveSession(snap)
    await api.writeBackup(copy, 'edited copy\n')

    const next = { documents: createDocumentsStore(), layout: createLayoutStore(), workspace: createWorkspaceStore() }
    expect(await restoreSession({ api, ...next, notify: vi.fn() })).toBe(true)
    const docs = Object.values(next.documents.getState().docs)
    expect(docs).toHaveLength(2)
    const restoredCopy = docs.find((d) => d.fork)!
    const restoredOriginal = docs.find((d) => !d.fork)!
    expect(restoredCopy.text).toBe('edited copy\n')
    expect(restoredOriginal.text).toBe(ORIGINAL)
    const shown = allLeaves(next.layout.getState().root).map((l) => (l.tabs[0].kind === 'doc' ? l.tabs[0].docId : ''))
    expect(shown.sort()).toEqual([restoredCopy.id, restoredOriginal.id].sort())
  })
  it('parseSession accepts the fork flag and ignores junk values', () => {
    const base = { version: 1, layout: { type: 'leaf', id: 'leaf-1', tabs: [], active: 0 }, folder: null, activeLeafId: '', recent: [] }
    expect(parseSession({ ...base, docs: [{ id: 'd', path: '/a', fork: true }] })!.docs[0].fork).toBe(true)
    expect(parseSession({ ...base, docs: [{ id: 'd', path: '/a', fork: 'yes' }] })!.docs[0]).toEqual({ id: 'd', path: '/a' })
  })
})
