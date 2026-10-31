import type React from 'react'
import { useEffect } from 'react'
import { ScrollLinkController } from '../layout/ScrollLinkController'
import { SplitView } from '../layout/SplitView'
import { allLeaves } from '../layout/tree'
import { Sidebar } from '../sidebar/Sidebar'
import { useDocuments } from '../store/documents'
import { useSettings } from '../store/settings'
import { useWorkspace } from '../store/workspace'
import { useLayout } from '../store/layoutStore'
import { getCommands } from './appCommands'
import { t } from './i18n'
import { useDialogs } from '../store/ui'
import { CompareDialog, ConfirmDialog, ConfirmUnsavedDialog, Toasts } from './Overlays'
import { ThemeController } from './ThemeController'
import './app.css'
import './theme.css'

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
      if (!(e.ctrlKey || e.metaKey)) return
      const c = getCommands()
      const key = e.key.toLowerCase()
      const run = (fn: () => unknown): void => {
        e.preventDefault()
        void fn()
      }
      if (e.altKey) {
        if (e.key === 'ArrowRight') run(() => c.focusPane(1))
        else if (e.key === 'ArrowLeft') run(() => c.focusPane(-1))
        else if (key === 'w') run(c.closePane)
        return
      }
      if (e.key === '\\' || e.key === '|') return run(() => c.splitActive(e.shiftKey ? 'col' : 'row'))
      if (key === 'o') run(c.openFile)
      else if (key === 's') run(e.shiftKey ? c.saveAsActive : c.saveActive)
      else if (key === 'n') run(c.newUntitled)
      else if (key === 'w') run(c.closeActiveTab)
      else if (key === '/') run(c.toggleView)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const leafCount = useLayout((s) => allLeaves(s.root).length)
  const linked = useLayout((s) => s.scrollLink !== null)
  const docCount = useDocuments((s) => Object.keys(s.docs).length)
  const setCompareOpen = useDialogs((s) => s.setCompareOpen)
  const theme = useSettings((s) => s.theme)
  const setTheme = useSettings((s) => s.setTheme)
  const autoSave = useSettings((s) => s.autoSave)
  const setAutoSave = useSettings((s) => s.setAutoSave)
  const focusMode = useSettings((s) => s.focusMode)
  const setFocusMode = useSettings((s) => s.setFocusMode)
  const typewriterMode = useSettings((s) => s.typewriterMode)
  const setTypewriterMode = useSettings((s) => s.setTypewriterMode)
  const recent = useWorkspace((s) => s.recent)
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
        <span className="dn-toolbar-sep" />
        <button onClick={() => c.splitActive('row')}>{t('splitRight')}</button>
        <button onClick={() => c.splitActive('col')}>{t('splitDown')}</button>
        <button disabled={leafCount < 2} onClick={() => void c.closePane()}>
          {t('closePane')}
        </button>
        <button disabled={leafCount < 2} aria-pressed={linked} onClick={() => c.toggleScrollLink()}>
          {t('scrollLinkOn')}
        </button>
        <button disabled={!canToggle} onClick={() => void c.exportActive('html')}>
          {t('exportHtml')}
        </button>
        <button disabled={!canToggle} onClick={() => void c.exportActive('pdf')}>
          {t('exportPdf')}
        </button>
        <button disabled={docCount < 2} onClick={() => setCompareOpen(true)}>
          {t('compare')}
        </button>
        <span className="dn-toolbar-sep" />
        <select
          aria-label={t('recentFiles')}
          value=""
          disabled={recent.length === 0}
          onChange={(e) => e.target.value && void c.openPath(e.target.value)}
        >
          <option value="">{t('recentFiles')}</option>
          {recent.map((p) => (
            <option key={p} value={p} title={p}>
              {p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)}
            </option>
          ))}
        </select>
        <label className="dn-toolbar-check">
          {t('theme')}{' '}
          <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')} aria-label={t('theme')}>
            <option value="system">{t('themeSystem')}</option>
            <option value="light">{t('themeLight')}</option>
            <option value="dark">{t('themeDark')}</option>
          </select>
        </label>
        <label className="dn-toolbar-check">
          <input type="checkbox" checked={focusMode} onChange={(e) => setFocusMode(e.target.checked)} /> {t('focusMode')}
        </label>
        <label className="dn-toolbar-check">
          <input type="checkbox" checked={typewriterMode} onChange={(e) => setTypewriterMode(e.target.checked)} /> {t('typewriterMode')}
        </label>
        <label className="dn-toolbar-check">
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} /> {t('autoSave')}
        </label>
      </header>
      <div className="dn-body">
        <Sidebar />
        <main className="dn-main">
          <SplitView node={root} />
        </main>
      </div>
      <ThemeController />
      <ScrollLinkController />
      <ConfirmUnsavedDialog />
      <ConfirmDialog />
      <CompareDialog />
      <Toasts />
    </div>
  )
}
