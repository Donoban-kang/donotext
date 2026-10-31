import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { docDirOf, imageExtFromMime } from '../../shared/images'
import { t } from '../app/i18n'
import { useSettings } from '../store/settings'
import { useToasts } from '../store/ui'
import { useDocuments } from '../store/documents'
import { parseMarkdown, serializeMarkdown } from './markdown/codec'
import { ImageDisplay } from './imageDisplay'
import { FocusMode } from './focusMode'
import { typewriterScrollDelta } from './typewriter'
import { FindPanel } from './FindPanel'
import { SearchReplace } from './findReplace'
import { getExtensions } from './markdown/extensions'
import { createDebouncer, EDIT_DEBOUNCE_MS, registerFlusher, shouldApplyRemote } from './sync'
import 'katex/dist/katex.min.css'
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
  const focusMode = useSettings((s) => s.focusMode)
  const typewriterMode = useSettings((s) => s.typewriterMode)
  const composing = useRef(false)
  const pendingRemote = useRef<string | null>(null)
  const suppress = useRef(false)
  const debouncer = useRef(createDebouncer(EDIT_DEBOUNCE_MS))
  const [findMode, setFindMode] = useState<'find' | 'replace' | null>(null)
  const editorRef = useRef<Editor | null>(null)

  const insertImages = async (files: File[]): Promise<void> => {
    const doc = useDocuments.getState().docs[docId]
    if (!doc?.path) {
      useToasts.getState().push({ kind: 'warning', message: t('imageNeedsSave') })
      return
    }
    for (const file of files) {
      const ext = imageExtFromMime(file.type)
      if (!ext) continue
      try {
        const rel = await window.api.saveImage(doc.path, new Uint8Array(await file.arrayBuffer()), ext)
        editorRef.current?.chain().focus().setImage({ src: rel, alt: '' }).run()
      } catch (e) {
        useToasts.getState().push({ kind: 'error', message: t('imageSaveFailed', { reason: e instanceof Error ? e.message : String(e) }) })
      }
    }
  }

  const editor = useEditor({
    extensions: [
      ...getExtensions().map((ext) =>
        ext.name === 'image'
          ? ImageDisplay.configure({ getBaseDir: () => docDirOf(useDocuments.getState().docs[docId]?.path ?? null) })
          : ext
      ),
      SearchReplace.configure({ onOpen: (m) => setFindMode(m) }),
      FocusMode
    ],
    content: toContent(useDocuments.getState().docs[docId]?.text ?? ''),
    editable: !readOnly,
    immediatelyRender: true,
    onUpdate: ({ editor: ed }) => {
      if (suppress.current) return
      debouncer.current.call(() => {
        const next = serializeMarkdown(ed.getJSON())
        const d = useDocuments.getState().docs[docId]
        // Loading can make the editor touch its document (e.g. add a trailing paragraph). That is not
        // an edit: an untouched file must keep its exact original text.
        if (d && d.text === d.baseline && next === d.baselineNormalized) return
        useDocuments.getState().setText(docId, next, paneId)
      })
    },
    editorProps: {
      attributes: { class: 'dn-wysiwyg', 'data-testid': `wysiwyg-${paneId}` },
      handlePaste: (_view, event) => {
        const images = Array.from(event.clipboardData?.files ?? []).filter((f) => imageExtFromMime(f.type) !== null)
        if (images.length === 0) return false
        event.preventDefault()
        void insertImages(images)
        return true
      },
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

  editorRef.current = editor

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

  // Typewriter mode: keep the caret line vertically centred while typing or moving.
  useEffect(() => {
    if (!editor || !typewriterMode) return
    const center = (): void => {
      if (editor.isDestroyed || !editor.isFocused) return
      const host = editor.view.dom.closest<HTMLElement>('.dn-editor-host')
      if (!host) return
      const c = editor.view.coordsAtPos(editor.state.selection.head)
      const r = host.getBoundingClientRect()
      const delta = typewriterScrollDelta({ caretTop: c.top, caretHeight: c.bottom - c.top, hostTop: r.top, hostHeight: r.height })
      if (delta !== 0) host.scrollTop += delta
    }
    editor.on('selectionUpdate', center)
    editor.on('update', center)
    return () => {
      editor.off('selectionUpdate', center)
      editor.off('update', center)
    }
  }, [editor, typewriterMode])

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

  return (
    <div className={`dn-editor-wrap${focusMode ? ' dn-focus-mode' : ''}${typewriterMode ? ' dn-typewriter' : ''}`}>
      {editor && findMode && <FindPanel editor={editor} mode={findMode} onClose={() => setFindMode(null)} />}
      <EditorContent editor={editor} className="dn-editor-host" />
    </div>
  )
}
