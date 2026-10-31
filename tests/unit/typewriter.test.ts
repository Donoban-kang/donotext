import { describe, expect, it } from 'vitest'
import { typewriterScrollDelta } from '../../src/renderer/editor/typewriter'

describe('typewriterScrollDelta', () => {
  it('scrolls down when the caret is below the vertical centre', () => {
    expect(typewriterScrollDelta({ caretTop: 700, caretHeight: 20, hostTop: 100, hostHeight: 600 })).toBe(700 + 10 - (100 + 300))
  })
  it('scrolls up when the caret is above the centre', () => {
    expect(typewriterScrollDelta({ caretTop: 150, caretHeight: 20, hostTop: 100, hostHeight: 600 })).toBeLessThan(0)
  })
  it('does nothing when the caret is already centred (within one pixel)', () => {
    expect(typewriterScrollDelta({ caretTop: 390, caretHeight: 20, hostTop: 100, hostHeight: 600 })).toBe(0)
    expect(typewriterScrollDelta({ caretTop: 390.4, caretHeight: 20, hostTop: 100, hostHeight: 600 })).toBe(0)
  })
  it('does nothing for a zero-size host or a non-finite caret', () => {
    expect(typewriterScrollDelta({ caretTop: 10, caretHeight: 20, hostTop: 0, hostHeight: 0 })).toBe(0)
    expect(typewriterScrollDelta({ caretTop: Number.NaN, caretHeight: 20, hostTop: 0, hostHeight: 500 })).toBe(0)
  })
})
