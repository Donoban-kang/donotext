// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { createAutoSaver } from '../../src/renderer/app/autosave'
import { restoreSession } from '../../src/renderer/app/session'
import { cssFontName, resolveFonts } from '../../src/renderer/app/SettingsController'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'
import { AUTO_SAVE_DELAY, createSettingsStore, FONT_SIZE, LINE_HEIGHT, MAX_HIDDEN, SETTINGS_KEY } from '../../src/renderer/store/settings'
import { createWorkspaceStore } from '../../src/renderer/store/workspace'

beforeEach(() => localStorage.clear())

describe('settings store', () => {
  it('starts with the defaults the app had before there was a settings window', () => {
    const s = createSettingsStore().getState()
    expect([s.fontSize, s.lineHeight, s.editorWidth, s.wordWrap, s.spellcheck, s.restoreOnStart, s.autoSaveDelay]).toEqual([15, 1.85, 'wide', true, true, true, 1.5])
  })
  it('keeps numbers inside their ranges and in sensible steps', () => {
    const store = createSettingsStore()
    store.getState().setFontSize(200)
    expect(store.getState().fontSize).toBe(FONT_SIZE.max)
    store.getState().setFontSize(14.6)
    expect(store.getState().fontSize).toBe(15)
    store.getState().setLineHeight(0.1)
    expect(store.getState().lineHeight).toBe(LINE_HEIGHT.min)
    store.getState().setLineHeight(1.87)
    expect(store.getState().lineHeight).toBe(1.85)
    store.getState().setAutoSaveDelay(0)
    expect(store.getState().autoSaveDelay).toBe(AUTO_SAVE_DELAY.min)
    store.getState().setAutoSaveDelay(2.3)
    expect(store.getState().autoSaveDelay).toBe(2.5)
  })
  it('remembers settings and ignores damaged stored values', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ state: { fontSize: 99, lineHeight: 'x', fontFamily: 'comic', editorWidth: 'full', wordWrap: false, customFont: 5, autoSaveDelay: 4 }, version: 1 }))
    const s = createSettingsStore().getState()
    expect(s.fontSize).toBe(FONT_SIZE.max)
    expect(s.lineHeight).toBe(1.85)
    expect(s.fontFamily).toBe('default')
    expect(s.editorWidth).toBe('full')
    expect(s.wordWrap).toBe(false)
    expect(s.customFont).toBe('')
    expect(s.autoSaveDelay).toBe(4)
  })
  it('resetSettings brings everything back', () => {
    const store = createSettingsStore()
    store.getState().setFontSize(24)
    store.getState().setWordWrap(false)
    store.getState().setTheme('dark')
    store.getState().resetSettings()
    const s = store.getState()
    expect([s.fontSize, s.wordWrap, s.theme]).toEqual([15, true, 'system'])
  })
})

describe('fonts', () => {
  it('strips characters that could break out of a CSS font list', () => {
    expect(cssFontName('Evil"; } body { color: red')).toBe('Evil  body  color: red')
    expect(cssFontName(' D2Coding ')).toBe('D2Coding')
  })
  it('uses the typed name first and a safe fallback, and falls back when it is empty', () => {
    expect(resolveFonts('custom', 'D2Coding').editor.startsWith('"D2Coding", ')).toBe(true)
    expect(resolveFonts('custom', 'D2Coding').source.endsWith('monospace')).toBe(true)
    expect(resolveFonts('custom', '  ').editor).toBe(resolveFonts('default', '').editor)
    expect(resolveFonts('mono', '').editor).toBe(resolveFonts('mono', '').source)
  })
})

describe('auto-save delay setting', () => {
  it('reads the delay again for each edit', () => {
    vi.useFakeTimers()
    const documents = createDocumentsStore()
    const id = documents.getState().open({ path: '/w/a.md', text: 'x', eol: 'lf', bom: false, readOnly: false, kind: 'markdown' })
    const save = vi.fn(async () => true)
    let delay = 3000
    const saver = createAutoSaver({ documents, save, enabled: () => true, delayMs: () => delay })
    documents.getState().setText(id, 'a', 'p')
    vi.advanceTimersByTime(2900)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(save).toHaveBeenCalledTimes(1)
    delay = 500
    documents.getState().setText(id, 'b', 'p')
    vi.advanceTimersByTime(600)
    expect(save).toHaveBeenCalledTimes(2)
    saver.dispose()
    vi.useRealTimers()
  })
})

describe('restore on start', () => {
  async function previousRun() {
    const { api } = createMockApi({ '/w/a.md': '# a\n' })
    const documents = createDocumentsStore()
    const layout = createLayoutStore()
    const workspace = createWorkspaceStore()
    const id = documents.getState().open(await api.readFile('/w/a.md'))
    layout.getState().openDoc(id)
    workspace.getState().setRoot('/w')
    workspace.getState().addRecent('/w/a.md')
    const { captureSession } = await import('../../src/renderer/app/session')
    await api.saveSession(captureSession({ documents, layout, workspace }))
    return { api, id, documents }
  }
  const fresh = () => ({ documents: createDocumentsStore(), layout: createLayoutStore(), workspace: createWorkspaceStore() })

  it('reopens the previous files by default', async () => {
    const { api } = await previousRun()
    const next = fresh()
    await restoreSession({ api, ...next, notify: vi.fn() })
    expect(Object.values(next.documents.getState().docs).map((d) => d.path)).toEqual(['/w/a.md'])
    expect(next.workspace.getState().root).toBe('/w')
  })
  it('starts empty when switched off, but keeps the recent files list', async () => {
    const { api } = await previousRun()
    const next = fresh()
    await restoreSession({ api, ...next, notify: vi.fn(), reopen: false })
    expect(Object.keys(next.documents.getState().docs)).toHaveLength(0)
    expect(next.workspace.getState().root).toBeNull()
    expect(next.workspace.getState().recent).toEqual(['/w/a.md'])
  })
  it('still recovers unsaved edits as a new document when switched off', async () => {
    const { api, id, documents } = await previousRun()
    documents.getState().setText(id, '# a\n\nunsaved\n', 'p')
    await api.writeBackup(id, '# a\n\nunsaved\n')
    const next = fresh()
    const notify = vi.fn()
    await restoreSession({ api, ...next, notify, reopen: false })
    const docs = Object.values(next.documents.getState().docs)
    expect(docs).toHaveLength(1)
    expect(docs[0].text).toContain('unsaved')
    expect(notify).toHaveBeenCalled()
  })
})

describe('hidden tree entries', () => {
  it('hides and unhides paths without duplicates, and remembers them', () => {
    const store = createSettingsStore()
    store.getState().hidePath('/w/a')
    store.getState().hidePath('/w/a')
    store.getState().hidePath('/w/b')
    expect(store.getState().hiddenPaths).toEqual(['/w/a', '/w/b'])
    store.getState().unhidePath('/w/a')
    expect(createSettingsStore().getState().hiddenPaths).toEqual(['/w/b']) // read back from storage
    store.getState().clearHiddenPaths()
    expect(store.getState().hiddenPaths).toEqual([])
  })
  it('stops at the limit and ignores damaged stored lists', () => {
    const store = createSettingsStore()
    for (let i = 0; i < MAX_HIDDEN + 20; i++) store.getState().hidePath(`/w/${i}`)
    expect(store.getState().hiddenPaths).toHaveLength(MAX_HIDDEN)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ state: { hiddenPaths: ['/ok', 5, null, '', '/ok', 'x'.repeat(5000)] }, version: 1 }))
    expect(createSettingsStore().getState().hiddenPaths).toEqual(['/ok'])
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ state: { hiddenPaths: 'nope' }, version: 1 }))
    expect(createSettingsStore().getState().hiddenPaths).toEqual([])
  })
  it('"기본값으로 되돌리기" leaves the hidden list alone', () => {
    const store = createSettingsStore()
    store.getState().hidePath('/w/a')
    store.getState().resetSettings()
    expect(store.getState().hiddenPaths).toEqual(['/w/a'])
  })
})
