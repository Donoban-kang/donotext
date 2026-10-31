// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { startBackups } from '../../src/renderer/app/backup'
import { createDocumentsStore } from '../../src/renderer/store/documents'

const read = (path: string) => ({ path, text: 'x', eol: 'lf' as const, bom: false, kind: 'markdown' as const, readOnly: false })

describe('startBackups scheduling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('backs up a few seconds after the last edit instead of waiting for the interval', async () => {
    const { api } = createMockApi()
    const documents = createDocumentsStore()
    const stop = startBackups({ api, documents }, 30_000, 2000)
    const id = documents.getState().open(read('/w/a.md'))
    documents.getState().setText(id, 'edited', 'p')
    await vi.advanceTimersByTimeAsync(1999)
    expect(await api.loadBackups()).toEqual({})
    await vi.advanceTimersByTimeAsync(1)
    expect(await api.loadBackups()).toEqual({ [id]: 'edited' })
    stop()
  })
  it('stops scheduling after being stopped', async () => {
    const { api } = createMockApi()
    const documents = createDocumentsStore()
    const stop = startBackups({ api, documents }, 30_000, 2000)
    const id = documents.getState().open(read('/w/a.md'))
    documents.getState().setText(id, 'edited', 'p')
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await api.loadBackups()).toEqual({})
  })
})
