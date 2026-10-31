import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncer, flushAllEditors, registerFlusher, shouldApplyRemote } from '../../src/renderer/editor/sync'

describe('shouldApplyRemote', () => {
  it('ignores updates that this pane originated itself', () => {
    expect(shouldApplyRemote({ selfId: 'a', origin: 'a', composing: false })).toBe(false)
  })
  it('applies updates from another pane', () => {
    expect(shouldApplyRemote({ selfId: 'a', origin: 'b', composing: false })).toBe(true)
  })
  it('does not apply while an IME composition is active', () => {
    expect(shouldApplyRemote({ selfId: 'a', origin: 'b', composing: true })).toBe(false)
  })
  it('applies reloads from disk to every pane', () => {
    expect(shouldApplyRemote({ selfId: 'a', origin: 'reload', composing: false })).toBe(true)
  })
})

describe('createDebouncer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs only the last call after the delay', () => {
    const d = createDebouncer(150)
    const fn = vi.fn()
    d.call(() => fn(1))
    d.call(() => fn(2))
    d.call(() => fn(3))
    vi.advanceTimersByTime(149)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
  })
  it('flush runs the pending call immediately and only once', () => {
    const d = createDebouncer(150)
    const fn = vi.fn()
    d.call(fn)
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('cancel drops the pending call', () => {
    const d = createDebouncer(150)
    const fn = vi.fn()
    d.call(fn)
    d.cancel()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })
  it('flush with nothing pending is a no-op', () => {
    expect(() => createDebouncer(150).flush()).not.toThrow()
  })
})

describe('flusher registry', () => {
  it('flushAllEditors calls every registered flusher until unregistered', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = registerFlusher(a)
    registerFlusher(b)
    flushAllEditors()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    flushAllEditors()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })
})
