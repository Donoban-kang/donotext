import type React from 'react'
import { t } from '../app/i18n'
import { SourceEditor } from '../editor/SourceEditor'
import { WysiwygEditor } from '../editor/WysiwygEditor'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { TabBar } from './TabBar'
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
    >
      <TabBar leaf={leaf} />
      <div className="dn-pane-body">
        <PaneBody leaf={leaf} />
      </div>
    </section>
  )
}
