import { create } from 'zustand'
import {
  allLeaves,
  closeLeaf,
  closeTab,
  equalize,
  findLeaf,
  moveTab,
  newLeaf,
  openTab,
  resize,
  setActiveTab,
  splitLeaf,
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
  /** Two panes whose scroll positions follow each other, or null. */
  scrollLink: { a: string; b: string } | null
  setRoot(root: LayoutNode): void
  /** Splits the active pane and focuses the new one. Returns false when the layout limits refuse it. */
  splitActive(dir: 'row' | 'col', side?: 'before' | 'after'): boolean
  closeLeafById(leafId: string): void
  focusRelative(delta: number): void
  resizeSplit(splitId: string, sizes: number[]): void
  equalizeSplit(splitId: string): void
  moveTab(from: { leafId: string; index: number }, to: { leafId: string; index: number }): void
  setScrollLink(link: { a: string; b: string } | null): void
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
  return create<LayoutState>()((set, get) => {
    /** Applies a new root, repairing the active pane and dropping a scroll link to a vanished pane. */
    const commit = (root: LayoutNode, active?: string): void => {
      const leaves = allLeaves(root)
      const ids = new Set(leaves.map((l) => l.id))
      const keep = active && ids.has(active) ? active : ids.has(get().activeLeafId) ? get().activeLeafId : leaves[0].id
      const link = get().scrollLink
      set({ root, activeLeafId: keep, scrollLink: link && ids.has(link.a) && ids.has(link.b) ? link : null })
    }

    return {
      root: initial,
      activeLeafId: initial.id,
      scrollLink: null,

      setRoot(root) {
        commit(root)
      },

      splitActive(dir, side = 'after') {
        const { root, activeLeafId } = get()
        const before = new Set(allLeaves(root).map((l) => l.id))
        const next = splitLeaf(root, activeLeafId, dir, side)
        if (next === root) return false
        commit(next, allLeaves(next).find((l) => !before.has(l.id))?.id)
        return true
      },

      closeLeafById(leafId) {
        const next = closeLeaf(get().root, leafId)
        if (next !== get().root) commit(next)
      },

      focusRelative(delta) {
        const leaves = allLeaves(get().root)
        const i = leaves.findIndex((l) => l.id === get().activeLeafId)
        const n = leaves.length
        set({ activeLeafId: leaves[(((i + delta) % n) + n) % n].id })
      },

      resizeSplit(splitId, sizes) {
        set((s) => ({ root: resize(s.root, splitId, sizes) }))
      },

      equalizeSplit(splitId) {
        set((s) => ({ root: equalize(s.root, splitId) }))
      },

      moveTab(from, to) {
        commit(moveTab(get().root, from, to), to.leafId)
      },

      setScrollLink(link) {
        set({ scrollLink: link })
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
          n.type === 'leaf' ? (n.id === leafId ? { ...n, tabs } : n) : { ...n, children: n.children.map(patched) }
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
    }
  })
}

export const useLayout = createLayoutStore()
