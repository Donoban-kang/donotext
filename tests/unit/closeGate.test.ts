import { describe, expect, it } from 'vitest'
import { CloseGate } from '../../src/main/closeGate'

describe('CloseGate', () => {
  it('asks the renderer before the first close', () => {
    expect(new CloseGate().attempt()).toBe('ask')
  })
  it('keeps asking until the renderer allows the close (a cancelled prompt stays cancelled)', () => {
    const g = new CloseGate()
    expect(g.attempt()).toBe('ask')
    expect(g.respond(false)).toBe(false)
    expect(g.attempt()).toBe('ask')
  })
  it('allows the close after the renderer confirmed it', () => {
    const g = new CloseGate()
    g.attempt()
    expect(g.respond(true)).toBe(true)
    expect(g.attempt()).toBe('allow')
  })
  it('never traps the user when the page has crashed or hangs', () => {
    const g = new CloseGate()
    g.markUnavailable()
    expect(g.attempt()).toBe('allow')
  })
  it('forgets a confirmation once the window is closed so a new window asks again', () => {
    const g = new CloseGate()
    g.respond(true)
    g.reset()
    expect(g.attempt()).toBe('ask')
  })
})
