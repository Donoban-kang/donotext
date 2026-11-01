import type React from 'react'
import { useEffect, useRef } from 'react'
import type { DirEntry } from '../../shared/fsTypes'
import { t } from '../app/i18n'

export interface TreeMenuAnchor {
  x: number
  y: number
  entry: DirEntry
}

interface Props {
  anchor: TreeMenuAnchor
  hidden: boolean
  onClose(): void
  onRename(): void
  onToggleHidden(): void
  onTrash(): void
}

const WIDTH = 220
const ITEM = 34

/** Right-click menu of a file or folder in the tree. "휴지통으로 이동" lives here, away from the one-click icons. */
export function TreeContextMenu({ anchor, hidden, onClose, onRename, onToggleHidden, onTrash }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const away = (e: Event): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const close = (): void => onClose()
    window.addEventListener('mousedown', away, true)
    window.addEventListener('contextmenu', away, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', away, true)
      window.removeEventListener('contextmenu', away, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [onClose])

  const items: Array<{ id: string; label: string; danger?: boolean; run(): void }> = [
    { id: 'rename', label: t('rename'), run: onRename },
    { id: 'hide', label: hidden ? t('unhideEntry') : t('hideEntry'), run: onToggleHidden },
    { id: 'trash', label: t('moveToTrash'), danger: true, run: onTrash }
  ]
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - WIDTH - 8))
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - items.length * ITEM - 16))
  const move = (delta: number): void => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(at + delta + buttons.length) % buttons.length]?.focus()
  }

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="tree-menu"
      aria-label={anchor.entry.name}
      className="dn-menu"
      style={{ left, top, width: WIDTH }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          onClose()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          className={'dn-menu-item' + (item.danger ? ' dn-menu-danger' : '')}
          onClick={() => {
            onClose()
            item.run()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
