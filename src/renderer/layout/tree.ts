import type { LayoutNode, Leaf, Split, Tab } from '../../shared/layoutTypes'

export type { LayoutNode, Leaf, Split, Tab }

export const MAX_LEAVES = 6
/** Maximum number of nested Split levels along any root-to-leaf path. */
export const MAX_DEPTH = 4

let seq = 0
const nextId = (prefix: string): string => `${prefix}-${++seq}`

export function newLeaf(): Leaf {
  return { type: 'leaf', id: nextId('leaf'), tabs: [], active: 0 }
}

// ---------- queries ----------

export function allLeaves(node: LayoutNode): Leaf[] {
  return node.type === 'leaf' ? [node] : node.children.flatMap(allLeaves)
}

export function countLeaves(node: LayoutNode): number {
  return allLeaves(node).length
}

export function depth(node: LayoutNode): number {
  return node.type === 'leaf' ? 0 : 1 + Math.max(...node.children.map(depth))
}

export function findLeaf(node: LayoutNode, id: string): Leaf | undefined {
  return allLeaves(node).find((l) => l.id === id)
}

function findParent(node: LayoutNode, id: string): Split | undefined {
  if (node.type === 'leaf') return undefined
  if (node.children.some((c) => c.id === id)) return node
  for (const c of node.children) {
    const p = findParent(c, id)
    if (p) return p
  }
  return undefined
}

const sameTab = (a: Tab, b: Tab): boolean =>
  a.kind === 'doc' && b.kind === 'doc'
    ? a.docId === b.docId
    : a.kind === 'compare' && b.kind === 'compare' && a.leftDocId === b.leftDocId && a.rightDocId === b.rightDocId

// ---------- immutable helpers ----------

/** Replaces the node with `id` using `fn`; returns the same root object when nothing changed. */
function replace(node: LayoutNode, id: string, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  if (node.id === id) return fn(node)
  if (node.type === 'leaf') return node
  let changed = false
  const children = node.children.map((c) => {
    const n = replace(c, id, fn)
    if (n !== c) changed = true
    return n
  })
  return changed ? { ...node, children } : node
}

function updateLeaf(root: LayoutNode, leafId: string, fn: (l: Leaf) => Leaf): LayoutNode {
  return replace(root, leafId, (n) => (n.type === 'leaf' ? fn(n) : n))
}

const normalize = (sizes: number[]): number[] => {
  const total = sizes.reduce((a, b) => a + b, 0)
  return sizes.map((s) => s / total)
}

// ---------- splits ----------

export function splitLeaf(root: LayoutNode, leafId: string, dir: 'row' | 'col', side: 'before' | 'after'): LayoutNode {
  const leaf = findLeaf(root, leafId)
  if (!leaf || countLeaves(root) >= MAX_LEAVES) return root
  const fresh = newLeaf()
  const parent = findParent(root, leafId)
  let next: LayoutNode
  if (parent && parent.dir === dir) {
    next = replace(root, parent.id, (n) => {
      const p = n as Split
      const i = p.children.findIndex((c) => c.id === leafId)
      const half = p.sizes[i] / 2
      const children = [...p.children]
      const sizes = [...p.sizes]
      children.splice(side === 'after' ? i + 1 : i, 0, fresh)
      sizes.splice(i, 1, half, half)
      return { ...p, children, sizes }
    })
  } else {
    next = replace(root, leafId, (n) => ({
      type: 'split',
      id: nextId('split'),
      dir,
      children: side === 'after' ? [n, fresh] : [fresh, n],
      sizes: [0.5, 0.5]
    }))
  }
  return depth(next) > MAX_DEPTH ? root : next
}

export function closeLeaf(root: LayoutNode, leafId: string): LayoutNode {
  if (root.type === 'leaf') return root
  const parent = findParent(root, leafId)
  if (!parent || !findLeaf(root, leafId)) return root
  return replace(root, parent.id, (n) => {
    const p = n as Split
    const i = p.children.findIndex((c) => c.id === leafId)
    const children = p.children.filter((_, j) => j !== i)
    if (children.length === 1) return children[0]
    return { ...p, children, sizes: normalize(p.sizes.filter((_, j) => j !== i)) }
  })
}

export function resize(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  return replace(root, splitId, (n) => {
    if (n.type !== 'split' || sizes.length !== n.children.length) return n
    if (!sizes.every((s) => Number.isFinite(s) && s > 0)) return n
    return { ...n, sizes: normalize(sizes) }
  })
}

/**
 * Moves the boundary between pane `index` and `index + 1` by `delta` (a fraction of the split),
 * keeping both at least `min`. Returns the same array when nothing changes.
 */
export function adjustSizes(sizes: number[], index: number, delta: number, min = 0.08): number[] {
  if (!Number.isFinite(delta) || index < 0 || index + 1 >= sizes.length) return sizes
  const lo = min - sizes[index]
  const hi = sizes[index + 1] - min
  if (lo > hi) return sizes
  const d = Math.max(lo, Math.min(hi, delta))
  if (d === 0) return sizes
  const out = [...sizes]
  out[index] = sizes[index] + d
  out[index + 1] = sizes[index + 1] - d
  return out
}

export function equalize(root: LayoutNode, splitId: string): LayoutNode {
  return replace(root, splitId, (n) =>
    n.type === 'split' ? { ...n, sizes: n.children.map(() => 1 / n.children.length) } : n
  )
}

// ---------- tabs ----------

export function openTab(root: LayoutNode, leafId: string, tab: Tab): LayoutNode {
  return updateLeaf(root, leafId, (l) => {
    const existing = l.tabs.findIndex((t) => sameTab(t, tab))
    if (existing >= 0) return { ...l, active: existing }
    return { ...l, tabs: [...l.tabs, tab], active: l.tabs.length }
  })
}

function withoutTab(l: Leaf, index: number): Leaf {
  const tabs = l.tabs.filter((_, i) => i !== index)
  let active = l.active
  if (tabs.length === 0) active = 0
  else if (index < l.active) active = l.active - 1
  else if (index === l.active) active = Math.min(l.active, tabs.length - 1)
  return { ...l, tabs, active }
}

export function closeTab(root: LayoutNode, leafId: string, index: number): LayoutNode {
  return updateLeaf(root, leafId, (l) => (index >= 0 && index < l.tabs.length ? withoutTab(l, index) : l))
}

export function setActiveTab(root: LayoutNode, leafId: string, index: number): LayoutNode {
  return updateLeaf(root, leafId, (l) => (index >= 0 && index < l.tabs.length ? { ...l, active: index } : l))
}

export function moveTab(
  root: LayoutNode,
  from: { leafId: string; index: number },
  to: { leafId: string; index: number }
): LayoutNode {
  const src = findLeaf(root, from.leafId)
  const dst = findLeaf(root, to.leafId)
  const tab = src?.tabs[from.index]
  if (!src || !dst || !tab) return root
  const clamp = (i: number, len: number): number => Math.max(0, Math.min(i, len))

  if (src.id === dst.id) {
    return updateLeaf(root, src.id, (l) => {
      const rest = withoutTab(l, from.index)
      const at = clamp(to.index, rest.tabs.length)
      const tabs = [...rest.tabs]
      tabs.splice(at, 0, tab)
      return { ...rest, tabs, active: at }
    })
  }
  const removed = updateLeaf(root, src.id, (l) => withoutTab(l, from.index))
  return updateLeaf(removed, dst.id, (l) => {
    const dup = l.tabs.findIndex((t) => sameTab(t, tab))
    if (dup >= 0) return { ...l, active: dup }
    const at = clamp(to.index, l.tabs.length)
    const tabs = [...l.tabs]
    tabs.splice(at, 0, tab)
    return { ...l, tabs, active: at }
  })
}

// ---------- persistence ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function parseTab(v: unknown): Tab | null {
  if (!isObj(v)) return null
  if (v.kind === 'doc' && typeof v.docId === 'string' && (v.view === 'wysiwyg' || v.view === 'source')) {
    return { kind: 'doc', docId: v.docId, view: v.view }
  }
  if (v.kind === 'compare' && typeof v.leftDocId === 'string' && typeof v.rightDocId === 'string') {
    return { kind: 'compare', leftDocId: v.leftDocId, rightDocId: v.rightDocId }
  }
  return null
}

function parseNode(v: unknown, ids: Set<string>): LayoutNode | null {
  if (!isObj(v) || typeof v.id !== 'string' || ids.has(v.id)) return null
  ids.add(v.id)
  if (v.type === 'leaf') {
    if (!Array.isArray(v.tabs)) return null
    const tabs = v.tabs.map(parseTab)
    if (tabs.some((t) => t === null)) return null
    const active = v.active
    if (!Number.isInteger(active)) return null
    const a = active as number
    if (tabs.length === 0 ? a !== 0 : a < 0 || a >= tabs.length) return null
    return { type: 'leaf', id: v.id, tabs: tabs as Tab[], active: a }
  }
  if (v.type === 'split') {
    if ((v.dir !== 'row' && v.dir !== 'col') || !Array.isArray(v.children) || !Array.isArray(v.sizes)) return null
    if (v.children.length < 2 || v.sizes.length !== v.children.length) return null
    if (!v.sizes.every((s) => typeof s === 'number' && Number.isFinite(s) && s > 0)) return null
    const children = v.children.map((c) => parseNode(c, ids))
    if (children.some((c) => c === null)) return null
    return { type: 'split', id: v.id, dir: v.dir, children: children as LayoutNode[], sizes: normalize(v.sizes as number[]) }
  }
  return null
}

/** Validates untrusted layout JSON; anything invalid or over the limits becomes a single empty leaf. */
export function parseLayout(json: unknown): LayoutNode {
  const ids = new Set<string>()
  const parsed = parseNode(json, ids)
  if (!parsed || countLeaves(parsed) > MAX_LEAVES || depth(parsed) > MAX_DEPTH) return newLeaf()
  for (const id of ids) {
    const m = /-(\d+)$/.exec(id)
    if (m) seq = Math.max(seq, Number(m[1]))
  }
  return parsed
}

/**
 * Renames the document ids referenced by tabs using `map`; tabs whose document is not in the map
 * (e.g. a file that no longer exists) are removed. Empty leaves are kept.
 */
export function remapDocIds(root: LayoutNode, map: Map<string, string>): LayoutNode {
  const mapTab = (tab: Tab): Tab | null => {
    if (tab.kind === 'doc') {
      const id = map.get(tab.docId)
      return id ? { ...tab, docId: id } : null
    }
    const l = map.get(tab.leftDocId)
    const r = map.get(tab.rightDocId)
    return l && r ? { ...tab, leftDocId: l, rightDocId: r } : null
  }
  const mapNode = (n: LayoutNode): LayoutNode => {
    if (n.type === 'split') return { ...n, children: n.children.map(mapNode) }
    const kept: Array<{ tab: Tab; from: number }> = []
    n.tabs.forEach((t, from) => {
      const m = mapTab(t)
      if (m) kept.push({ tab: m, from })
    })
    const survivor = kept.findIndex((k) => k.from === n.active)
    const active = kept.length === 0 ? 0 : survivor >= 0 ? survivor : Math.min(n.active, kept.length - 1)
    return { ...n, tabs: kept.map((k) => k.tab), active }
  }
  return mapNode(root)
}
