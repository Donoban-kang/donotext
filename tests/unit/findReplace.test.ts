import { describe, expect, it } from 'vitest'
import { findMatches } from '../../src/renderer/editor/findReplace'

describe('findMatches', () => {
  it('finds case-insensitively by default option', () => {
    expect(findMatches('Aa aA', 'a', { caseSensitive: false })).toHaveLength(4)
  })
  it('respects caseSensitive', () => {
    expect(findMatches('Aa aA', 'a', { caseSensitive: true })).toHaveLength(2)
  })
  it('returns ranges with from/to offsets', () => {
    expect(findMatches('xx ab ab', 'ab', { caseSensitive: true })).toEqual([
      { from: 3, to: 5 },
      { from: 6, to: 8 }
    ])
  })
  it('returns nothing for an empty query', () => {
    expect(findMatches('abc', '', { caseSensitive: false })).toEqual([])
  })
  it('matches Korean text', () => {
    expect(findMatches('안녕 안녕', '안녕', { caseSensitive: false })).toHaveLength(2)
  })
  it('treats regex metacharacters literally', () => {
    expect(findMatches('a.b a*b axb', 'a.b', { caseSensitive: true })).toHaveLength(1)
    expect(findMatches('(x) [y] $z', '(x)', { caseSensitive: true })).toHaveLength(1)
    expect(findMatches('1+1=2', '1+1', { caseSensitive: true })).toHaveLength(1)
  })
  it('does not return overlapping matches', () => {
    expect(findMatches('aaa', 'aa', { caseSensitive: true })).toEqual([{ from: 0, to: 2 }])
  })
})
