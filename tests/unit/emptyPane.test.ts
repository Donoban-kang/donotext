import { describe, expect, it } from 'vitest'
import { allLeaves } from '../../src/renderer/layout/tree'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'

function twoPanes() {
  const layout = createLayoutStore()
  const s = () => layout.getState()
  s().openDoc('a')
  s().splitActive('row')
  s().openDoc('a')
  const [left, right] = allLeaves(s().root)
  return { layout, s, left, right }
}

describe('a split pane closes when its last tab goes away', () => {
  it('closing the only tab of a pane removes the pane and gives the space to the other', () => {
    const { s, left, right } = twoPanes()
    s().closeTabAt(right.id, 0)
    expect(allLeaves(s().root).map((l) => l.id)).toEqual([left.id])
    expect(s().root.type).toBe('leaf')
  })

  it('keeps the pane while it still has other tabs', () => {
    const { s, right } = twoPanes()
    s().openDoc('b') // second tab in the right pane
    s().closeTabAt(right.id, 0)
    expect(allLeaves(s().root)).toHaveLength(2)
  })

  it('never closes the last remaining pane', () => {
    const layout = createLayoutStore()
    layout.getState().openDoc('a')
    layout.getState().closeTabAt(layout.getState().activeLeafId, 0)
    expect(allLeaves(layout.getState().root)).toHaveLength(1)
    expect(allLeaves(layout.getState().root)[0].tabs).toHaveLength(0)
  })

  it('moving the only tab of a pane to another pane closes the emptied pane', () => {
    const { s, left, right } = twoPanes()
    s().moveTab({ leafId: right.id, index: 0 }, { leafId: left.id, index: 1 })
    expect(allLeaves(s().root).map((l) => l.id)).toEqual([left.id])
    expect(s().activeLeafId).toBe(left.id)
  })

  it('moving a tab inside one pane changes nothing else', () => {
    const { s, right } = twoPanes()
    s().openDoc('b')
    s().moveTab({ leafId: right.id, index: 0 }, { leafId: right.id, index: 1 })
    expect(allLeaves(s().root)).toHaveLength(2)
  })

  it('focus goes to the pane that took the closed pane\'s place', () => {
    const layout = createLayoutStore()
    const s = () => layout.getState()
    s().openDoc('a')
    s().splitActive('row')
    s().openDoc('a')
    s().splitActive('row')
    s().openDoc('a')
    const [first, second, third] = allLeaves(s().root)
    s().focusLeaf(second.id)
    s().closeTabAt(second.id, 0)
    expect(allLeaves(s().root).map((l) => l.id)).toEqual([first.id, third.id])
    expect(s().activeLeafId).toBe(third.id)
  })

  it('a scroll link to the closed pane is dropped', () => {
    const { s, left, right } = twoPanes()
    s().setScrollLink({ a: left.id, b: right.id })
    s().closeTabAt(right.id, 0)
    expect(s().scrollLink).toBeNull()
  })
})
