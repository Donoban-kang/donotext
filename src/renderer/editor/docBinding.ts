import { Annotation, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useDocuments } from '../store/documents'
import { createDebouncer, EDIT_DEBOUNCE_MS, registerFlusher, shouldApplyRemote } from './sync'

const remote = Annotation.define<boolean>()

export interface DocBinding {
  /** Add to the CodeMirror state: reports user edits to the document store. */
  extensions: Extension[]
  /** Call once the EditorView exists: applies edits made elsewhere to this view. */
  attach(view: EditorView): void
  detach(): void
}

/**
 * Connects one CodeMirror view to a document in the store, with the same rules as the WYSIWYG
 * editor: debounced writes tagged with `paneId`, no echo of our own edits, and remote updates
 * held back while an IME composition is active.
 */
export function createDocBinding(docId: string, paneId: string): DocBinding {
  const deb = createDebouncer(EDIT_DEBOUNCE_MS)
  let view: EditorView | null = null
  let pending: string | null = null
  let offFlush: (() => void) | null = null
  let offSub: (() => void) | null = null

  const applyRemote = (text: string): void => {
    if (!view || view.state.doc.toString() === text) return
    const sel = view.state.selection.main
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: Math.min(sel.anchor, text.length), head: Math.min(sel.head, text.length) },
      annotations: remote.of(true)
    })
  }

  return {
    extensions: [
      EditorView.updateListener.of((u) => {
        if (!u.docChanged || u.transactions.some((t) => t.annotation(remote))) return
        deb.call(() => useDocuments.getState().setText(docId, u.view.state.doc.toString(), paneId))
      }),
      EditorView.domEventHandlers({
        compositionend: () => {
          const text = pending
          pending = null
          if (text !== null) setTimeout(() => applyRemote(text), 0)
          return false
        }
      })
    ],
    attach(v) {
      view = v
      offFlush = registerFlusher(() => deb.flush())
      offSub = useDocuments.getState().subscribeText(docId, (text, origin) => {
        if (origin !== paneId && v.composing) {
          pending = text
          return
        }
        if (shouldApplyRemote({ selfId: paneId, origin, composing: v.composing })) applyRemote(text)
      })
    },
    detach() {
      deb.flush()
      offFlush?.()
      offSub?.()
      view = null
    }
  }
}
