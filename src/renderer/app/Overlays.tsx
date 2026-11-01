import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { useDialogs, useToasts } from '../store/ui'
import { getCommands } from './appCommands'
import { t } from './i18n'

export function ConfirmUnsavedDialog(): React.ReactElement | null {
  const state = useDialogs((s) => s.unsaved)
  const answer = useDialogs((s) => s.answer)
  const saveBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (state) saveBtn.current?.focus()
  }, [state])
  if (!state) return null
  return (
    <div className="dn-modal-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dn-unsaved-title"
        className="dn-modal"
        onKeyDown={(e) => {
          if (e.key === 'Escape') answer('cancel')
        }}
      >
        <h2 id="dn-unsaved-title">{t('confirmUnsavedTitle', { name: state.name })}</h2>
        <p>{t('confirmUnsavedBody')}</p>
        <div className="dn-modal-actions">
          <button ref={saveBtn} onClick={() => answer('save')}>
            {t('save')}
          </button>
          <button onClick={() => answer('discard')}>{t('discard')}</button>
          <button onClick={() => answer('cancel')}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}

export function LinkDialog(): React.ReactElement | null {
  const state = useDialogs((s) => s.linkAsk)
  const answer = useDialogs((s) => s.answerLink)
  const [url, setUrl] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!state) return
    setUrl(state.initial)
    input.current?.focus()
    input.current?.select()
  }, [state])
  if (!state) return null
  return (
    <div className="dn-modal-backdrop">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="dn-link-title"
        className="dn-modal"
        onSubmit={(e) => {
          e.preventDefault()
          answer(url.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') answer(null)
        }}
      >
        <h2 id="dn-link-title">{t('linkDialogTitle')}</h2>
        <label className="dn-compare-pick">
          {t('linkUrlLabel')}
          <input ref={input} type="text" className="dn-text-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <p className="dn-help-note">{t('linkUrlHint')}</p>
        <div className="dn-modal-actions">
          <button type="submit">{t('confirm')}</button>
          <button type="button" onClick={() => answer(null)}>
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ForkCloseDialog(): React.ReactElement | null {
  const state = useDialogs((s) => s.forkClose)
  const answer = useDialogs((s) => s.answerForkClose)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (state) first.current?.focus()
  }, [state])
  if (!state) return null
  return (
    <div className="dn-modal-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dn-fork-title"
        className="dn-modal"
        onKeyDown={(e) => {
          if (e.key === 'Escape') answer('cancel')
        }}
      >
        <h2 id="dn-fork-title">{t('forkCloseTitle', { name: state.name })}</h2>
        <p>{t('forkCloseBody')}</p>
        <div className="dn-modal-actions dn-modal-actions-wrap">
          <button ref={first} onClick={() => answer('saveAs')}>
            {t('forkSaveAs')}
          </button>
          {state.canReplace && (
            <button className="dn-danger" onClick={() => answer('replace')}>
              {t('forkReplace')}
            </button>
          )}
          <button onClick={() => answer('discard')}>{t('discard')}</button>
          <button onClick={() => answer('cancel')}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog(): React.ReactElement | null {
  const state = useDialogs((s) => s.confirm)
  const answer = useDialogs((s) => s.answerConfirm)
  const okBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (state) okBtn.current?.focus()
  }, [state])
  if (!state) return null
  return (
    <div className="dn-modal-backdrop">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dn-confirm-title"
        className="dn-modal"
        onKeyDown={(e) => {
          if (e.key === 'Escape') answer(false)
        }}
      >
        <h2 id="dn-confirm-title">{state.title}</h2>
        {state.body && <p>{state.body}</p>}
        <div className="dn-modal-actions">
          <button ref={okBtn} onClick={() => answer(true)}>
            {state.okLabel}
          </button>
          <button onClick={() => answer(false)}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}

export function CompareDialog(): React.ReactElement | null {
  const open = useDialogs((s) => s.compareOpen)
  const setOpen = useDialogs((s) => s.setCompareOpen)
  const docs = useDocuments((s) => s.docs)
  const list = Object.values(docs)
  // Select a primitive: a selector that builds a new object every call would re-render forever.
  const activeDoc = useLayout((s) => {
    const a = s.getActiveTab()
    return a?.tab.kind === 'doc' ? a.tab.docId : undefined
  })
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const firstSelect = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!open) return
    firstSelect.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (!open) return
    const l = activeDoc && docs[activeDoc] ? activeDoc : list[0]?.id ?? ''
    setLeft(l)
    setRight(list.find((d) => d.id !== l)?.id ?? '')
    // Re-seed only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  const valid = left !== '' && right !== '' && left !== right
  const select = (label: string, value: string, set: (v: string) => void, ref?: React.Ref<HTMLSelectElement>): React.ReactElement => (
    <label className="dn-compare-pick">
      {label}
      <select ref={ref} value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
        {list.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="dn-modal-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dn-compare-title"
        className="dn-modal"
      >
        <h2 id="dn-compare-title">{t('compareTitle')}</h2>
        {select(t('compareLeft'), left, setLeft, firstSelect)}
        {select(t('compareRight'), right, setRight)}
        {!valid && <p role="note">{t('compareNeedsTwo')}</p>}
        <div className="dn-modal-actions">
          <button
            disabled={!valid}
            onClick={() => {
              if (getCommands().compareDocs(left, right)) setOpen(false)
            }}
          >
            {t('compareStart')}
          </button>
          <button onClick={() => setOpen(false)}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  )
}

export function Toasts(): React.ReactElement {
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="dn-toasts" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} role="status" className={`dn-toast dn-toast-${i.kind}`} data-testid="toast" onClick={() => dismiss(i.id)}>
          {i.message}
        </div>
      ))}
    </div>
  )
}
