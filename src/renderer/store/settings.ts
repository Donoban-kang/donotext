import { create } from 'zustand'

export interface SettingsState {
  showAllFiles: boolean
  setShowAllFiles(v: boolean): void
  autoSave: boolean
  setAutoSave(v: boolean): void
  focusMode: boolean
  setFocusMode(v: boolean): void
  typewriterMode: boolean
  setTypewriterMode(v: boolean): void
}

export const useSettings = create<SettingsState>()((set) => ({
  showAllFiles: false,
  setShowAllFiles: (v) => set({ showAllFiles: v }),
  autoSave: false,
  setAutoSave: (v) => set({ autoSave: v }),
  focusMode: false,
  setFocusMode: (v) => set({ focusMode: v }),
  typewriterMode: false,
  setTypewriterMode: (v) => set({ typewriterMode: v })
}))
