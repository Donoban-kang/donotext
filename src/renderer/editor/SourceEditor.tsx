import type React from 'react'
import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { useDocuments } from '../store/documents'
import { createDocBinding } from './docBinding'
import './editor.css'

export interface SourceEditorProps {
  docId: string
  paneId: string
}

export function SourceEditor({ docId, paneId }: SourceEditorProps): React.ReactElement {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const doc = useDocuments.getState().docs[docId]
    if (!doc || !host.current) return
    const binding = createDocBinding(docId, paneId)
    const view = new EditorView({
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
          binding.extensions
        ]
      })
    })
    binding.attach(view)
    return () => {
      binding.detach()
      view.destroy()
    }
  }, [docId, paneId])

  return <div ref={host} className="dn-source-host" />
}
