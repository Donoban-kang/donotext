import type React from 'react'
import { useState } from 'react'
import { t } from '../app/i18n'
import { FileTree } from './FileTree'
import { Outline } from './OutlinePanel'

export function Sidebar(): React.ReactElement {
  const [tab, setTab] = useState<'files' | 'outline'>('files')
  return (
    <aside className="dn-sidebar" data-testid="sidebar">
      <div className="dn-sidebar-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'files'} onClick={() => setTab('files')}>
          {t('sidebarFiles')}
        </button>
        <button role="tab" aria-selected={tab === 'outline'} onClick={() => setTab('outline')}>
          {t('sidebarOutline')}
        </button>
      </div>
      <div className="dn-sidebar-body">
        {/* Both stay mounted so the opened folder and expansion state survive tab switches. */}
        <div hidden={tab !== 'files'}>
          <FileTree />
        </div>
        <div hidden={tab !== 'outline'}>
          <Outline />
        </div>
      </div>
    </aside>
  )
}
