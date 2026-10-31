import { create } from 'zustand'
import { pushRecent } from '../app/externalChange'

export interface WorkspaceState {
  root: string | null
  recent: string[]
  setRoot(root: string | null): void
  setRecent(recent: string[]): void
  addRecent(path: string): void
}

export function createWorkspaceStore() {
  return create<WorkspaceState>()((set) => ({
    root: null,
    recent: [],
    setRoot: (root) => set({ root }),
    setRecent: (recent) => set({ recent }),
    addRecent: (path) => set((s) => ({ recent: pushRecent(s.recent, path) }))
  }))
}

export const useWorkspace = createWorkspaceStore()
