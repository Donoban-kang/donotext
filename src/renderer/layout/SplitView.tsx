import type React from 'react'
import { Pane } from './Pane'
import type { LayoutNode } from './tree'

export function SplitView({ node }: { node: LayoutNode }): React.ReactElement {
  if (node.type === 'leaf') return <Pane leaf={node} />
  return (
    <div className={`dn-split dn-split-${node.dir}`} data-testid={`split-${node.id}`}>
      {node.children.map((child, i) => (
        <div key={child.id} className="dn-split-child" style={{ flex: `${node.sizes[i]} 1 0` }}>
          <SplitView node={child} />
        </div>
      ))}
    </div>
  )
}
