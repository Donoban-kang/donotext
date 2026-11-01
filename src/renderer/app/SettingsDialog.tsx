import type React from 'react'
import { useEffect, useId, useRef } from 'react'
import { AUTO_SAVE_DELAY, FONT_SIZE, LINE_HEIGHT, useSettings, type EditorWidth, type FontFamily } from '../store/settings'
import { useDialogs } from '../store/ui'
import type { Theme } from './theme'
import { t, type MessageKey } from './i18n'

function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }): React.ReactElement {
  const id = useId()
  return (
    <div className="dn-set-row">
      <div className="dn-set-text">
        <label htmlFor={id}>{label}</label>
        {hint && <p id={`${id}-hint`}>{hint}</p>}
      </div>
      <input id={id} type="checkbox" className="dn-switch" checked={checked} disabled={disabled} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.checked)} />
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: (id: string) => React.ReactNode }): React.ReactElement {
  const id = useId()
  return (
    <div className="dn-set-row">
      <div className="dn-set-text">
        <label htmlFor={id}>{label}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="dn-set-control">{children(id)}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="dn-set-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

const WIDTHS: Array<[EditorWidth, MessageKey]> = [
  ['narrow', 'widthNarrow'],
  ['wide', 'widthWide'],
  ['full', 'widthFull']
]

/** The 설정 window: every change applies at once and is remembered for the next start. */
export function SettingsDialog(): React.ReactElement | null {
  const open = useDialogs((s) => s.settingsOpen)
  const setOpen = useDialogs((s) => s.setSettingsOpen)
  const s = useSettings()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus the window itself (not the Close button at the bottom, which would scroll the content away from the top).
    dialogRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null
  return (
    <div className="dn-modal-backdrop">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dn-settings-title" className="dn-modal dn-settings">
        <h2 id="dn-settings-title">{t('settingsTitle')}</h2>

        <Section title={t('settingsScreen')}>
          <Row label={t('theme')}>
            {(id) => (
              <select id={id} className="dn-select" value={s.theme} onChange={(e) => s.setTheme(e.target.value as Theme)}>
                <option value="system">{t('themeSystem')}</option>
                <option value="light">{t('themeLight')}</option>
                <option value="dark">{t('themeDark')}</option>
              </select>
            )}
          </Row>
          <div className="dn-set-row">
            <div className="dn-set-text">
              <span id="dn-width-label" className="dn-set-label">
                {t('editorWidth')}
              </span>
            </div>
            <div className="dn-seg" role="radiogroup" aria-labelledby="dn-width-label">
              {WIDTHS.map(([value, key]) => (
                <button key={value} type="button" role="radio" aria-checked={s.editorWidth === value} onClick={() => s.setEditorWidth(value)}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title={t('settingsFont')}>
          <Row label={t('fontFamily')}>
            {(id) => (
              <select id={id} className="dn-select" value={s.fontFamily} onChange={(e) => s.setFontFamily(e.target.value as FontFamily)}>
                <option value="default">{t('fontDefault')}</option>
                <option value="serif">{t('fontSerif')}</option>
                <option value="mono">{t('fontMono')}</option>
                <option value="custom">{t('fontCustom')}</option>
              </select>
            )}
          </Row>
          {s.fontFamily === 'custom' && (
            <Row label={t('customFontName')} hint={t('customFontHint')}>
              {(id) => <input id={id} type="text" className="dn-text-input" value={s.customFont} placeholder="D2Coding" onChange={(e) => s.setCustomFont(e.target.value)} />}
            </Row>
          )}
          <Row label={t('fontSize')}>
            {(id) => (
              <>
                <input id={id} type="range" min={FONT_SIZE.min} max={FONT_SIZE.max} step={1} value={s.fontSize} onChange={(e) => s.setFontSize(Number(e.target.value))} />
                <output htmlFor={id}>{s.fontSize}px</output>
              </>
            )}
          </Row>
          <Row label={t('lineHeight')}>
            {(id) => (
              <>
                <input id={id} type="range" min={LINE_HEIGHT.min} max={LINE_HEIGHT.max} step={0.05} value={s.lineHeight} onChange={(e) => s.setLineHeight(Number(e.target.value))} />
                <output htmlFor={id}>{s.lineHeight.toFixed(2)}</output>
              </>
            )}
          </Row>
          <p className="dn-set-preview" data-testid="font-preview">
            {t('fontPreview')}
          </p>
        </Section>

        <Section title={t('settingsWriting')}>
          <Switch label={t('wordWrap')} hint={t('wordWrapHint')} checked={s.wordWrap} onChange={s.setWordWrap} />
          <Switch label={t('spellcheck')} hint={t('spellcheckHint')} checked={s.spellcheck} onChange={s.setSpellcheck} />
          <Switch label={t('focusMode')} checked={s.focusMode} onChange={s.setFocusMode} />
          <Switch label={t('typewriterMode')} checked={s.typewriterMode} onChange={s.setTypewriterMode} />
        </Section>

        <Section title={t('settingsSaving')}>
          <Switch label={t('autoSave')} hint={t('autoSaveHint')} checked={s.autoSave} onChange={s.setAutoSave} />
          <Row label={t('autoSaveDelay')}>
            {(id) => (
              <>
                <input id={id} type="range" min={AUTO_SAVE_DELAY.min} max={AUTO_SAVE_DELAY.max} step={0.5} value={s.autoSaveDelay} disabled={!s.autoSave} onChange={(e) => s.setAutoSaveDelay(Number(e.target.value))} />
                <output htmlFor={id}>
                  {s.autoSaveDelay}
                  {t('secondsUnit')}
                </output>
              </>
            )}
          </Row>
          <Switch label={t('restoreOnStart')} hint={t('restoreOnStartHint')} checked={s.restoreOnStart} onChange={s.setRestoreOnStart} />
        </Section>

        <Section title={t('settingsSplit')}>
          <Switch label={t('splitSync')} hint={t('splitSyncHint')} checked={s.splitSync} onChange={s.setSplitSync} />
        </Section>

        <div className="dn-modal-actions dn-set-actions">
          <button type="button" className="dn-set-reset" onClick={s.resetSettings}>
            {t('resetSettings')}
          </button>
          <span className="dn-grow" />
          <button type="button" onClick={() => setOpen(false)}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
