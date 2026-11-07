import type React from 'react'
import { useEffect } from 'react'
import { ScrollLinkController } from '../layout/ScrollLinkController'
import { SplitView } from '../layout/SplitView'
import { allLeaves } from '../layout/tree'
import { Sidebar } from '../sidebar/Sidebar'
import { useDocuments } from '../store/documents'
import { useWorkspace } from '../store/workspace'
import { useLayout } from '../store/layoutStore'
import { getCommands } from './appCommands'
import { t } from './i18n'
import { useDialogs } from '../store/ui'
import { DropZone } from './DropZone'
import { FormatMenu } from './FormatMenu'
import { HelpDialog } from './HelpDialog'
import { SettingsController } from './SettingsController'
import { SettingsDialog } from './SettingsDialog'
import { CompareDialog, ConfirmDialog, ConfirmUnsavedDialog, ForkCloseDialog, LinkDialog, Toasts } from './Overlays'
import { Icon } from './icons'
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
      else if (e.key === ',') run(() => useDialogs.getState().setSettingsOpen(true))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const leafCount = useLayout((s) => allLeaves(s.root).length)
  const linked = useLayout((s) => s.scrollLink !== null)
  const docCount = useDocuments((s) => Object.keys(s.docs).length)
  const setCompareOpen = useDialogs((s) => s.setCompareOpen)
  const recent = useWorkspace((s) => s.recent)
  const c = getCommands()
  return (
    <div className="dn-app" data-testid="workspace">
      <header className="dn-toolbar">
        <h1>{t('appName')}</h1>
        <button className="dn-btn" title={t('open')} onClick={() => void c.openFile()}>
          <Icon name="folder" />
          <span className="dn-lbl">{t('open')}</span>
        </button>
        <button className="dn-btn" title={t('importDocTitle')} data-testid="import-doc" onClick={() => void c.importDocument()}>
          <Icon name="download" />
          <span className="dn-lbl">{t('importDoc')}</span>
        </button>
        <button className="dn-btn" title={t('newDoc')} onClick={() => c.newUntitled()}>
          <Icon name="plus" />
          <span className="dn-lbl">{t('newDoc')}</span>
        </button>
        <button className="dn-btn dn-btn-primary" title={t('save')} onClick={() => void c.saveActive()}>
          <Icon name="save" />
          <span className="dn-lbl">{t('save')}</span>
        </button>
        <button className="dn-btn" title={t('saveAs')} onClick={() => void c.saveAsActive()}>
          <Icon name="saveAs" />
          <span className="dn-lbl">{t('saveAs')}</span>
        </button>
        <FormatMenu disabled={!activeView} />
        <span className="dn-toolbar-sep" />
        <button className="dn-btn" title={t('splitRight')} onClick={() => c.splitActive('row')}>
          <Icon name="splitRight" />
          <span className="dn-lbl">{t('splitRight')}</span>
        </button>
        <button className="dn-btn" title={t('splitDown')} onClick={() => c.splitActive('col')}>
          <Icon name="splitDown" />
          <span className="dn-lbl">{t('splitDown')}</span>
        </button>
        <button className="dn-btn" title={t('closePane')} disabled={leafCount < 2} onClick={() => void c.closePane()}>
          <Icon name="closePane" />
          <span className="dn-lbl">{t('closePane')}</span>
        </button>
        <button
          className="dn-btn"
          title={t('scrollLinkOn')}
          disabled={leafCount < 2}
          aria-pressed={linked}
          onClick={() => c.toggleScrollLink()}
        >
          <Icon name="link" />
          <span className="dn-lbl">{t('scrollLinkOn')}</span>
        </button>
        <button className="dn-btn" title={t('compare')} disabled={docCount < 2} onClick={() => setCompareOpen(true)}>
          <Icon name="compare" />
          <span className="dn-lbl">{t('compare')}</span>
        </button>
        <span className="dn-toolbar-sep" />
        <button className="dn-btn" title={t('exportHtml')} disabled={!canToggle} onClick={() => void c.exportActive('html')}>
          <Icon name="html" />
          <span className="dn-lbl">{t('exportHtml')}</span>
        </button>
        <button className="dn-btn" title={t('exportPdf')} disabled={!canToggle} onClick={() => void c.exportActive('pdf')}>
          <Icon name="pdf" />
          <span className="dn-lbl">{t('exportPdf')}</span>
        </button>
        <span className="dn-grow" />
        <button className="dn-chip dn-chip-mode" disabled={!activeView || !canToggle} onClick={() => c.toggleView()}>
          {/* Both labels are laid out (one hidden) so the button keeps the same width in either mode and nothing next to it moves. */}
          <span className="dn-chip-sizer" aria-hidden="true">
            <span>{t('sourceMode')}</span>
            <span>{t('wysiwygMode')}</span>
          </span>
          <span className="dn-chip-text">{activeView === 'source' ? t('wysiwygMode') : t('sourceMode')}</span>
        </button>
        <select
          className="dn-select"
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
      </header>
      <div className="dn-body">
        <Sidebar />
        <main className="dn-main">
          <SplitView node={root} />
        </main>
      </div>
      <DropZone />
      <ThemeController />
      <SettingsController />
      <ScrollLinkController />
      <ConfirmUnsavedDialog />
      <ConfirmDialog />
      <ForkCloseDialog />
      <LinkDialog />
      <CompareDialog />
      <HelpDialog />
      <SettingsDialog />
      <Toasts />
    </div>
  )
}
