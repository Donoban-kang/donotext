import type React from 'react'
import { getCommands } from '../app/appCommands'
import { t } from '../app/i18n'
import { SourceEditor } from '../editor/SourceEditor'
import { WysiwygEditor } from '../editor/WysiwygEditor'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { TabBar, TAB_DRAG_TYPE } from './TabBar'
import type { Leaf } from './tree'

function PaneBody({ leaf }: { leaf: Leaf }): React.ReactElement {
  const tab = leaf.tabs[leaf.active]
  const doc = useDocuments((s) => (tab?.kind === 'doc' ? s.docs[tab.docId] : undefined))
  if (!tab) return <div className="dn-empty">{t('emptyPane')}</div>
  if (tab.kind === 'compare') return <div className="dn-empty">{t('compareUnavailable')}</div>
  if (!doc) return <div className="dn-empty" />
  const view = doc.sourceOnly ? 'source' : tab.view
  return (
    <>
      {doc.external !== 'none' && (
        <div role="alert" className="dn-banner" data-testid="external-banner">
          <span>{doc.external === 'changed' ? t('externalChanged') : t('externalDeleted')}</span>
          {doc.external === 'changed' && (
            <button onClick={() => void getCommands().reloadFromDisk(doc.id)}>{t('reload')}</button>
          )}
          <button onClick={() => getCommands().keepLocal(doc.id)}>{t('keepMine')}</button>
        </div>
      )}
      {doc.warning && (
        <div role="alert" className="dn-banner" data-testid="doc-warning">
          {doc.warning === 'tooLarge' ? t('warnTooLarge') : t('warnNotUtf8')}
        </div>
      )}
      <div className="dn-editor-area">
        {view === 'source' ? (
          <SourceEditor key={`${doc.id}:source`} docId={doc.id} paneId={leaf.id} />
        ) : (
          <WysiwygEditor key={`${doc.id}:wysiwyg`} docId={doc.id} paneId={leaf.id} />
        )}
      </div>
    </>
  )
}

export function Pane({ leaf }: { leaf: Leaf }): React.ReactElement {
  const active = useLayout((s) => s.activeLeafId === leaf.id)
  const focus = useLayout((s) => s.focusLeaf)
  return (
    <section
      className={'dn-pane' + (active ? ' active' : '')}
      data-testid={`pane-${leaf.id}`}
      onMouseDown={() => focus(leaf.id)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TAB_DRAG_TYPE)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(TAB_DRAG_TYPE)
        if (!raw) return
        e.preventDefault()
        try {
          const from = JSON.parse(raw) as { leafId: string; index: number }
          // Dropping on a tab inserts before it; anywhere else appends.
          const over = (e.target as HTMLElement).closest<HTMLElement>('[data-tab-index]')
          const index = over ? Number(over.dataset.tabIndex) : leaf.tabs.length
          if (typeof from.leafId === 'string' && Number.isInteger(from.index)) {
            useLayout.getState().moveTab(from, { leafId: leaf.id, index })
          }
        } catch {
          // ignore malformed drags
        }
      }}
    >
      <TabBar leaf={leaf} />
      <div className="dn-pane-body">
        <PaneBody leaf={leaf} />
      </div>
    </section>
  )
}
