import type React from 'react'
import { useEffect, useState } from 'react'
import { getCommands } from './appCommands'
import { t } from './i18n'
import { Icon } from './icons'

const carriesFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

/** The pane a drop landed on, from the pane's test id (`pane-<leaf id>`). */
function paneOf(target: EventTarget | null): string | undefined {
  const id = (target as HTMLElement | null)?.closest?.('[data-testid^="pane-"]')?.getAttribute('data-testid')
  return id ? id.slice('pane-'.length) : undefined
}

/**
 * Lets files and folders from the file manager be dropped anywhere on the window. Tabs dragged inside the
 * app use their own drag type and are left alone. The listeners run first (capture) and stop the event, so
 * the editor never treats a dropped file as text to paste.
 */
export function DropZone(): React.ReactElement | null {
  const [over, setOver] = useState(false)

  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth++
      setOver(true)
    }
    const onOver = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const onDrop = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      depth = 0
      setOver(false)
      void getCommands().openDropped(paneOf(e.target))
    }
    const hide = (): void => {
      depth = 0
      setOver(false)
    }
    window.addEventListener('dragenter', onEnter, true)
    window.addEventListener('dragover', onOver, true)
    window.addEventListener('dragleave', onLeave, true)
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', hide, true)
    return () => {
      window.removeEventListener('dragenter', onEnter, true)
      window.removeEventListener('dragover', onOver, true)
      window.removeEventListener('dragleave', onLeave, true)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', hide, true)
    }
  }, [])

  if (!over) return null
  return (
    <div className="dn-drop-overlay" data-testid="drop-overlay" aria-hidden="true">
      <div className="dn-drop-panel">
        <div className="dn-drop-frame">
          <Icon name="download" />
          <strong>{t('dropTitle')}</strong>
          <span>{t('dropHint')}</span>
        </div>
        <div className="dn-drop-badges">
          {['.md', '.markdown', '.txt', '.json'].map((ext) => (
            <span key={ext} className="dn-drop-badge">
              {ext}
            </span>
          ))}
          <span className="dn-drop-badge">{t('dropFolder')}</span>
        </div>
      </div>
    </div>
  )
}
