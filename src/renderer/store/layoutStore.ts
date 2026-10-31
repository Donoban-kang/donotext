import { create } from 'zustand'
import {
  allLeaves,
  closeTab,
  findLeaf,
  newLeaf,
  openTab,
  setActiveTab,
  type LayoutNode,
  type Tab
} from '../layout/tree'

export function tabDocIds(tab: Tab): string[] {
  return tab.kind === 'doc' ? [tab.docId] : [tab.leftDocId, tab.rightDocId]
}

export interface ActiveTabRef {
  leafId: string
  index: number
  tab: Tab
}

export interface LayoutState {
  root: LayoutNode
  activeLeafId: string
  setRoot(root: LayoutNode): void
  openDoc(docId: string, view?: 'wysiwyg' | 'source'): void
  openTabInActive(tab: Tab): void
  closeTabAt(leafId: string, index: number): void
  activateTab(leafId: string, index: number): void
  focusLeaf(leafId: string): void
  setTabView(leafId: string, index: number, view: 'wysiwyg' | 'source'): void
  /** Number of tabs (doc or compare) that reference the document. */
  docRefs(docId: string): number
  getActiveTab(): ActiveTabRef | null
}

export function createLayoutStore() {
  const initial = newLeaf()
  return create<LayoutState>()((set, get) => ({
    root: initial,
    activeLeafId: initial.id,

    setRoot(root) {
      const leaves = allLeaves(root)
      const keep = leaves.some((l) => l.id === get().activeLeafId)
      set({ root, activeLeafId: keep ? get().activeLeafId : leaves[0].id })
    },

    openDoc(docId, view = 'wysiwyg') {
      get().openTabInActive({ kind: 'doc', docId, view })
    },

    openTabInActive(tab) {
      set((s) => ({ root: openTab(s.root, s.activeLeafId, tab) }))
    },

    closeTabAt(leafId, index) {
      set((s) => ({ root: closeTab(s.root, leafId, index) }))
    },

    activateTab(leafId, index) {
      set((s) => ({ root: setActiveTab(s.root, leafId, index), activeLeafId: leafId }))
    },

    focusLeaf(leafId) {
      if (findLeaf(get().root, leafId)) set({ activeLeafId: leafId })
    },

    setTabView(leafId, index, view) {
      const leaf = findLeaf(get().root, leafId)
      const tab = leaf?.tabs[index]
      if (!leaf || !tab || tab.kind !== 'doc' || tab.view === view) return
      const tabs = leaf.tabs.map((t, i) => (i === index ? { ...tab, view } : t))
      const patched = (n: LayoutNode): LayoutNode =>
        n.type === 'leaf'
          ? n.id === leafId
            ? { ...n, tabs }
            : n
          : { ...n, children: n.children.map(patched) }
      set((s) => ({ root: patched(s.root) }))
    },

    docRefs(docId) {
      return allLeaves(get().root)
        .flatMap((l) => l.tabs)
        .filter((t) => tabDocIds(t).includes(docId)).length
    },

    getActiveTab() {
      const { root, activeLeafId } = get()
      const leaf = findLeaf(root, activeLeafId)
      const tab = leaf?.tabs[leaf.active]
      return leaf && tab ? { leafId: leaf.id, index: leaf.active, tab } : null
    }
  }))
}

export const useLayout = createLayoutStore()
