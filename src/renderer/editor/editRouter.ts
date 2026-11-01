import { findLeaf } from '../layout/tree'
import { useDocuments, type createDocumentsStore, type Doc } from '../store/documents'
import { useLayout, type createLayoutStore } from '../store/layoutStore'
import { useSettings } from '../store/settings'

export interface EditRouterDeps {
  documents: ReturnType<typeof createDocumentsStore>
  layout: ReturnType<typeof createLayoutStore>
  /** True when split panes of one file should stay linked (the old behaviour). */
  splitSync(): boolean
}

/** Other copies of `doc` exist, which makes the original something that should stay untouched. */
export function hasCopies(docs: Record<string, Doc>, doc: Doc): boolean {
  if (doc.fork) return false
  return Object.values(docs).some((d) => d.fork && d.id !== doc.id && (d.forkOf === doc.id || (doc.path !== null && d.path === doc.path)))
}

/**
 * Decides which document a pane's edit lands in. When a file is shown in more than one pane (or already
 * has copies), the pane being edited is switched to its own copy first, so the other panes keep showing
 * the original. Returns the id of the document that should receive the text.
 */
export function createEditRouter({ documents, layout, splitSync }: EditRouterDeps) {
  return function routeEdit(docId: string, paneId: string): string {
    if (splitSync()) return docId
    const doc = documents.getState().docs[docId]
    if (!doc || doc.readOnly) return docId
    const lay = layout.getState()
    const leaf = findLeaf(lay.root, paneId)
    const tab = leaf?.tabs[leaf.active]
    if (!leaf || !tab || tab.kind !== 'doc' || tab.docId !== docId) return docId
    const shared = lay.docTabRefs(docId) > 1 || hasCopies(documents.getState().docs, doc)
    if (!shared) return docId
    const copyId = documents.getState().forkDoc(docId)
    if (!copyId) return docId
    lay.repointDoc(paneId, leaf.active, copyId)
    // Nothing shows the original any more (it was only on screen in this pane): drop it from memory.
    if (!doc.fork && layout.getState().docRefs(docId) === 0) documents.getState().close(docId)
    return copyId
  }
}

const routeEdit = createEditRouter({ documents: useDocuments, layout: useLayout, splitSync: () => useSettings.getState().splitSync })

/** Writes an edit made in `paneId` and returns the document that actually received it. */
export function commitEdit(docId: string, text: string, paneId: string): string {
  const target = routeEdit(docId, paneId)
  useDocuments.getState().setText(target, text, paneId)
  return target
}
