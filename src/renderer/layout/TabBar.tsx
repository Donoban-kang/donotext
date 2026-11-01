import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../app/i18n'
import { getCommands } from '../app/appCommands'
import { Icon } from '../app/icons'
import { useDocuments, type Doc } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { hasCopies } from '../editor/editRouter'
import { TabContextMenu, type MenuAnchor } from './TabContextMenu'
import { TabStats, type StatsAnchor } from './TabStats'
import type { Leaf, Tab } from './tree'

export const TAB_DRAG_TYPE = 'application/x-donotext-tab'

function TabLabel({ tab }: { tab: Tab }): React.ReactElement {
  const docs = useDocuments((s) => s.docs)
  const dirty = useDocuments((s) => s.isDirty)
  if (tab.kind === 'doc') {
    const d = docs[tab.docId]
    const original = d !== undefined && hasCopies(docs, d)
    return (
      <>
        <span className="dn-tab-name">{d?.name ?? '?'}</span>
        {d?.fork && <span className="dn-tab-badge dn-tab-badge-fork">{t('forkBadge')}</span>}
        {original && <span className="dn-tab-badge">{t('originalBadge')}</span>}
        {d && dirty(d.id) && (
          <span data-testid="tab-dirty" className="dn-tab-dirty" role="img" aria-label={t('dirtyMark')} title={t('dirtyMark')} />
        )}
      </>
    )
  }
  const l = docs[tab.leftDocId]
  const r = docs[tab.rightDocId]
  return <span className="dn-tab-name">{`${l?.name ?? '?'} ↔ ${r?.name ?? '?'}`}</span>
}

/** Edited copies get their own colour once they differ from the saved file, so they are easy to tell apart. */
function tabStateClass(tab: Tab, docs: Record<string, Doc>): string {
  if (tab.kind !== 'doc') return ''
  const d = docs[tab.docId]
  if (!d?.fork) return ''
  return d.text !== d.baseline && d.text !== d.baselineNormalized ? ' fork modified' : ' fork'
}

export function TabBar({ leaf }: { leaf: Leaf }): React.ReactElement {
  const activate = useLayout((s) => s.activateTab)
  const docs = useDocuments((s) => s.docs)
  const [stats, setStats] = useState<StatsAnchor | null>(null)
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const hide = (): void => {
    cancel()
    setStats(null)
  }
  useEffect(() => cancel, [])
  // A tab that disappears under the mouse (closed, moved) never reports "mouse left"; drop its hover card here.
  useEffect(() => {
    cancel()
    setStats(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaf.tabs])
  return (
    <div className="dn-tabbar" role="tablist" onScroll={hide}>
      {leaf.tabs.map((tab, i) => (
        <div
          key={tab.kind === 'doc' ? tab.docId : `${tab.leftDocId}:${tab.rightDocId}`}
          role="tab"
          data-testid="tab"
          aria-selected={i === leaf.active}
          data-tab-index={i}
          draggable
          onMouseEnter={(e) => {
            if (tab.kind !== 'doc') return
            const rect = e.currentTarget.getBoundingClientRect()
            const next: StatsAnchor = { docId: tab.docId, left: rect.left, top: rect.bottom + 6 }
            cancel()
            timer.current = setTimeout(() => setStats(next), 350)
          }}
          onMouseLeave={hide}
          onContextMenu={(e) => {
            e.preventDefault()
            hide()
            activate(leaf.id, i) // the menu acts on the tab that was clicked, which then becomes the active one
            setMenu({ x: e.clientX, y: e.clientY, leafId: leaf.id, index: i })
          }}
          onDragStart={(e) => {
            hide()
            e.dataTransfer.setData(TAB_DRAG_TYPE, JSON.stringify({ leafId: leaf.id, index: i }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          className={'dn-tab' + (i === leaf.active ? ' active' : '') + tabStateClass(tab, docs)}
          onMouseDown={(e) => {
            hide()
            if (e.button === 1) {
              e.preventDefault()
              void getCommands().closeTab(leaf.id, i)
            } else if (e.button === 0) {
              activate(leaf.id, i)
            }
          }}
        >
          <TabLabel tab={tab} />
          <button
            className="dn-tab-close"
            aria-label={t('closeTab')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              hide()
              void getCommands().closeTab(leaf.id, i)
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
      {stats && <TabStats anchor={stats} />}
      {menu && <TabContextMenu anchor={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
