import type React from 'react'
import { useRef } from 'react'
import { t } from '../app/i18n'
import { useLayout } from '../store/layoutStore'
import { Pane } from './Pane'
import { adjustSizes, type LayoutNode, type Split } from './tree'

const KEY_STEP = 0.02

function Divider({ split, index, container }: { split: Split; index: number; container: React.RefObject<HTMLDivElement | null> }): React.ReactElement {
  const resizeSplit = useLayout((s) => s.resizeSplit)
  const equalizeSplit = useLayout((s) => s.equalizeSplit)
  const drag = useRef<{ start: number; sizes: number[]; extent: number } | null>(null)
  const horizontal = split.dir === 'row' // children side by side => vertical divider bar

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={t('resizePane')}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(split.sizes[index] * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid="divider"
      className={`dn-divider dn-divider-${split.dir}`}
      onPointerDown={(e) => {
        const rect = container.current?.getBoundingClientRect()
        if (!rect) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const dividers = split.children.length - 1
        const total = (horizontal ? rect.width : rect.height) - dividers * 6
        drag.current = { start: horizontal ? e.clientX : e.clientY, sizes: split.sizes, extent: Math.max(total, 1) }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const delta = ((horizontal ? e.clientX : e.clientY) - d.start) / d.extent
        resizeSplit(split.id, adjustSizes(d.sizes, index, delta))
      }}
      onPointerUp={(e) => {
        drag.current = null
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onDoubleClick={() => equalizeSplit(split.id)}
      onKeyDown={(e) => {
        const back = horizontal ? 'ArrowLeft' : 'ArrowUp'
        const fwd = horizontal ? 'ArrowRight' : 'ArrowDown'
        if (e.key === back || e.key === fwd) {
          e.preventDefault()
          resizeSplit(split.id, adjustSizes(split.sizes, index, e.key === fwd ? KEY_STEP : -KEY_STEP))
        } else if (e.key === 'Enter') {
          e.preventDefault()
          equalizeSplit(split.id)
        }
      }}
    />
  )
}

function SplitContainer({ node }: { node: Split }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className={`dn-split dn-split-${node.dir}`} data-testid={`split-${node.id}`}>
      {node.children.map((child, i) => (
        <div key={child.id} className="dn-split-slot" style={{ display: 'contents' }}>
          {i > 0 && <Divider split={node} index={i - 1} container={ref} />}
          <div className="dn-split-child" style={{ flex: `${node.sizes[i]} 1 0` }}>
            <SplitView node={child} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SplitView({ node }: { node: LayoutNode }): React.ReactElement {
  return node.type === 'leaf' ? <Pane leaf={node} /> : <SplitContainer node={node} />
}
