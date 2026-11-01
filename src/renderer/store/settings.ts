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
  /** Keep split panes of the same file linked instead of giving the edited pane its own copy. */
  splitSync: boolean
  setSplitSync(v: boolean): void
  fontFamily: FontFamily
  setFontFamily(v: FontFamily): void
  /** Name of an installed font, used when `fontFamily` is "custom". */
  customFont: string
  setCustomFont(v: string): void
  fontSize: number
  setFontSize(v: number): void
  lineHeight: number
  setLineHeight(v: number): void
  wordWrap: boolean
  setWordWrap(v: boolean): void
  editorWidth: EditorWidth
  setEditorWidth(v: EditorWidth): void
  spellcheck: boolean
  setSpellcheck(v: boolean): void
  /** Reopen the files and panes of the last session when the app starts. */
  restoreOnStart: boolean
  setRestoreOnStart(v: boolean): void
  /** Seconds after the last edit before auto-save writes the file. */
  autoSaveDelay: number
  setAutoSaveDelay(v: number): void
  /** Files and folders hidden from the file tree. Hiding never touches the disk. */
  hiddenPaths: string[]
  hidePath(path: string): void
  unhidePath(path: string): void
  clearHiddenPaths(): void
  resetSettings(): void
}

export const MAX_HIDDEN = 500

export type FontFamily = 'default' | 'serif' | 'mono' | 'custom'
export type EditorWidth = 'narrow' | 'wide' | 'full'

export const FONT_SIZE = { min: 12, max: 28, default: 15 } as const
export const LINE_HEIGHT = { min: 1.2, max: 2.4, default: 1.85 } as const
export const AUTO_SAVE_DELAY = { min: 1, max: 30, default: 1.5 } as const

const FONT_FAMILIES: readonly string[] = ['default', 'serif', 'mono', 'custom']
const EDITOR_WIDTHS: readonly string[] = ['narrow', 'wide', 'full']

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

type Persisted = Pick<
  SettingsState,
  | 'theme'
  | 'showAllFiles'
  | 'autoSave'
  | 'focusMode'
  | 'typewriterMode'
  | 'splitSync'
  | 'fontFamily'
  | 'customFont'
  | 'fontSize'
  | 'lineHeight'
  | 'wordWrap'
  | 'editorWidth'
  | 'spellcheck'
  | 'restoreOnStart'
  | 'autoSaveDelay'
  | 'hiddenPaths'
>

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
  for (const key of ['showAllFiles', 'autoSave', 'focusMode', 'typewriterMode', 'splitSync', 'wordWrap', 'spellcheck', 'restoreOnStart'] as const) {
    if (typeof s[key] === 'boolean') out[key] = s[key]
  }
  if (typeof s.fontFamily === 'string' && FONT_FAMILIES.includes(s.fontFamily)) out.fontFamily = s.fontFamily as FontFamily
  if (typeof s.editorWidth === 'string' && EDITOR_WIDTHS.includes(s.editorWidth)) out.editorWidth = s.editorWidth as EditorWidth
  if (typeof s.customFont === 'string') out.customFont = s.customFont.slice(0, 100)
  const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : undefined)
  out.fontSize = num(s.fontSize, FONT_SIZE.min, FONT_SIZE.max)
  out.lineHeight = num(s.lineHeight, LINE_HEIGHT.min, LINE_HEIGHT.max)
  out.autoSaveDelay = num(s.autoSaveDelay, AUTO_SAVE_DELAY.min, AUTO_SAVE_DELAY.max)
  for (const k of ['fontSize', 'lineHeight', 'autoSaveDelay'] as const) if (out[k] === undefined) delete out[k]
  if (Array.isArray(s.hiddenPaths)) {
    out.hiddenPaths = [...new Set(s.hiddenPaths.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= 4096))].slice(0, MAX_HIDDEN)
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
        setTypewriterMode: (v) => set({ typewriterMode: v }),
        splitSync: false,
        setSplitSync: (v) => set({ splitSync: v }),
        fontFamily: 'default',
        setFontFamily: (v) => set({ fontFamily: v }),
        customFont: '',
        setCustomFont: (v) => set({ customFont: v.slice(0, 100) }),
        fontSize: FONT_SIZE.default,
        setFontSize: (v) => set({ fontSize: clamp(Math.round(v), FONT_SIZE.min, FONT_SIZE.max) }),
        lineHeight: LINE_HEIGHT.default,
        setLineHeight: (v) => set({ lineHeight: clamp(Math.round(v * 20) / 20, LINE_HEIGHT.min, LINE_HEIGHT.max) }),
        wordWrap: true,
        setWordWrap: (v) => set({ wordWrap: v }),
        editorWidth: 'wide',
        setEditorWidth: (v) => set({ editorWidth: v }),
        spellcheck: true,
        setSpellcheck: (v) => set({ spellcheck: v }),
        restoreOnStart: true,
        setRestoreOnStart: (v) => set({ restoreOnStart: v }),
        autoSaveDelay: AUTO_SAVE_DELAY.default,
        setAutoSaveDelay: (v) => set({ autoSaveDelay: clamp(Math.round(v * 2) / 2, AUTO_SAVE_DELAY.min, AUTO_SAVE_DELAY.max) }),
        hiddenPaths: [],
        hidePath: (path) => set((s) => (s.hiddenPaths.includes(path) || s.hiddenPaths.length >= MAX_HIDDEN ? s : { hiddenPaths: [...s.hiddenPaths, path] })),
        unhidePath: (path) => set((s) => ({ hiddenPaths: s.hiddenPaths.filter((p) => p !== path) })),
        clearHiddenPaths: () => set({ hiddenPaths: [] }),
        resetSettings: () =>
          set({
            theme: 'system',
            autoSave: false,
            focusMode: false,
            typewriterMode: false,
            splitSync: false,
            fontFamily: 'default',
            customFont: '',
            fontSize: FONT_SIZE.default,
            lineHeight: LINE_HEIGHT.default,
            wordWrap: true,
            editorWidth: 'wide',
            spellcheck: true,
            restoreOnStart: true,
            autoSaveDelay: AUTO_SAVE_DELAY.default
          })
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
          typewriterMode: s.typewriterMode,
          splitSync: s.splitSync,
          fontFamily: s.fontFamily,
          customFont: s.customFont,
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          wordWrap: s.wordWrap,
          editorWidth: s.editorWidth,
          spellcheck: s.spellcheck,
          restoreOnStart: s.restoreOnStart,
          autoSaveDelay: s.autoSaveDelay,
          hiddenPaths: s.hiddenPaths
        }),
        merge: (persisted, current) => ({ ...current, ...sanitize(persisted) })
      }
    )
  )
}

export const useSettings = createSettingsStore()
