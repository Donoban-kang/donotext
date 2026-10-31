export type Tab =
  | { kind: 'doc'; docId: string; view: 'wysiwyg' | 'source' }
  | { kind: 'compare'; leftDocId: string; rightDocId: string }

export interface Leaf {
  type: 'leaf'
  id: string
  tabs: Tab[]
  active: number
}

export interface Split {
  type: 'split'
  id: string
  dir: 'row' | 'col'
  children: LayoutNode[]
  /** Fractions of the split's extent; always sums to 1. */
  sizes: number[]
}

export type LayoutNode = Leaf | Split
