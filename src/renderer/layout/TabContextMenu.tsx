import type React from 'react'
import { useEffect, useRef } from 'react'
import { getCommands } from '../app/appCommands'
import { t } from '../app/i18n'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { findLeaf } from './tree'

export interface MenuAnchor {
  x: number
  y: number
  leafId: string
  index: number
}

interface Item {
  id: string
  label: string
  danger?: boolean
  run(): void
}

const MENU_WIDTH = 200
const ITEM_HEIGHT = 34

/** Right-click menu of a tab: works on the tab that was clicked, whichever pane it is in. */
export function TabContextMenu({ anchor, onClose }: { anchor: MenuAnchor; onClose(): void }): React.ReactElement | null {
  const tab = useLayout((s) => findLeaf(s.root, anchor.leafId)?.tabs[anchor.index])
  const doc = useDocuments((s) => (tab?.kind === 'doc' ? s.docs[tab.docId] : undefined))
  const ref = useRef<HTMLDivElement>(null)

  const items: Item[] = []
  if (tab?.kind === 'doc') {
    const docId = tab.docId
    items.push({ id: 'saveAs', label: t('saveAs'), run: () => void getCommands().saveDoc(docId, true) })
    if (doc?.fork && doc.path !== null && doc.warning !== 'notUtf8') {
      items.push({ id: 'replace', label: t('forkReplace'), danger: true, run: () => void getCommands().replaceAndClose(anchor.leafId, anchor.index) })
    }
  }
  items.push({ id: 'close', label: t('close'), run: () => void getCommands().closeTab(anchor.leafId, anchor.index) })

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

  if (!tab) return null
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - items.length * ITEM_HEIGHT - 16))

  const move = (delta: number): void => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(at + delta + buttons.length) % buttons.length]?.focus()
  }

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="tab-menu"
      className="dn-menu"
      style={{ left, top, width: MENU_WIDTH }}
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
