// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore, SETTINGS_KEY } from '../../src/renderer/store/settings'

beforeEach(() => localStorage.clear())

describe('settings persistence', () => {
  it('starts with defaults', () => {
    const s = createSettingsStore().getState()
    expect(s.theme).toBe('system')
    expect(s.autoSave).toBe(false)
    expect(s.showAllFiles).toBe(false)
  })
  it('saves changes and restores them in a new store', () => {
    const a = createSettingsStore()
    a.getState().setTheme('dark')
    a.getState().setAutoSave(true)
    a.getState().setFocusMode(true)
    const b = createSettingsStore().getState()
    expect(b.theme).toBe('dark')
    expect(b.autoSave).toBe(true)
    expect(b.focusMode).toBe(true)
  })
  it('falls back to defaults when the stored value is corrupt', () => {
    localStorage.setItem(SETTINGS_KEY, '{ not json')
    expect(createSettingsStore().getState().theme).toBe('system')
  })
  it('ignores stored values of the wrong type', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ state: { theme: 'neon', autoSave: 'yes' }, version: 1 }))
    const s = createSettingsStore().getState()
    expect(s.theme).toBe('system')
    expect(s.autoSave).toBe(false)
  })
  it('keeps working when storage throws (private mode, blocked storage)', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      const s = createSettingsStore()
      expect(() => s.getState().setTheme('dark')).not.toThrow()
      expect(s.getState().theme).toBe('dark')
    } finally {
      Storage.prototype.setItem = original
    }
  })
})
