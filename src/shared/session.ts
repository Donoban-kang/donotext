import type { LayoutNode } from './layoutTypes'

export interface SessionDoc {
  id: string
  path: string | null
}

export interface SessionData {
  version: 1
  layout: LayoutNode
  docs: SessionDoc[]
  folder: string | null
  activeLeafId: string
  recent: string[]
}
