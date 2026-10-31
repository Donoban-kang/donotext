import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../../src/renderer/app/theme'

describe('resolveTheme', () => {
  it('follows the system when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
  it('ignores the system for an explicit choice', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
