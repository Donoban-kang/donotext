import { describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { startExternalWatcher } from '../../src/renderer/app/externalWatcher'
import { createDocumentsStore } from '../../src/renderer/store/documents'

async function setup(seed = { '/w/a.md': 'v1\n' }) {
  const { api, controller } = createMockApi(seed)
  const documents = createDocumentsStore()
  const id = documents.getState().open(await api.readFile('/w/a.md'))
  const stop = startExternalWatcher({ api, documents })
  const settle = () => new Promise((r) => setTimeout(r, 20))
  return { api, controller, documents, id, stop, settle }
}

describe('external watcher', () => {
  it('reloads an unmodified document when the file changes on disk', async () => {
    const { api, controller, documents, id, stop, settle } = await setup()
    await api.writeFile('/w/a.md', 'v2\n', 'lf', false)
    controller.emitChange({ path: '/w/a.md', kind: 'change' })
    await settle()
    expect(documents.getState().docs[id].text).toBe('v2\n')
    expect(documents.getState().isDirty(id)).toBe(false)
    stop()
  })
  it('flags a modified document instead of overwriting the user\'s edits', async () => {
    const { api, controller, documents, id, stop, settle } = await setup()
    documents.getState().setText(id, 'my edit\n', 'p')
    await api.writeFile('/w/a.md', 'v2\n', 'lf', false)
    controller.emitChange({ path: '/w/a.md', kind: 'change' })
    await settle()
    expect(documents.getState().docs[id].text).toBe('my edit\n')
    expect(documents.getState().docs[id].external).toBe('changed')
    stop()
  })
  it('ignores the echo of its own save', async () => {
    const { api, controller, documents, id, stop, settle } = await setup()
    documents.getState().setText(id, 'saved by me\n', 'p')
    await api.writeFile('/w/a.md', 'saved by me\n', 'lf', false)
    documents.getState().markSaved(id)
    const reload = vi.spyOn(documents.getState(), 'reload')
    controller.emitChange({ path: '/w/a.md', kind: 'change' })
    await settle()
    expect(reload).not.toHaveBeenCalled()
    expect(documents.getState().docs[id].external).toBe('none')
    stop()
  })
  it('marks the document deleted on unlink, or when it can no longer be read', async () => {
    const { api, controller, documents, id, stop, settle } = await setup()
    controller.emitChange({ path: '/w/a.md', kind: 'unlink' })
    await settle()
    expect(documents.getState().docs[id].external).toBe('deleted')
    documents.getState().setExternal(id, 'none')
    await api.deleteEntry('/w/a.md')
    controller.emitChange({ path: '/w/a.md', kind: 'change' })
    await settle()
    expect(documents.getState().docs[id].external).toBe('deleted')
    stop()
  })
  it('ignores events for files that are not open and "add" events', async () => {
    const { controller, documents, id, stop, settle } = await setup()
    controller.emitChange({ path: '/w/other.md', kind: 'change' })
    controller.emitChange({ path: '/w/a.md', kind: 'add' })
    await settle()
    expect(documents.getState().docs[id].external).toBe('none')
    stop()
  })
  it('stops reacting after being stopped', async () => {
    const { api, controller, documents, id, stop, settle } = await setup()
    stop()
    await api.writeFile('/w/a.md', 'v2\n', 'lf', false)
    controller.emitChange({ path: '/w/a.md', kind: 'change' })
    await settle()
    expect(documents.getState().docs[id].text).toBe('v1\n')
  })
})
