import { describe, expect, it } from 'vitest'
import {
  MAX_DEPTH,
  MAX_LEAVES,
  adjustSizes,
  allLeaves,
  closeLeaf,
  closeTab,
  countLeaves,
  depth,
  equalize,
  findLeaf,
  moveTab,
  newLeaf,
  openTab,
  parseLayout,
  remapDocIds,
  resize,
  setActiveTab,
  splitLeaf
} from '../../src/renderer/layout/tree'
import type { LayoutNode, Split, Tab } from '../../src/shared/layoutTypes'

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}

const doc = (docId: string): Tab => ({ kind: 'doc', docId, view: 'wysiwyg' })
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/** Splits `leafId` and returns the new root plus the id of the leaf that was added. */
function splitNew(root: LayoutNode, leafId: string, dir: 'row' | 'col', side: 'before' | 'after' = 'after') {
  const before = new Set(allLeaves(root).map((l) => l.id))
  const next = splitLeaf(root, leafId, dir, side)
  const added = allLeaves(next).find((l) => !before.has(l.id))
  return { root: next, added }
}

describe('splitLeaf', () => {
  it('turns a single leaf into a split of two with equal sizes', () => {
    const leaf = deepFreeze(newLeaf())
    const { root, added } = splitNew(leaf, leaf.id, 'row')
    expect(root.type).toBe('split')
    const s = root as Split
    expect(s.dir).toBe('row')
    expect(s.children).toHaveLength(2)
    expect(s.sizes).toEqual([0.5, 0.5])
    expect(s.children[0]).toMatchObject({ id: leaf.id })
    expect(s.children[1]).toMatchObject({ id: added!.id })
  })
  it('puts the new leaf first for side "before"', () => {
    const leaf = newLeaf()
    const { root, added } = splitNew(leaf, leaf.id, 'col', 'before')
    expect((root as Split).children[0]).toMatchObject({ id: added!.id })
  })
  it('inserts a sibling instead of nesting when the parent has the same direction', () => {
    const leaf = newLeaf()
    const a = splitNew(leaf, leaf.id, 'row')
    const b = splitNew(deepFreeze(a.root), leaf.id, 'row')
    const s = b.root as Split
    expect(s.children).toHaveLength(3)
    expect(depth(b.root)).toBe(1)
    expect(sum(s.sizes)).toBeCloseTo(1)
    expect(s.sizes[0]).toBeCloseTo(0.25)
    expect(s.sizes[1]).toBeCloseTo(0.25)
    expect(s.sizes[2]).toBeCloseTo(0.5)
  })
  it('nests when the direction differs', () => {
    const leaf = newLeaf()
    const a = splitNew(leaf, leaf.id, 'row')
    const b = splitNew(a.root, leaf.id, 'col')
    expect(depth(b.root)).toBe(2)
  })
  it('refuses the 7th leaf and returns the same root', () => {
    let root: LayoutNode = newLeaf()
    for (let i = 1; i < MAX_LEAVES; i++) root = splitNew(root, allLeaves(root)[0].id, 'row').root
    expect(countLeaves(root)).toBe(MAX_LEAVES)
    deepFreeze(root)
    expect(splitLeaf(root, allLeaves(root)[0].id, 'col', 'after')).toBe(root)
  })
  it('refuses a split that would exceed the maximum nesting depth', () => {
    let root: LayoutNode = newLeaf()
    let target = (root as ReturnType<typeof newLeaf>).id
    for (let i = 0; i < MAX_DEPTH; i++) {
      const r = splitNew(root, target, i % 2 === 0 ? 'row' : 'col')
      root = r.root
      target = r.added!.id
    }
    expect(depth(root)).toBe(MAX_DEPTH)
    const dir = MAX_DEPTH % 2 === 0 ? 'row' : 'col' // differs from the deepest parent's direction
    deepFreeze(root)
    expect(splitLeaf(root, target, dir, 'after')).toBe(root)
  })
  it('returns the root unchanged for an unknown leaf id', () => {
    const leaf = newLeaf()
    expect(splitLeaf(leaf, 'nope', 'row', 'after')).toBe(leaf)
  })
})

describe('closeLeaf', () => {
  it('collapses a split with one remaining child into that child', () => {
    const leaf = newLeaf()
    const { root, added } = splitNew(leaf, leaf.id, 'row')
    const closed = closeLeaf(deepFreeze(root), added!.id)
    expect(closed).toMatchObject({ type: 'leaf', id: leaf.id })
  })
  it('renormalizes sizes when a sibling remains among several', () => {
    const leaf = newLeaf()
    const a = splitNew(leaf, leaf.id, 'row')
    const b = splitNew(a.root, leaf.id, 'row')
    const closed = closeLeaf(b.root, b.added!.id) as Split
    expect(closed.children).toHaveLength(2)
    expect(sum(closed.sizes)).toBeCloseTo(1)
  })
  it('never closes the only leaf', () => {
    const leaf = deepFreeze(newLeaf())
    expect(closeLeaf(leaf, leaf.id)).toBe(leaf)
  })
  it('returns the root unchanged for an unknown id', () => {
    const { root } = splitNew(newLeaf(), 'x', 'row')
    expect(closeLeaf(root, 'nope')).toBe(root)
  })
})

describe('tab operations', () => {
  it('openTab appends and activates; reopening an existing tab only activates it', () => {
    let root: LayoutNode = newLeaf()
    const id = (root as ReturnType<typeof newLeaf>).id
    root = openTab(deepFreeze(root), id, doc('d1'))
    root = openTab(root, id, doc('d2'))
    expect(findLeaf(root, id)).toMatchObject({ active: 1 })
    root = openTab(root, id, doc('d1'))
    const leaf = findLeaf(root, id)!
    expect(leaf.tabs).toHaveLength(2)
    expect(leaf.active).toBe(0)
  })
  it('closeTab keeps the active tab valid', () => {
    let root: LayoutNode = newLeaf()
    const id = (root as ReturnType<typeof newLeaf>).id
    for (const d of ['d1', 'd2', 'd3']) root = openTab(root, id, doc(d))
    root = closeTab(deepFreeze(root), id, 2)
    expect(findLeaf(root, id)).toMatchObject({ active: 1 })
    root = closeTab(root, id, 0)
    expect(findLeaf(root, id)).toMatchObject({ active: 0 })
    root = closeTab(root, id, 0)
    expect(findLeaf(root, id)).toMatchObject({ tabs: [], active: 0 })
  })
  it('moveTab reorders within a leaf', () => {
    let root: LayoutNode = newLeaf()
    const id = (root as ReturnType<typeof newLeaf>).id
    for (const d of ['d1', 'd2', 'd3']) root = openTab(root, id, doc(d))
    root = moveTab(deepFreeze(root), { leafId: id, index: 0 }, { leafId: id, index: 2 })
    expect(findLeaf(root, id)!.tabs.map((t) => (t as { docId: string }).docId)).toEqual(['d2', 'd3', 'd1'])
  })
  it('moveTab to another leaf leaves an emptied source leaf in place', () => {
    const base = newLeaf()
    const { root: split, added } = splitNew(base, base.id, 'row')
    let root = openTab(split, base.id, doc('d1'))
    root = moveTab(deepFreeze(root), { leafId: base.id, index: 0 }, { leafId: added!.id, index: 0 })
    expect(findLeaf(root, base.id)).toMatchObject({ tabs: [], active: 0 })
    expect(findLeaf(root, added!.id)!.tabs).toHaveLength(1)
    expect(countLeaves(root)).toBe(2)
  })
  it('setActiveTab ignores out-of-range indexes', () => {
    let root: LayoutNode = newLeaf()
    const id = (root as ReturnType<typeof newLeaf>).id
    root = openTab(root, id, doc('d1'))
    expect(setActiveTab(root, id, 5)).toBe(root)
    expect(setActiveTab(root, id, -1)).toBe(root)
  })
})

describe('resize / equalize', () => {
  it('normalizes sizes that do not sum to 1', () => {
    const leaf = newLeaf()
    const s = splitNew(leaf, leaf.id, 'row').root as Split
    const r = resize(deepFreeze(s), s.id, [3, 1]) as Split
    expect(r.sizes[0]).toBeCloseTo(0.75)
    expect(r.sizes[1]).toBeCloseTo(0.25)
  })
  it('rejects wrong-length or non-positive sizes', () => {
    const leaf = newLeaf()
    const s = splitNew(leaf, leaf.id, 'row').root as Split
    expect(resize(s, s.id, [1])).toBe(s)
    expect(resize(s, s.id, [1, 0])).toBe(s)
    expect(resize(s, s.id, [1, Number.NaN])).toBe(s)
  })
  it('equalize resets sizes', () => {
    const leaf = newLeaf()
    const s0 = splitNew(leaf, leaf.id, 'row').root as Split
    const resized = resize(s0, s0.id, [9, 1])
    const eq = equalize(deepFreeze(resized), s0.id) as Split
    expect(eq.sizes).toEqual([0.5, 0.5])
  })
})

describe('parseLayout', () => {
  it('falls back to a fresh leaf for garbage', () => {
    for (const bad of [null, 1, 'x', { garbage: 1 }, { type: 'split', id: 's', dir: 'row', children: [], sizes: [] }]) {
      expect(parseLayout(bad).type).toBe('leaf')
    }
  })
  it('round-trips a valid layout through JSON', () => {
    const leaf = newLeaf()
    let root = splitNew(leaf, leaf.id, 'row').root
    root = openTab(root, leaf.id, doc('d1'))
    expect(parseLayout(JSON.parse(JSON.stringify(root)))).toEqual(root)
  })
  it('rejects layouts beyond the limits', () => {
    let root: LayoutNode = newLeaf()
    for (let i = 1; i < MAX_LEAVES; i++) root = splitNew(root, allLeaves(root)[0].id, 'row').root
    const tooMany = JSON.parse(JSON.stringify(root)) as Split
    tooMany.children.push({ type: 'leaf', id: 'extra', tabs: [], active: 0 })
    tooMany.sizes = tooMany.children.map(() => 1 / tooMany.children.length)
    expect(parseLayout(tooMany).type).toBe('leaf')
  })
  it('never generates an id that collides with restored ids', () => {
    const restored = parseLayout({ type: 'leaf', id: 'leaf-9999', tabs: [], active: 0 })
    const next = newLeaf()
    expect(next.id).not.toBe((restored as { id: string }).id)
    expect(Number(next.id.split('-').pop())).toBeGreaterThan(9999)
  })
  it('rejects tabs of unknown shape', () => {
    const bad = { type: 'leaf', id: 'l1', tabs: [{ kind: 'weird' }], active: 0 }
    expect(parseLayout(bad)).not.toMatchObject({ id: 'l1' })
  })
})

describe('remapDocIds', () => {
  it('renames document ids and drops tabs whose document is gone', () => {
    let root: LayoutNode = newLeaf()
    const id = (root as ReturnType<typeof newLeaf>).id
    for (const d of ['old1', 'old2', 'old3']) root = openTab(root, id, doc(d))
    root = openTab(root, id, { kind: 'compare', leftDocId: 'old1', rightDocId: 'old3' })
    const out = remapDocIds(deepFreeze(root), new Map([['old1', 'new1'], ['old2', 'new2']]))
    expect(findLeaf(out, id)!.tabs).toEqual([doc('new1'), doc('new2')])
  })
  it('keeps the same tab active when it survives, otherwise clamps', () => {
    let root: LayoutNode = newLeaf()
    const id = (root as ReturnType<typeof newLeaf>).id
    for (const d of ['a', 'b', 'c']) root = openTab(root, id, doc(d))
    root = setActiveTab(root, id, 2)
    const keepC = remapDocIds(root, new Map([['a', 'a2'], ['c', 'c2']]))
    expect(findLeaf(keepC, id)).toMatchObject({ active: 1 })
    const dropC = remapDocIds(root, new Map([['a', 'a2']]))
    expect(findLeaf(dropC, id)).toMatchObject({ active: 0 })
    const none = remapDocIds(root, new Map())
    expect(findLeaf(none, id)).toMatchObject({ tabs: [], active: 0 })
  })
  it('remaps inside nested splits and leaves empty leaves in place', () => {
    const base = newLeaf()
    const { root: split, added } = splitNew(base, base.id, 'row')
    let root = openTab(split, base.id, doc('x'))
    root = openTab(root, added!.id, doc('y'))
    const out = remapDocIds(root, new Map([['x', 'x2']]))
    expect(countLeaves(out)).toBe(2)
    expect(findLeaf(out, base.id)!.tabs).toEqual([doc('x2')])
    expect(findLeaf(out, added!.id)!.tabs).toEqual([])
  })
})

describe('adjustSizes', () => {
  it('moves the boundary between two neighbours and keeps the sum at 1', () => {
    const out = adjustSizes([0.5, 0.5], 0, 0.1)
    expect(out[0]).toBeCloseTo(0.6)
    expect(out[1]).toBeCloseTo(0.4)
    expect(sum(out)).toBeCloseTo(1)
  })
  it('only changes the two panes next to the boundary', () => {
    const out = adjustSizes([0.2, 0.3, 0.5], 1, 0.1)
    expect(out[0]).toBeCloseTo(0.2)
    expect(out[1]).toBeCloseTo(0.4)
    expect(out[2]).toBeCloseTo(0.4)
  })
  it('never lets a pane shrink below the minimum', () => {
    const out = adjustSizes([0.5, 0.5], 0, 0.9, 0.1)
    expect(out[0]).toBeCloseTo(0.9)
    expect(out[1]).toBeCloseTo(0.1)
    const back = adjustSizes([0.5, 0.5], 0, -0.9, 0.1)
    expect(back[0]).toBeCloseTo(0.1)
  })
  it('returns the same array for a zero move, a bad index or non-finite delta', () => {
    const sizes = [0.5, 0.5]
    expect(adjustSizes(sizes, 0, 0)).toBe(sizes)
    expect(adjustSizes(sizes, 1, 0.1)).toBe(sizes)
    expect(adjustSizes(sizes, -1, 0.1)).toBe(sizes)
    expect(adjustSizes(sizes, 0, Number.NaN)).toBe(sizes)
  })
})
