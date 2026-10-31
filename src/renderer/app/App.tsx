import type React from 'react'
import { useEffect } from 'react'
import { SplitView } from '../layout/SplitView'
import { Sidebar } from '../sidebar/Sidebar'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { getCommands } from './appCommands'
import { t } from './i18n'
import { ConfirmDialog, ConfirmUnsavedDialog, Toasts } from './Overlays'
import './app.css'

export function App(): React.ReactElement {
  const root = useLayout((s) => s.root)
  const activeView = useLayout((s) => {
    const a = s.getActiveTab()
    return a && a.tab.kind === 'doc' ? a.tab.view : null
  })
  const canToggle = useLayout((s) => {
    const a = s.getActiveTab()
    return a?.tab.kind === 'doc' && !useDocuments.getState().docs[a.tab.docId]?.sourceOnly
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const c = getCommands()
      const key = e.key.toLowerCase()
      const run = (fn: () => unknown): void => {
        e.preventDefault()
        void fn()
      }
      if (key === 'o') run(c.openFile)
      else if (key === 's') run(e.shiftKey ? c.saveAsActive : c.saveActive)
      else if (key === 'n') run(c.newUntitled)
      else if (key === 'w') run(c.closeActiveTab)
      else if (key === '/') run(c.toggleView)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const c = getCommands()
  return (
    <div className="dn-app" data-testid="workspace">
      <header className="dn-toolbar">
        <h1>{t('appName')}</h1>
        <button onClick={() => void c.openFile()}>{t('open')}</button>
        <button onClick={() => c.newUntitled()}>{t('newDoc')}</button>
        <button onClick={() => void c.saveActive()}>{t('save')}</button>
        <button onClick={() => void c.saveAsActive()}>{t('saveAs')}</button>
        <button disabled={!activeView || !canToggle} onClick={() => c.toggleView()}>
          {activeView === 'source' ? t('wysiwygMode') : t('sourceMode')}
        </button>
      </header>
      <div className="dn-body">
        <Sidebar />
        <main className="dn-main">
          <SplitView node={root} />
        </main>
      </div>
      <ConfirmUnsavedDialog />
      <ConfirmDialog />
      <Toasts />
    </div>
  )
}
