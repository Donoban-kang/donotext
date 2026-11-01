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
import { normalizeMarkdown, parseMarkdown, serializeMarkdown } from './markdown/codec'
import { ImageDisplay } from './imageDisplay'
import { FocusMode } from './focusMode'
import { typewriterScrollDelta } from './typewriter'
import { FindPanel } from './FindPanel'
import { SearchReplace } from './findReplace'
import { getExtensions } from './markdown/extensions'
import { commitEdit } from './editRouter'
import { merge3 } from './merge3'
import { FormatKeys } from './formatKeys'
import { askLinkUrl, pickImageFiles } from './formatDialogs'
import { registerEditor, type FormatId } from './format'
import { createDebouncer, EDIT_DEBOUNCE_MS, registerFlusher, shouldApplyRemote } from './sync'
import 'katex/dist/katex.min.css'
import './editor.css'

const COMPOSITION_SETTLE_MS = 60

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
  // The pane can be switched to an edited copy while typing; the closures below must follow it.
  const docIdRef = useRef(docId)
  docIdRef.current = docId
  const focusMode = useSettings((s) => s.focusMode)
  const typewriterMode = useSettings((s) => s.typewriterMode)
  const composing = useRef(false)
  const pendingRemote = useRef<string | null>(null)
  const compositionBase = useRef('')
  const forcing = useRef(false)
  const suppress = useRef(false)
  const debouncer = useRef(createDebouncer(EDIT_DEBOUNCE_MS))
  const [findMode, setFindMode] = useState<'find' | 'replace' | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const runFormat = useRef<(id: FormatId) => void>(() => undefined)

  const insertImages = async (files: File[]): Promise<void> => {
    const doc = useDocuments.getState().docs[docIdRef.current]
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
          ? ImageDisplay.configure({ getBaseDir: () => docDirOf(useDocuments.getState().docs[docIdRef.current]?.path ?? null) })
          : ext
      ),
      SearchReplace.configure({ onOpen: (m) => setFindMode(m) }),
      FormatKeys.configure({ onRun: (id) => runFormat.current(id) }),
      FocusMode
    ],
    content: toContent(useDocuments.getState().docs[docId]?.text ?? ''),
    editable: !readOnly,
    immediatelyRender: true,
    onUpdate: ({ editor: ed }) => {
      if (suppress.current) return
      debouncer.current.call(() => {
        // Half-composed syllables are not pushed to other panes; finishComposition() sends the result.
        if (composing.current && !forcing.current) return
        const next = serializeMarkdown(ed.getJSON())
        const d = useDocuments.getState().docs[docIdRef.current]
        // Loading can make the editor touch its document (e.g. add a trailing paragraph). That is not
        // an edit: an untouched file must keep its exact original text.
        if (d && d.text === d.baseline && next === d.baselineNormalized) return
        docIdRef.current = commitEdit(docIdRef.current, next, paneId)
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
          compositionBase.current = useDocuments.getState().docs[docIdRef.current]?.text ?? ''
          return false
        },
        compositionend: () => {
          // ProseMirror reads the composed text from the DOM a moment after this event.
          setTimeout(finishComposition, COMPOSITION_SETTLE_MS)
          return false
        }
      }
    }
  })

  editorRef.current = editor

  runFormat.current = (id) => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    const chain = () => ed.chain().focus()
    switch (id) {
      case 'bold':
        chain().toggleBold().run()
        break
      case 'italic':
        chain().toggleItalic().run()
        break
      case 'underline':
        chain().toggleUnderline().run()
        break
      case 'strike':
        chain().toggleStrike().run()
        break
      case 'code':
        chain().toggleCode().run()
        break
      case 'superscript':
      case 'subscript':
      case 'highlight':
        chain().toggleMark(id).run()
        break
      case 'math': {
        const { from, to } = ed.state.selection
        const latex = ed.state.doc.textBetween(from, to, ' ')
        chain().insertContentAt({ from, to }, { type: 'mathInline', attrs: { latex } }).run()
        break
      }
      case 'link':
        void (async () => {
          const url = await askLinkUrl(String(ed.getAttributes('link').href ?? ''))
          if (url === null) return ed.commands.focus()
          if (url === '') return void chain().extendMarkRange('link').unsetLink().run()
          if (ed.state.selection.empty && !ed.isActive('link')) {
            chain().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
          } else {
            chain().extendMarkRange('link').setLink({ href: url }).run()
          }
        })()
        break
      case 'image':
        void pickImageFiles().then((files) => (files.length > 0 ? insertImages(files) : undefined))
        break
      case 'clear':
        chain().unsetAllMarks().run()
        break
    }
  }

  /**
   * After a Hangul/IME composition: other panes may have changed the document meanwhile. Merge their
   * changes with what was just composed instead of overwriting either side.
   */
  const finishComposition = (): void => {
    composing.current = false
    const remote = pendingRemote.current
    pendingRemote.current = null
    if (!editor || editor.isDestroyed) return
    if (remote === null) {
      debouncer.current.flush()
      return
    }
    const local = serializeMarkdown(editor.getJSON())
    const merged = merge3(normalizeMarkdown(compositionBase.current), local, normalizeMarkdown(remote))
    const text = merged ?? local
    if (merged === null) useToasts.getState().push({ kind: 'warning', message: t('mergeConflict') })
    debouncer.current.cancel()
    if (text !== local) applyRemote(text)
    docIdRef.current = commitEdit(docIdRef.current, text, paneId)
  }

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

  useEffect(() => registerEditor(paneId, { run: (id) => runFormat.current(id) }), [paneId])

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
    const offFlush = registerFlusher(() => {
      forcing.current = true // an explicit flush (save, close) must not wait for the composition
      deb.flush()
      forcing.current = false
    })
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
