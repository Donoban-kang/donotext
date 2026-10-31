import type React from 'react'
import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { Annotation, EditorState } from '@codemirror/state'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { useDocuments } from '../store/documents'
import { createDebouncer, EDIT_DEBOUNCE_MS, registerFlusher, shouldApplyRemote } from './sync'
import './editor.css'

const remote = Annotation.define<boolean>()

export interface SourceEditorProps {
  docId: string
  paneId: string
}

export function SourceEditor({ docId, paneId }: SourceEditorProps): React.ReactElement {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const doc = useDocuments.getState().docs[docId]
    if (!doc || !host.current) return
    const deb = createDebouncer(EDIT_DEBOUNCE_MS)
    let pending: string | null = null

    const view: EditorView = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: doc.text,
        extensions: [
          history(),
          drawSelection(),
          search({ top: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          markdown(),
          EditorView.lineWrapping,
          EditorState.readOnly.of(doc.readOnly),
          EditorView.editable.of(!doc.readOnly),
          EditorView.contentAttributes.of({ 'data-testid': `source-${paneId}` }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || u.transactions.some((t) => t.annotation(remote))) return
            deb.call(() => useDocuments.getState().setText(docId, view.state.doc.toString(), paneId))
          }),
          EditorView.domEventHandlers({
            compositionend: () => {
              const text = pending
              pending = null
              if (text !== null) setTimeout(() => applyRemote(text), 0)
              return false
            }
          })
        ]
      })
    })

    const applyRemote = (text: string): void => {
      if (view.state.doc.toString() === text) return
      const sel = view.state.selection.main
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: Math.min(sel.anchor, text.length), head: Math.min(sel.head, text.length) },
        annotations: remote.of(true)
      })
    }

    const offFlush = registerFlusher(() => deb.flush())
    const offSub = useDocuments.getState().subscribeText(docId, (text, origin) => {
      if (origin !== paneId && view.composing) {
        pending = text
        return
      }
      if (shouldApplyRemote({ selfId: paneId, origin, composing: view.composing })) applyRemote(text)
    })

    return () => {
      deb.flush()
      offFlush()
      offSub()
      view.destroy()
    }
  }, [docId, paneId])

  return <div ref={host} className="dn-source-host" />
}
