import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { MergeView } from '@codemirror/merge'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { t } from '../app/i18n'
import { useDocuments } from '../store/documents'
import { createDocBinding } from './docBinding'
import './editor.css'

export interface CompareViewProps {
  leftDocId: string
  rightDocId: string
  paneId: string
}

type MergeDirection = 'a-to-b' | 'b-to-a'

function sideExtensions(docId: string, bindingExt: Extension): Extension[] {
  const readOnly = useDocuments.getState().docs[docId]?.readOnly ?? false
  return [
    history(),
    drawSelection(),
    search({ top: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    markdown(),
    EditorView.lineWrapping,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    bindingExt
  ]
}

/** Side-by-side diff of two documents; both sides stay editable and bound to their documents. */
export function CompareView({ leftDocId, rightDocId, paneId }: CompareViewProps): React.ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const merge = useRef<MergeView | null>(null)
  const [count, setCount] = useState(0)
  const [current, setCurrent] = useState(0) // 1-based index of the chunk last jumped to; 0 = none yet
  const [direction, setDirection] = useState<MergeDirection>('a-to-b')
  const leftName = useDocuments((s) => s.docs[leftDocId]?.name ?? '')
  const rightName = useDocuments((s) => s.docs[rightDocId]?.name ?? '')

  useEffect(() => {
    const left = useDocuments.getState().docs[leftDocId]
    const right = useDocuments.getState().docs[rightDocId]
    if (!left || !right || !host.current) return
    const leftBinding = createDocBinding(leftDocId, `${paneId}:a`)
    const rightBinding = createDocBinding(rightDocId, `${paneId}:b`)
    const refresh = (): void => {
      // MergeView recomputes its chunks after the transaction; read them on the next tick.
      setTimeout(() => {
        if (merge.current) setCount(merge.current.chunks.length)
      }, 0)
    }
    const watch = EditorView.updateListener.of((u) => {
      if (u.docChanged) refresh()
    })
    const mv = new MergeView({
      parent: host.current,
      a: { doc: left.text, extensions: [sideExtensions(leftDocId, leftBinding.extensions), watch] },
      b: { doc: right.text, extensions: [sideExtensions(rightDocId, rightBinding.extensions), watch] },
      revertControls: 'a-to-b',
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 }
    })
    merge.current = mv
    leftBinding.attach(mv.a)
    rightBinding.attach(mv.b)
    refresh()
    return () => {
      leftBinding.detach()
      rightBinding.detach()
      mv.destroy()
      merge.current = null
    }
  }, [leftDocId, rightDocId, paneId])

  useEffect(() => {
    merge.current?.reconfigure({ revertControls: direction })
  }, [direction])

  const jump = (delta: 1 | -1): void => {
    const mv = merge.current
    if (!mv || mv.chunks.length === 0) return
    const n = mv.chunks.length
    const next = current === 0 ? (delta === 1 ? 0 : n - 1) : (((current - 1 + delta) % n) + n) % n
    const chunk = mv.chunks[next]
    // Prefer the right-hand side; fall back to the left when the right has no lines in this chunk.
    const useB = chunk.toB > chunk.fromB || chunk.toA === chunk.fromA
    const view = useB ? mv.b : mv.a
    const pos = Math.min(useB ? chunk.fromB : chunk.fromA, view.state.doc.length)
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    view.focus()
    setCurrent(next + 1)
  }

  const label = count === 0 ? t('noDiff') : current === 0 ? t('diffCount', { count: String(count) }) : t('diffPosition', { count: String(count), index: String(current) })

  return (
    <div
      className="dn-compare"
      data-testid="compare-view"
      onKeyDown={(e) => {
        if (e.key === 'F7') {
          e.preventDefault()
          jump(e.shiftKey ? -1 : 1)
        }
      }}
    >
      <div className="dn-compare-bar">
        <span className="dn-compare-name" data-testid="compare-left-name">{leftName}</span>
        <span className="dn-compare-name" data-testid="compare-right-name">{rightName}</span>
        <button onClick={() => jump(-1)} disabled={count === 0}>
          {t('prevDiff')}
        </button>
        <button onClick={() => jump(1)} disabled={count === 0}>
          {t('nextDiff')}
        </button>
        <span data-testid="diff-count">{label}</span>
        <label>
          {t('mergeDirection')}{' '}
          <select value={direction} onChange={(e) => setDirection(e.target.value as MergeDirection)} aria-label={t('mergeDirection')}>
            <option value="a-to-b">{t('mergeRight')}</option>
            <option value="b-to-a">{t('mergeLeft')}</option>
          </select>
        </label>
      </div>
      <div ref={host} className="dn-compare-host" />
    </div>
  )
}
