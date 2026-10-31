import type React from 'react'
import { useEffect, useRef } from 'react'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useDocuments } from '../store/documents'
import { parseMarkdown, serializeMarkdown } from './markdown/codec'
import { getExtensions } from './markdown/extensions'
import { createDebouncer, EDIT_DEBOUNCE_MS, registerFlusher, shouldApplyRemote } from './sync'
import './editor.css'

function toContent(md: string): JSONContent {
  const json = parseMarkdown(md)
  return json.content && json.content.length > 0 ? json : { type: 'doc', content: [{ type: 'paragraph' }] }
}

export interface WysiwygEditorProps {
  docId: string
  paneId: string
}

export function WysiwygEditor({ docId, paneId }: WysiwygEditorProps): React.ReactElement {
  const readOnly = useDocuments((s) => s.docs[docId]?.readOnly ?? false)
  const composing = useRef(false)
  const pendingRemote = useRef<string | null>(null)
  const suppress = useRef(false)
  const debouncer = useRef(createDebouncer(EDIT_DEBOUNCE_MS))

  const editor = useEditor({
    extensions: getExtensions(),
    content: toContent(useDocuments.getState().docs[docId]?.text ?? ''),
    editable: !readOnly,
    immediatelyRender: true,
    onUpdate: ({ editor: ed }) => {
      if (suppress.current) return
      debouncer.current.call(() => {
        useDocuments.getState().setText(docId, serializeMarkdown(ed.getJSON()), paneId)
      })
    },
    editorProps: {
      attributes: { class: 'dn-wysiwyg', 'data-testid': `wysiwyg-${paneId}` },
      handleDOMEvents: {
        compositionstart: () => {
          composing.current = true
          return false
        },
        compositionend: () => {
          composing.current = false
          const text = pendingRemote.current
          pendingRemote.current = null
          if (text !== null) queueMicrotask(() => applyRemote(text))
          return false
        }
      }
    }
  })

  const applyRemote = (text: string): void => {
    if (!editor || editor.isDestroyed) return
    if (serializeMarkdown(editor.getJSON()) === text) return
    const { from, to } = editor.state.selection
    suppress.current = true
    try {
      editor.commands.setContent(toContent(text), { emitUpdate: false })
      const max = editor.state.doc.content.size
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) })
    } finally {
      suppress.current = false
    }
  }

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor) return
    const deb = debouncer.current
    const offFlush = registerFlusher(() => deb.flush())
    const offSub = useDocuments.getState().subscribeText(docId, (text, origin) => {
      if (origin !== paneId && composing.current) {
        pendingRemote.current = text
        return
      }
      if (shouldApplyRemote({ selfId: paneId, origin, composing: composing.current })) applyRemote(text)
    })
    return () => {
      deb.flush()
      offFlush()
      offSub()
    }
    // applyRemote closes over refs and the stable editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docId, paneId])

  return <EditorContent editor={editor} className="dn-editor-host" />
}
