import type React from 'react'
import { useEffect, useRef } from 'react'
import { useDialogs, useToasts } from '../store/ui'
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
