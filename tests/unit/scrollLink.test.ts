// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { attachScrollLink, offsetToRatio, ratioToOffset } from '../../src/renderer/layout/scrollLink'

describe('ratio helpers', () => {
  it('maps the scroll range to 0..1', () => {
    expect(offsetToRatio(0, 1000, 400)).toBe(0)
    expect(offsetToRatio(300, 1000, 400)).toBeCloseTo(0.5)
    expect(offsetToRatio(600, 1000, 400)).toBe(1)
  })
  it('clamps out-of-range offsets', () => {
    expect(offsetToRatio(-50, 1000, 400)).toBe(0)
    expect(offsetToRatio(9999, 1000, 400)).toBe(1)
  })
  it('treats content that fits as ratio 0 without dividing by zero', () => {
    expect(offsetToRatio(10, 400, 400)).toBe(0)
    expect(offsetToRatio(10, 100, 400)).toBe(0)
    expect(ratioToOffset(0.5, 400, 400)).toBe(0)
  })
  it('round-trips', () => {
    expect(ratioToOffset(offsetToRatio(250, 1200, 400), 1200, 400)).toBeCloseTo(250)
    expect(ratioToOffset(1, 1000, 400)).toBe(600)
  })
})

function scroller(scrollHeight: number, clientHeight: number): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  document.body.appendChild(el)
  return el
}
const fire = (el: HTMLElement): boolean => el.dispatchEvent(new Event('scroll'))

describe('attachScrollLink', () => {
  it('moves the other pane to the same relative position', () => {
    const a = scroller(1000, 400)
    const b = scroller(2000, 500)
    const detach = attachScrollLink(() => a, () => b)
    a.scrollTop = 300 // 50% of 600
    fire(a)
    expect(b.scrollTop).toBeCloseTo(750) // 50% of 1500
    b.scrollTop = 1500
    fire(b)
    expect(a.scrollTop).toBe(600)
    detach()
  })
  it('does not echo its own programmatic scroll back and forth', () => {
    const a = scroller(1000, 400)
    const b = scroller(1000, 400)
    attachScrollLink(() => a, () => b)
    a.scrollTop = 300
    fire(a)
    expect(b.scrollTop).toBe(300)
    a.scrollTop = 300 // would drift if b's echo moved a
    fire(b) // the scroll event caused by our own assignment
    expect(a.scrollTop).toBe(300)
  })
  it('stops syncing once detached', () => {
    const a = scroller(1000, 400)
    const b = scroller(1000, 400)
    const detach = attachScrollLink(() => a, () => b)
    detach()
    a.scrollTop = 200
    fire(a)
    expect(b.scrollTop).toBe(0)
  })
  it('copes with a pane that currently has no scroller', () => {
    const a = scroller(1000, 400)
    attachScrollLink(() => a, () => null)
    a.scrollTop = 200
    expect(() => fire(a)).not.toThrow()
  })
})
