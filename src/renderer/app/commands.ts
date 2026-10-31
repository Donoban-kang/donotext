import type { ReadResult } from '../../shared/fsTypes'
import type { DonotextApi } from '../../shared/ipc'
import { flushAllEditors } from '../editor/sync'
import { allLeaves, findLeaf } from '../layout/tree'
import type { createDocumentsStore } from '../store/documents'
import { tabDocIds, type createLayoutStore } from '../store/layoutStore'
import { t } from './i18n'

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

export interface Toast {
  kind: 'error' | 'warning' | 'info'
  message: string
}

export interface CommandDeps {
  api: DonotextApi
  documents: ReturnType<typeof createDocumentsStore>
  layout: ReturnType<typeof createLayoutStore>
  confirmUnsaved(name: string): Promise<UnsavedChoice>
  notify(toast: Toast): void
  /** Pushes pending editor edits into the document store; defaults to the editor registry. */
  flush?: () => void
  /** Called with the path of every file that was opened (recent-files list). */
  onFileOpened?: (path: string) => void
  /** Builds the sanitized HTML document for an export (needs a DOM, so it is injected). */
  buildExport?: (markdown: string, title: string) => string
}

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function createCommands(deps: CommandDeps) {
  const { api, documents, layout, confirmUnsaved, notify } = deps
  const flush = deps.flush ?? flushAllEditors
  const docs = () => documents.getState()
  const lay = () => layout.getState()

  async function writeDoc(docId: string, path: string): Promise<boolean> {
    const d = docs().docs[docId]
    if (!d) return false
    try {
      await api.writeFile(path, d.text, d.eol, d.bom)
    } catch (e) {
      notify({ kind: 'error', message: t('saveFailed', { name: d.name, reason: reason(e) }) })
      return false
    }
    docs().markSaved(docId, path === d.path ? undefined : path, d.text)
    return true
  }

  /** Saves a document; asks for a path when it has none, is read-only, or `forceDialog` is set. */
  async function saveDoc(docId: string, forceDialog = false): Promise<boolean> {
    flush()
    const d = docs().docs[docId]
    if (!d) return false
    if (forceDialog || !d.path || d.readOnly) {
      const path = await api.saveAsDialog(d.name)
      if (!path) return false
      return writeDoc(docId, path)
    }
    return writeDoc(docId, d.path)
  }

  const activeDocId = (): string | null => {
    const a = lay().getActiveTab()
    return a && a.tab.kind === 'doc' ? a.tab.docId : null
  }

  function showResults(results: ReadResult[]): void {
    for (const r of results) {
      const id = docs().open(r)
      lay().openDoc(id, docs().docs[id].sourceOnly ? 'source' : 'wysiwyg')
      deps.onFileOpened?.(r.path)
      if (r.warning === 'tooLarge') notify({ kind: 'warning', message: t('warnTooLarge') })
      if (r.warning === 'notUtf8') notify({ kind: 'warning', message: t('warnNotUtf8') })
    }
  }

  async function openFile(): Promise<void> {
    try {
      showResults(await api.openFileDialog())
    } catch (e) {
      notify({ kind: 'error', message: t('openFailed', { reason: reason(e) }) })
    }
  }

  /** Opens a file whose path is already known (e.g. clicked in the file tree). */
  async function openPath(path: string): Promise<void> {
    try {
      showResults([await api.readFile(path)])
    } catch (e) {
      notify({ kind: 'error', message: t('openFailed', { reason: reason(e) }) })
    }
  }

  /** Replaces a document's text with the file's current content, discarding local edits. */
  async function reloadFromDisk(docId: string): Promise<void> {
    const d = docs().docs[docId]
    if (!d?.path) return
    try {
      docs().reload(docId, await api.readFile(d.path))
    } catch (e) {
      notify({ kind: 'error', message: t('openFailed', { reason: reason(e) }) })
    }
  }

  /** Dismisses the "changed on disk" notice and keeps the in-editor text. */
  function keepLocal(docId: string): void {
    docs().setExternal(docId, 'none')
  }

  function newUntitled(): void {
    lay().openDoc(docs().openUntitled(), 'wysiwyg')
  }

  async function saveActive(): Promise<boolean> {
    const id = activeDocId()
    return id ? saveDoc(id) : false
  }

  async function saveAsActive(): Promise<boolean> {
    const id = activeDocId()
    return id ? saveDoc(id, true) : false
  }

  async function closeTab(leafId: string, index: number): Promise<boolean> {
    flush()
    const tab = findLeaf(lay().root, leafId)?.tabs[index]
    if (!tab) return false
    const ids = tabDocIds(tab)
    for (const id of ids) {
      // Only ask when this tab is the last view of a modified document.
      if (lay().docRefs(id) > 1 || !docs().isDirty(id)) continue
      const choice = await confirmUnsaved(docs().docs[id].name)
      if (choice === 'cancel') return false
      if (choice === 'save' && !(await saveDoc(id))) return false
    }
    lay().closeTabAt(leafId, index)
    for (const id of ids) if (lay().docRefs(id) === 0) docs().close(id)
    return true
  }

  async function closeActiveTab(): Promise<boolean> {
    const a = lay().getActiveTab()
    return a ? closeTab(a.leafId, a.index) : false
  }

  /** Exports the active document as a standalone HTML file or a PDF. Resolves to the file path, or null. */
  async function exportActive(kind: 'html' | 'pdf'): Promise<string | null> {
    const id = activeDocId()
    const first = id ? docs().docs[id] : undefined
    if (!id || !first || first.sourceOnly || !deps.buildExport) {
      notify({ kind: 'warning', message: t('exportNeedsMarkdown') })
      return null
    }
    flush()
    const doc = docs().docs[id]
    const title = doc.name.replace(/\.[^.]*$/, '')
    try {
      const html = deps.buildExport(doc.text, title)
      const out = kind === 'html' ? await api.exportHtml(html, doc.name, doc.path) : await api.exportPdf(html, doc.name, doc.path)
      if (out) notify({ kind: 'info', message: t('exported', { path: out }) })
      return out
    } catch (e) {
      notify({ kind: 'error', message: t('exportFailed', { reason: reason(e) }) })
      return null
    }
  }

  /** Splits the active pane; the new pane shows the same tab so one file can be viewed twice. */
  function splitActive(dir: 'row' | 'col'): boolean {
    const active = lay().getActiveTab()
    if (!lay().splitActive(dir)) {
      notify({ kind: 'warning', message: t('splitLimit') })
      return false
    }
    if (active) lay().openTabInActive({ ...active.tab })
    return true
  }

  /** Closes a pane and its tabs (asking about unsaved changes). The last pane is never closed. */
  async function closePane(leafId = lay().activeLeafId): Promise<boolean> {
    if (allLeaves(lay().root).length <= 1) return false
    const leaf = findLeaf(lay().root, leafId)
    if (!leaf) return false
    for (let i = leaf.tabs.length - 1; i >= 0; i--) {
      if (!(await closeTab(leafId, i))) return false
    }
    lay().closeLeafById(leafId)
    return true
  }

  /** Opens a side-by-side comparison of two open documents in the active pane. */
  function compareDocs(leftDocId: string, rightDocId: string): boolean {
    const d = docs().docs
    if (leftDocId === rightDocId || !d[leftDocId] || !d[rightDocId]) {
      notify({ kind: 'warning', message: t('compareNeedsTwo') })
      return false
    }
    lay().openTabInActive({ kind: 'compare', leftDocId, rightDocId })
    return true
  }

  function focusPane(delta: number): void {
    lay().focusRelative(delta)
  }

  /** Links the active pane's scrolling to the next pane, or removes the link. */
  function toggleScrollLink(): void {
    if (lay().scrollLink) {
      lay().setScrollLink(null)
      return
    }
    const leaves = allLeaves(lay().root)
    if (leaves.length < 2) return
    const i = leaves.findIndex((l) => l.id === lay().activeLeafId)
    lay().setScrollLink({ a: leaves[i].id, b: leaves[(i + 1) % leaves.length].id })
  }

  /**
   * Called when the window is about to close: offers to save every modified document.
   * Resolves to false when the user cancels (or a save fails), meaning the app must stay open.
   */
  async function confirmQuit(): Promise<boolean> {
    flush() // the last keystrokes are still in the editors' debounce window
    for (const d of Object.values(docs().docs)) {
      if (!docs().isDirty(d.id)) continue
      const choice = await confirmUnsaved(d.name)
      if (choice === 'cancel') return false
      if (choice === 'save') {
        if (!(await saveDoc(d.id))) return false
      } else {
        docs().discardChanges(d.id)
      }
      // Either way nothing unsaved is left, so the crash backup must not resurrect it next time.
      await api.clearBackup(d.id).catch(() => undefined)
    }
    return true
  }

  function toggleView(): void {
    const a = lay().getActiveTab()
    if (!a || a.tab.kind !== 'doc') return
    const doc = docs().docs[a.tab.docId]
    if (!doc || doc.sourceOnly) return
    lay().setTabView(a.leafId, a.index, a.tab.view === 'wysiwyg' ? 'source' : 'wysiwyg')
  }

  return { openFile, openPath, exportActive, confirmQuit, reloadFromDisk, keepLocal, splitActive, closePane, compareDocs, focusPane, toggleScrollLink, newUntitled, saveActive, saveAsActive, closeTab, closeActiveTab, toggleView, saveDoc }
}

export type Commands = ReturnType<typeof createCommands>
