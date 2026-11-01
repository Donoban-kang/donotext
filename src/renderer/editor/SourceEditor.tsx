import type React from 'react'
import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { useDocuments } from '../store/documents'
import { useSettings } from '../store/settings'
import { createDocBinding } from './docBinding'
import { FORMAT_KEYS, registerEditor } from './format'
import { runSourceFormat } from './sourceActions'
import './editor.css'

export interface SourceEditorProps {
  docId: string
  paneId: string
}

export function SourceEditor({ docId, paneId }: SourceEditorProps): React.ReactElement {
  const host = useRef<HTMLDivElement>(null)
  // The pane can be switched to an edited copy while typing; image saving must use the current document.
  const docIdRef = useRef(docId)
  docIdRef.current = docId

  useEffect(() => {
    const doc = useDocuments.getState().docs[docId]
    if (!doc || !host.current) return
    const binding = createDocBinding(docId, paneId)
    // Wrapping and spell-checking follow the settings while the editor stays open.
    const wrap = new Compartment()
    const spell = new Compartment()
    const wrapExt = (on: boolean) => (on ? EditorView.lineWrapping : [])
    const spellExt = (on: boolean) => EditorView.contentAttributes.of({ spellcheck: String(on) })
    const initial = useSettings.getState()
    let view: EditorView
    const handle = { run: (id: Parameters<typeof runSourceFormat>[1]) => void runSourceFormat(view, id, () => docIdRef.current) }
    view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: doc.text,
        extensions: [
          Prec.high(
            keymap.of(
              FORMAT_KEYS.map(({ key, id }) => ({
                key,
                preventDefault: true,
                run: () => {
                  handle.run(id)
                  return true
                }
              }))
            )
          ),
          history(),
          drawSelection(),
          search({ top: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          markdown(),
          wrap.of(wrapExt(initial.wordWrap)),
          spell.of(spellExt(initial.spellcheck)),
          EditorState.readOnly.of(doc.readOnly),
          EditorView.editable.of(!doc.readOnly),
          EditorView.contentAttributes.of({ 'data-testid': `source-${paneId}` }),
          binding.extensions
        ]
      })
    })
    binding.attach(view)
    const unregister = registerEditor(paneId, handle)
    const offSettings = useSettings.subscribe((s, prev) => {
      if (s.wordWrap !== prev.wordWrap) view.dispatch({ effects: wrap.reconfigure(wrapExt(s.wordWrap)) })
      if (s.spellcheck !== prev.spellcheck) view.dispatch({ effects: spell.reconfigure(spellExt(s.spellcheck)) })
    })
    return () => {
      offSettings()
      unregister()
      binding.detach()
      view.destroy()
    }
    // The editor keeps running when its pane is switched to an edited copy of the document (the binding
    // follows the copy itself), so only a different pane may recreate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId])

  return <div ref={host} className="dn-source-host" />
}
