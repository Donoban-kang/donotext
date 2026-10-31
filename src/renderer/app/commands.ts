import type { ReadResult } from '../../shared/fsTypes'
import type { DonotextApi } from '../../shared/ipc'
import { flushAllEditors } from '../editor/sync'
import { findLeaf } from '../layout/tree'
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
    docs().markSaved(docId, path === d.path ? undefined : path)
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

  function toggleView(): void {
    const a = lay().getActiveTab()
    if (!a || a.tab.kind !== 'doc') return
    const doc = docs().docs[a.tab.docId]
    if (!doc || doc.sourceOnly) return
    lay().setTabView(a.leafId, a.index, a.tab.view === 'wysiwyg' ? 'source' : 'wysiwyg')
  }

  return { openFile, openPath, newUntitled, saveActive, saveAsActive, closeTab, closeActiveTab, toggleView, saveDoc }
}

export type Commands = ReturnType<typeof createCommands>
