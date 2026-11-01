import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { AppInfo, UpdateResult } from '../../shared/appInfo'
import { useDialogs, useToasts } from '../store/ui'
import { t } from './i18n'

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl+O', t('open')],
  ['Ctrl+N', t('newDoc')],
  ['Ctrl+S', t('save')],
  ['Ctrl+Shift+S', t('saveAs')],
  ['Ctrl+W', t('closeTab')],
  ['Ctrl+/', t('helpToggleView')],
  ['Ctrl+,', t('settings')],
  ['Ctrl+\\', t('splitRight')],
  ['Ctrl+Shift+\\', t('splitDown')],
  ['Ctrl+Alt+←', t('helpPrevPane')],
  ['Ctrl+Alt+→', t('helpNextPane')],
  ['Ctrl+Alt+W', t('closePane')]
]

type UpdateView = null | 'checking' | UpdateResult

function updateMessage(u: Exclude<UpdateView, null | 'checking'>): string {
  if (u.status === 'latest') return t('helpUpToDate', { version: u.current })
  if (u.status === 'available') return t('helpNewVersion', { latest: u.latest, current: u.current })
  if (u.reason === 'network') return t('helpErrNetwork')
  if (u.reason === 'http') return t('helpErrHttp')
  if (u.reason === 'notFound') return t('helpErrNotFound')
  return t('helpErrBad')
}

export function HelpDialog(): React.ReactElement | null {
  const open = useDialogs((s) => s.helpOpen)
  const setOpen = useDialogs((s) => s.setHelpOpen)
  const push = useToasts((s) => s.push)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateView>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setUpdate(null)
    closeBtn.current?.focus()
    void window.api.getAppInfo().then(setInfo, () => setInfo(null))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const openLink = (url: string): void => {
    window.api.openExternal(url).catch((e: unknown) => push({ kind: 'error', message: t('helpOpenFailed', { reason: e instanceof Error ? e.message : String(e) }) }))
  }
  const check = (): void => {
    setUpdate('checking')
    window.api.checkForUpdate().then(setUpdate, () => setUpdate({ status: 'error', current: info?.version ?? '', reason: 'network' }))
  }

  return (
    <div className="dn-modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="dn-help-title" className="dn-modal dn-help">
        <h2 id="dn-help-title">{t('help')}</h2>

        <section className="dn-help-section">
          <h3>{t('helpAbout')}</h3>
          <dl className="dn-help-list">
            <dt>{t('appName')}</dt>
            <dd>
              {t('helpVersion')} <span data-testid="help-version">{info ? `v${info.version}` : '…'}</span>
            </dd>
            <dt>{t('helpAuthor')}</dt>
            <dd data-testid="help-author">{info ? t('helpAuthorName') : '…'}</dd>
            <dt>{t('helpProject')}</dt>
            <dd>
              <button className="dn-link" disabled={!info} onClick={() => info && openLink(info.repoUrl)}>
                {t('helpOpenProject')}
              </button>
            </dd>
          </dl>
        </section>

        <section className="dn-help-section">
          <h3>{t('helpUpdate')}</h3>
          <div className="dn-help-update">
            <button disabled={update === 'checking'} onClick={check}>
              {t('helpCheckUpdate')}
            </button>
            {update === 'checking' && <span role="status">{t('helpChecking')}</span>}
            {update !== null && update !== 'checking' && (
              <span role="status" data-testid="update-result" className={update.status === 'error' ? 'dn-help-error' : undefined}>
                {updateMessage(update)}
              </span>
            )}
            {update !== null && update !== 'checking' && update.status === 'error' && info && (
              <button onClick={() => openLink(info.releasesUrl)}>{t('helpOpenReleases')}</button>
            )}
            {update !== null && update !== 'checking' && update.status === 'available' && (
              <button className="dn-help-primary" onClick={() => openLink(update.url)}>
                {t('helpDownload')}
              </button>
            )}
          </div>
          <p className="dn-help-note">{t('helpPrivacy')}</p>
        </section>

        <section className="dn-help-section">
          <h3>{t('helpShortcuts')}</h3>
          <ul className="dn-help-keys">
            {SHORTCUTS.map(([keys, label]) => (
              <li key={keys}>
                <kbd>{keys}</kbd>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="dn-help-note">{t('helpMacNote')}</p>
        </section>

        <div className="dn-modal-actions">
          <button ref={closeBtn} onClick={() => setOpen(false)}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
