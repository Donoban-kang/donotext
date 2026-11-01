import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

const EDGE = 10

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

  // When there are more tabs than fit, arrows at both ends move the row so every tab can be reached.
  const scroller = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const updateArrows = (): void => {
    const el = scroller.current
    if (!el) return
    // The row has 8px of padding at each end, so "at the end" means within that padding.
    setCanLeft(el.scrollLeft > EDGE)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE)
  }
  useLayoutEffect(updateArrows) // after every render: tab names and counts change the row's width
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(updateArrows)
    observer.observe(el)
    // The mouse wheel moves a long row sideways (a plain wheel only scrolls up and down otherwise).
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The tab you just opened or selected must be visible, even when it sits past the edge.
  useEffect(() => {
    scroller.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [leaf.active, leaf.tabs.length, leaf.id])
  const scrollBy = (dir: -1 | 1): void => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: 'smooth' })
  }
  const overflowing = canLeft || canRight

  // A tab that disappears under the mouse (closed, moved) never reports "mouse left"; drop its hover card here.
  useEffect(() => {
    cancel()
    setStats(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaf.tabs])
  return (
    <div className="dn-tabbar-wrap">
      {overflowing && (
        <button className="dn-tab-scroll" aria-label={t('tabsScrollLeft')} disabled={!canLeft} onClick={() => scrollBy(-1)}>
          <Icon name="triLeft" />
        </button>
      )}
      <div ref={scroller} className="dn-tabbar" role="tablist" onScroll={() => {
        hide()
        updateArrows()
      }}>
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
      {overflowing && (
        <button className="dn-tab-scroll" aria-label={t('tabsScrollRight')} disabled={!canRight} onClick={() => scrollBy(1)}>
          <Icon name="triRight" />
        </button>
      )}
    </div>
  )
}
