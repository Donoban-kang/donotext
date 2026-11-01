import type { EditorView } from '@codemirror/view'
import { imageExtFromMime } from '../../shared/images'
import { t } from '../app/i18n'
import { useDocuments } from '../store/documents'
import { useToasts } from '../store/ui'
import { askLinkUrl, pickImageFiles } from './formatDialogs'
import type { FormatId } from './format'
import { clearFormatting, imageEdit, linkEdit, toggleWrap, WRAPPERS, type Edit } from './sourceFormat'

function apply(view: EditorView, e: Edit): void {
  view.dispatch({
    changes: { from: e.from, to: e.to, insert: e.insert },
    selection: { anchor: e.anchor, head: e.head },
    userEvent: 'input'
  })
  view.focus()
}

/** Applies a format in the source editor by writing the markdown markers around the selection. */
export async function runSourceFormat(view: EditorView, id: FormatId, getDocId: () => string): Promise<void> {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc.toString()
  const wrap = WRAPPERS[id]
  if (wrap) return apply(view, toggleWrap(doc, from, to, wrap[0], wrap[1]))
  if (id === 'clear') {
    const insert = clearFormatting(doc.slice(from, to))
    return apply(view, { from, to, insert, anchor: from, head: from + insert.length })
  }
  if (id === 'link') {
    const sel = doc.slice(from, to)
    const current = /^\[[^\]]*\]\(([^)]*)\)$/.exec(sel)?.[1] ?? ''
    const url = await askLinkUrl(current)
    if (url === null) {
      view.focus()
      return
    }
    // The dialog may have taken a while; use the selection as it is now.
    const now = view.state.selection.main
    return apply(view, linkEdit(view.state.doc.toString(), now.from, now.to, url))
  }
  if (id === 'image') {
    const docPath = useDocuments.getState().docs[getDocId()]?.path ?? null
    if (!docPath) {
      useToasts.getState().push({ kind: 'warning', message: t('imageNeedsSave') })
      return
    }
    for (const file of await pickImageFiles()) {
      const ext = imageExtFromMime(file.type)
      if (!ext) continue
      try {
        const rel = await window.api.saveImage(docPath, new Uint8Array(await file.arrayBuffer()), ext)
        const now = view.state.selection.main
        apply(view, imageEdit(view.state.doc.toString(), now.from, now.to, rel))
      } catch (e) {
        useToasts.getState().push({ kind: 'error', message: t('imageSaveFailed', { reason: e instanceof Error ? e.message : String(e) }) })
      }
    }
  }
}
