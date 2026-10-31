import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { getSearchState } from './findReplace'

export interface FindPanelProps {
  editor: Editor
  mode: 'find' | 'replace'
  onClose: () => void
}

export function FindPanel({ editor, mode, onClose }: FindPanelProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [, force] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    const rerender = (): void => force((n) => n + 1)
    editor.on('transaction', rerender)
    return () => {
      editor.off('transaction', rerender)
      editor.commands.clearSearch()
    }
  }, [editor])

  useEffect(() => {
    editor.commands.setSearch(query, caseSensitive)
  }, [editor, query, caseSensitive])

  const s = getSearchState(editor.state)
  const count = s?.matches.length ?? 0

  useEffect(() => {
    document.querySelector('.dn-search-current')?.scrollIntoView({ block: 'center' })
  }, [s?.current, count])

  const close = (): void => {
    onClose()
    editor.commands.focus()
  }

  return (
    <div
      className="dn-find-panel"
      data-testid="find-panel"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
      }}
    >
      <input
        ref={input}
        aria-label="찾기"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.shiftKey ? editor.commands.findPrevious() : editor.commands.findNext())
        }}
      />
      <span data-testid="find-count">{count === 0 ? '0/0' : `${(s?.current ?? 0) + 1}/${count}`}</span>
      <button onClick={() => editor.commands.findPrevious()}>이전</button>
      <button onClick={() => editor.commands.findNext()}>다음</button>
      <label>
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> 대소문자 구분
      </label>
      {mode === 'replace' && (
        <>
          <input aria-label="바꿀 내용" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          <button onClick={() => editor.commands.replaceCurrent(replacement)}>바꾸기</button>
          <button onClick={() => editor.commands.replaceAll(replacement)}>모두 바꾸기</button>
        </>
      )}
      <button aria-label="닫기" onClick={close}>
        ✕
      </button>
    </div>
  )
}
