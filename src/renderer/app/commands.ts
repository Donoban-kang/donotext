import type { DropEntry, ReadResult } from '../../shared/fsTypes'
import type { ImportErrorCode, ImportOutcome, ImportResult, ImportWarning } from '../../shared/importTypes'
import type { DonotextApi } from '../../shared/ipc'
import { flushAllEditors } from '../editor/sync'
import { allLeaves, findLeaf } from '../layout/tree'
import type { createDocumentsStore } from '../store/documents'
import { tabDocIds, type createLayoutStore } from '../store/layoutStore'
import { t, type MessageKey } from './i18n'

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

/** What to do with an edited copy when its tab is closed. */
export type ForkChoice = 'saveAs' | 'replace' | 'discard' | 'cancel'

export interface Toast {
  kind: 'error' | 'warning' | 'info'
  message: string
}

export interface CommandDeps {
  api: DonotextApi
  documents: ReturnType<typeof createDocumentsStore>
  layout: ReturnType<typeof createLayoutStore>
  confirmUnsaved(name: string): Promise<UnsavedChoice>
  /** Asked when the last tab of an edited copy ("수정본") closes. Defaults to cancelling. */
  confirmForkClose?(name: string, canReplace: boolean): Promise<ForkChoice>
  /** Last warning before an original file is overwritten. Defaults to refusing. */
  confirmOverwrite?(name: string): Promise<boolean>
  notify(toast: Toast): void
  /** Pushes pending editor edits into the document store; defaults to the editor registry. */
  flush?: () => void
  /** Called with the path of every file that was opened (recent-files list). */
  onFileOpened?: (path: string) => void
  /** Shows a dropped folder in the sidebar. */
  openFolder?(root: string): void
  /** Builds the sanitized HTML document for an export (needs a DOM, so it is injected). */
  buildExport?: (markdown: string, title: string) => string
}

const samePath = (a: string, b: string): boolean => a.replace(/\\/g, '/') === b.replace(/\\/g, '/')

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const IMPORT_FAIL_KEY: Record<ImportErrorCode, MessageKey> = {
  tooLarge: 'importFailTooLarge',
  unsupported: 'importFailUnsupported',
  unreadable: 'importFailUnreadable',
  encrypted: 'importFailEncrypted',
  timeout: 'importFailTimeout',
  notAllowed: 'importFailNotAllowed',
  failed: 'importFailFailed'
}

const IMPORT_WARN_KEY: Partial<Record<ImportWarning['code'], MessageKey>> = {
  garbled: 'importWarnGarbled',
  pagesTruncated: 'importWarnPages',
  rowsTruncated: 'importWarnRows',
  imagesSkipped: 'importWarnImages'
}

/** "제목 3 · 표 1 · 목록 6" - what the converter recognised, so the user can judge the result at a glance. */
function importSummary(r: ImportResult): string {
  const parts: string[] = []
  if (r.stats.headings > 0) parts.push(t('importStatHeadings', { n: String(r.stats.headings) }))
  if (r.stats.tables > 0) parts.push(t('importStatTables', { n: String(r.stats.tables) }))
  if (r.stats.listItems > 0) parts.push(t('importStatLists', { n: String(r.stats.listItems) }))
  parts.push(t('importStatChars', { n: r.stats.chars.toLocaleString('ko-KR') }))
  return parts.join(' · ')
}

export function createCommands(deps: CommandDeps) {
  const { api, documents, layout, confirmUnsaved, notify } = deps
  const flush = deps.flush ?? flushAllEditors
  const docs = () => documents.getState()
  const lay = () => layout.getState()

  async function writeDoc(docId: string, path: string): Promise<boolean> {
    const d = docs().docs[docId]
    if (!d) return false
    try {
      await api.writeFile(path, d.text, d.eol, d.bom, d.encoding)
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
    // An edited copy never writes to the original on a plain save: it always asks for a new name.
    const isCopy = d.fork === true
    if (isCopy && !forceDialog) notify({ kind: 'info', message: t('forkSaveHint') })
    if (forceDialog || !d.path || d.readOnly || isCopy) {
      const path = await api.saveAsDialog(d.name)
      if (!path) return false
      if (isCopy && d.path !== null && samePath(path, d.path)) {
        notify({ kind: 'error', message: t('forkSameFile') })
        return false
      }
      // The text of a file that was not valid UTF-8 is lossy: writing it back would destroy the original.
      if (d.warning === 'notUtf8' && d.path !== null && samePath(path, d.path)) {
        notify({ kind: 'error', message: t('refuseLossyOverwrite') })
        return false
      }
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

  const importLabels = () => ({ slide: t('importSlideLabel'), notes: t('importNotesLabel') })

  /** Shows the outcome of a conversion. A good result opens as a new unsaved document; returns true then. */
  function finishImport(outcome: ImportOutcome): boolean {
    if (!outcome.ok) {
      notify({ kind: 'error', message: t(IMPORT_FAIL_KEY[outcome.code], { name: outcome.name }) })
      return false
    }
    const name = `${outcome.baseName}.md`
    if (outcome.markdown.trim() === '') {
      const scanned = outcome.warnings.some((w) => w.code === 'noText')
      notify({ kind: scanned ? 'error' : 'warning', message: t(scanned ? 'importNoText' : 'importEmpty', { name: outcome.baseName }) })
      return false
    }
    flush()
    const id = docs().openUntitled(name)
    docs().setText(id, outcome.markdown, 'import')
    lay().openDoc(id, 'wysiwyg')
    notify({ kind: 'info', message: t('importDone', { name: outcome.baseName, summary: importSummary(outcome) }) })
    for (const w of outcome.warnings) {
      const key = IMPORT_WARN_KEY[w.code]
      if (key) notify({ kind: 'warning', message: t(key, { count: String(w.count ?? 0) }) })
    }
    if (outcome.format === 'pdf') notify({ kind: 'info', message: t('importPdfNote') })
    return true
  }

  /** The toolbar's "가져오기": pick a PDF or Office document and open its Markdown as a new document. */
  async function importDocument(): Promise<void> {
    let outcome: ImportOutcome | null
    try {
      outcome = await api.importDialog(importLabels())
    } catch (e) {
      notify({ kind: 'error', message: t('openFailed', { reason: reason(e) }) })
      return
    }
    if (outcome) finishImport(outcome)
  }

  async function importDropped(path: string, name: string): Promise<boolean> {
    notify({ kind: 'info', message: t('importing', { name }) })
    try {
      return finishImport(await api.importFile(path, importLabels()))
    } catch (e) {
      notify({ kind: 'error', message: t('openFailed', { reason: reason(e) }) })
      return false
    }
  }

  function newUntitled(): void {
    lay().openDoc(docs().openUntitled(), 'wysiwyg')
  }

  async function saveActive(): Promise<boolean> {
    flush() // typing in a shared pane may switch it to its own copy; the active document is the copy then
    const id = activeDocId()
    return id ? saveDoc(id) : false
  }

  async function saveAsActive(): Promise<boolean> {
    flush()
    const id = activeDocId()
    return id ? saveDoc(id, true) : false
  }

  /** Overwrites the original file with an edited copy's text. Returns false when cancelled or it failed. */
  async function replaceOriginal(docId: string): Promise<boolean> {
    flush()
    const d = docs().docs[docId]
    if (!d || d.path === null) return false
    if (d.warning === 'notUtf8') {
      notify({ kind: 'error', message: t('refuseLossyOverwrite') })
      return false
    }
    if (!(await (deps.confirmOverwrite?.(d.name) ?? Promise.resolve(false)))) return false
    try {
      await api.writeFile(d.path, d.text, d.eol, d.bom, d.encoding)
    } catch (e) {
      notify({ kind: 'error', message: t('saveFailed', { name: d.name, reason: reason(e) }) })
      return false
    }
    // An open original now shows the new content.
    for (const o of Object.values(docs().docs)) {
      if (o.fork || o.id === docId || o.path === null || !samePath(o.path, d.path)) continue
      try {
        docs().reload(o.id, await api.readFile(d.path))
      } catch {
        // the file watcher reports it if it really is unreadable
      }
    }
    return true
  }

  async function closeTab(leafId: string, index: number): Promise<boolean> {
    flush()
    const tab = findLeaf(lay().root, leafId)?.tabs[index]
    if (!tab) return false
    const ids = tabDocIds(tab)
    for (const id of ids) {
      // Only ask when this tab is the last view of a modified document.
      if (lay().docRefs(id) > 1 || !docs().isDirty(id)) continue
      const copy = docs().docs[id]
      if (copy?.fork) {
        const canReplace = copy.path !== null && copy.warning !== 'notUtf8'
        const pick = await (deps.confirmForkClose?.(copy.name, canReplace) ?? Promise.resolve<ForkChoice>('cancel'))
        if (pick === 'cancel') return false
        if (pick === 'saveAs' && !(await saveDoc(id, true))) return false
        if (pick === 'replace' && !(await replaceOriginal(id))) return false
        continue
      }
      const choice = await confirmUnsaved(docs().docs[id].name)
      if (choice === 'cancel') return false
      if (choice === 'save' && !(await saveDoc(id))) return false
    }
    removeTab(leafId, index, ids)
    return true
  }

  /** An empty, never-saved "제목 없음" document the user has not typed into: safe to swap for a dropped file. */
  function untitledPlaceholder(leafId: string): { docId: string } | null {
    const leaf = findLeaf(lay().root, leafId)
    const tab = leaf?.tabs[leaf.active]
    if (tab?.kind !== 'doc') return null
    const d = docs().docs[tab.docId]
    return d && d.path === null && !d.fork && d.text === '' && !docs().isDirty(d.id) && lay().docRefs(d.id) === 1 ? { docId: d.id } : null
  }

  /**
   * Opens what was just dropped on the window: files become tabs in the pane they were dropped on, a
   * folder opens in the sidebar, and binary or oversized files are refused with a short notice.
   */
  async function openDropped(leafId?: string): Promise<void> {
    if (leafId) lay().focusLeaf(leafId)
    let entries: DropEntry[]
    try {
      entries = await api.takeDrop()
    } catch (e) {
      notify({ kind: 'error', message: t('openFailed', { reason: reason(e) }) })
      return
    }
    flush() // text typed a moment ago must count: an untitled document with typing in it is never swapped out
    const target = lay().activeLeafId
    const placeholder = untitledPlaceholder(target)
    const results: ReadResult[] = []
    let imported = false
    for (const entry of entries) {
      if (entry.kind === 'file') results.push(entry.result)
      else if (entry.kind === 'folder') deps.openFolder?.(entry.root)
      else if (entry.kind === 'importable') imported = (await importDropped(entry.path, entry.name)) || imported
      else {
        const key = entry.reason === 'binary' ? 'dropBinary' : entry.reason === 'tooLarge' ? 'dropTooLarge' : 'dropUnreadable'
        notify({ kind: 'warning', message: t(key, { name: entry.name }) })
      }
    }
    if (results.length === 0 && !imported) return
    showResults(results)
    if (placeholder) {
      const leaf = findLeaf(lay().root, target)
      const at = leaf?.tabs.findIndex((x) => x.kind === 'doc' && x.docId === placeholder.docId) ?? -1
      if (at >= 0 && leaf && leaf.tabs.length > 1) removeTab(target, at, [placeholder.docId])
    }
  }

  function removeTab(leafId: string, index: number, ids: string[]): void {
    lay().closeTabAt(leafId, index)
    for (const id of ids) if (lay().docRefs(id) === 0) docs().close(id)
  }

  /** Context-menu action for an edited copy: overwrite the original (after confirming), then close the copy's tab. */
  async function replaceAndClose(leafId: string, index: number): Promise<boolean> {
    flush()
    const tab = findLeaf(lay().root, leafId)?.tabs[index]
    if (!tab || tab.kind !== 'doc') return false
    const d = docs().docs[tab.docId]
    if (!d?.fork || !(await replaceOriginal(d.id))) return false
    // The tab may have moved while the confirmation was open.
    const leaf = findLeaf(lay().root, leafId)
    const at = leaf?.tabs.findIndex((x) => x.kind === 'doc' && x.docId === d.id) ?? -1
    if (at >= 0) removeTab(leafId, at, [d.id])
    return true
  }

  async function closeActiveTab(): Promise<boolean> {
    const a = lay().getActiveTab()
    return a ? closeTab(a.leafId, a.index) : false
  }

  /** Exports the active document as a standalone HTML file or a PDF. Resolves to the file path, or null. */
  async function exportActive(kind: 'html' | 'pdf'): Promise<string | null> {
    flush()
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

  return { openFile, openPath, exportActive, confirmQuit, reloadFromDisk, keepLocal, splitActive, closePane, compareDocs, focusPane, toggleScrollLink, newUntitled, saveActive, saveAsActive, closeTab, closeActiveTab, toggleView, saveDoc, replaceOriginal, replaceAndClose, openDropped, importDocument }
}

export type Commands = ReturnType<typeof createCommands>
