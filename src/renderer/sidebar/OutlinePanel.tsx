import type React from 'react'
import { useMemo } from 'react'
import { EditorView } from '@codemirror/view'
import { t } from '../app/i18n'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { extractOutline } from './outline'

const HEADINGS = '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'

function gotoHeading(index: number, offset: number): void {
  const pane = document.querySelector('.dn-pane.active')
  const cm = pane?.querySelector<HTMLElement>('.cm-editor')
  const view = cm ? EditorView.findFromDOM(cm) : null
  if (view) {
    const pos = Math.min(offset, view.state.doc.length)
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
    view.focus()
    return
  }
  pane?.querySelectorAll(HEADINGS)[index]?.scrollIntoView({ block: 'start' })
}

export function Outline(): React.ReactElement {
  const text = useDocuments((s) => {
    const a = useLayout.getState().getActiveTab()
    return a?.tab.kind === 'doc' ? s.docs[a.tab.docId]?.text : undefined
  })
  // Re-evaluate when the active tab changes, not only when text does.
  useLayout((s) => s.getActiveTab()?.tab)
  const items = useMemo(() => (text ? extractOutline(text) : []), [text])
  if (items.length === 0) return <p className="dn-sidebar-empty">{t('noHeadings')}</p>
  return (
    <ul className="dn-outline" data-testid="outline">
      {items.map((h, i) => (
        <li key={`${h.offset}`} style={{ paddingLeft: (h.level - 1) * 12 }}>
          <button onClick={() => gotoHeading(i, h.offset)}>{h.text}</button>
        </li>
      ))}
    </ul>
  )
}
