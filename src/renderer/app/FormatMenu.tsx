import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { FORMATS, runFormat, shortcutLabel, type FormatId } from '../editor/format'
import { Icon } from './icons'
import { t } from './i18n'

/** Toolbar button that opens the 서식 (format) menu for the active editor. */
export function FormatMenu({ disabled }: { disabled: boolean }): React.ReactElement {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const close = (): void => setPos(null)

  useEffect(() => {
    if (!pos) return
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const away = (e: Event): void => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close()
    }
    window.addEventListener('mousedown', away, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', away, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  const move = (delta: number): void => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(at + delta + items.length) % items.length]?.focus()
  }

  const choose = (id: FormatId): void => {
    close()
    runFormat(id)
  }

  return (
    <>
      <button
        ref={button}
        className="dn-btn dn-btn-text"
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        disabled={disabled}
        onClick={() => {
          if (pos) return close()
          const r = button.current!.getBoundingClientRect()
          setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), top: r.bottom + 6 })
        }}
      >
        <span>{t('formatMenu')}</span>
        <span className="dn-caret" aria-hidden="true">
          <Icon name="chevron" />
        </span>
      </button>
      {pos && (
        <div
          ref={menu}
          role="menu"
          aria-label={t('formatMenu')}
          data-testid="format-menu"
          className="dn-menu dn-format-menu"
          style={{ left: pos.left, top: pos.top }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
              button.current?.focus()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            }
          }}
        >
          {FORMATS.map((f, i) => (
            <div key={f.id} role="none">
              {i > 0 && FORMATS[i - 1].group !== f.group && <div className="dn-menu-sep" role="separator" />}
              <button role="menuitem" className="dn-menu-item dn-format-item" onClick={() => choose(f.id)}>
                <span>{t(f.label)}</span>
                {f.shortcut && <kbd>{shortcutLabel(f.shortcut)}</kbd>}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
