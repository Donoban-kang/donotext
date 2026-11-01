import type { LayoutNode } from './layoutTypes'

export interface SessionDoc {
  id: string
  path: string | null
  /** A "수정본": an edited copy of the file that has not been saved anywhere yet. */
  fork?: boolean
}

export interface SessionData {
  version: 1
  layout: LayoutNode
  docs: SessionDoc[]
  folder: string | null
  activeLeafId: string
  recent: string[]
}
