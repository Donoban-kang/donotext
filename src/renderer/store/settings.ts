import { create } from 'zustand'
import { persist, type PersistStorage } from 'zustand/middleware'
import type { Theme } from '../app/theme'

export const SETTINGS_KEY = 'donotext.settings'

export interface SettingsState {
  theme: Theme
  setTheme(v: Theme): void
  showAllFiles: boolean
  setShowAllFiles(v: boolean): void
  autoSave: boolean
  setAutoSave(v: boolean): void
  focusMode: boolean
  setFocusMode(v: boolean): void
  typewriterMode: boolean
  setTypewriterMode(v: boolean): void
}

type Persisted = Pick<SettingsState, 'theme' | 'showAllFiles' | 'autoSave' | 'focusMode' | 'typewriterMode'>

/** localStorage can be missing, blocked or corrupt; settings must still work in memory then. */
const safeStorage: PersistStorage<Persisted> = {
  getItem(name) {
    try {
      const raw = localStorage.getItem(name)
      return raw ? (JSON.parse(raw) as { state: Persisted; version?: number }) : null
    } catch {
      return null
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, JSON.stringify(value))
    } catch {
      // keep going without persistence
    }
  },
  removeItem(name) {
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  }
}

const THEMES: readonly string[] = ['light', 'dark', 'system']

/** Keeps only stored values of the right type, so a hand-edited or old file cannot break the app. */
function sanitize(stored: unknown): Partial<Persisted> {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>
  const out: Partial<Persisted> = {}
  if (typeof s.theme === 'string' && THEMES.includes(s.theme)) out.theme = s.theme as Theme
  for (const key of ['showAllFiles', 'autoSave', 'focusMode', 'typewriterMode'] as const) {
    if (typeof s[key] === 'boolean') out[key] = s[key]
  }
  return out
}

export function createSettingsStore() {
  return create<SettingsState>()(
    persist(
      (set) => ({
        theme: 'system',
        setTheme: (v) => set({ theme: v }),
        showAllFiles: false,
        setShowAllFiles: (v) => set({ showAllFiles: v }),
        autoSave: false,
        setAutoSave: (v) => set({ autoSave: v }),
        focusMode: false,
        setFocusMode: (v) => set({ focusMode: v }),
        typewriterMode: false,
        setTypewriterMode: (v) => set({ typewriterMode: v })
      }),
      {
        name: SETTINGS_KEY,
        version: 1,
        storage: safeStorage,
        partialize: (s): Persisted => ({
          theme: s.theme,
          showAllFiles: s.showAllFiles,
          autoSave: s.autoSave,
          focusMode: s.focusMode,
          typewriterMode: s.typewriterMode
        }),
        merge: (persisted, current) => ({ ...current, ...sanitize(persisted) })
      }
    )
  )
}

export const useSettings = createSettingsStore()
