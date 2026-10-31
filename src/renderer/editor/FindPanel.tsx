import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { t } from '../app/i18n'
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
        aria-label={t('find')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.shiftKey ? editor.commands.findPrevious() : editor.commands.findNext())
        }}
      />
      <span data-testid="find-count">{count === 0 ? '0/0' : `${(s?.current ?? 0) + 1}/${count}`}</span>
      <button onClick={() => editor.commands.findPrevious()}>{t('findPrevious')}</button>
      <button onClick={() => editor.commands.findNext()}>{t('findNext')}</button>
      <label>
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> {t('matchCase')}
      </label>
      {mode === 'replace' && (
        <>
          <input aria-label={t('replaceWith')} value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          <button onClick={() => editor.commands.replaceCurrent(replacement)}>{t('replaceOne')}</button>
          <button onClick={() => editor.commands.replaceAll(replacement)}>{t('replaceAllMatches')}</button>
        </>
      )}
      <button aria-label={t('close')} onClick={close}>
        ✕
      </button>
    </div>
  )
}
