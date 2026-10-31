import type React from 'react'
import { t } from '../app/i18n'
import { getCommands } from '../app/appCommands'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import type { Leaf, Tab } from './tree'

function TabLabel({ tab }: { tab: Tab }): React.ReactElement {
  const docs = useDocuments((s) => s.docs)
  const dirty = useDocuments((s) => s.isDirty)
  if (tab.kind === 'doc') {
    const d = docs[tab.docId]
    return (
      <>
        <span className="dn-tab-name">{d?.name ?? '?'}</span>
        {d && dirty(d.id) && (
          <span data-testid="tab-dirty" className="dn-tab-dirty" title={t('dirtyMark')}>
            ●
          </span>
        )}
      </>
    )
  }
  const l = docs[tab.leftDocId]
  const r = docs[tab.rightDocId]
  return <span className="dn-tab-name">{`${l?.name ?? '?'} ↔ ${r?.name ?? '?'}`}</span>
}

export function TabBar({ leaf }: { leaf: Leaf }): React.ReactElement {
  const activate = useLayout((s) => s.activateTab)
  return (
    <div className="dn-tabbar" role="tablist">
      {leaf.tabs.map((tab, i) => (
        <div
          key={tab.kind === 'doc' ? tab.docId : `${tab.leftDocId}:${tab.rightDocId}`}
          role="tab"
          data-testid="tab"
          aria-selected={i === leaf.active}
          className={'dn-tab' + (i === leaf.active ? ' active' : '')}
          onMouseDown={(e) => {
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
            onClick={() => void getCommands().closeTab(leaf.id, i)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
