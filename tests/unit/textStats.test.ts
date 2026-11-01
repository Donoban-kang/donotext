import { describe, expect, it } from 'vitest'
import { computeStats, formatBytes } from '../../src/shared/textStats'

describe('computeStats', () => {
  it('counts words, characters and paragraphs of mixed Korean and English text', () => {
    const s = computeStats('# 제목\n\n오늘은 맑음 sunny day\n\n- 항목', 'lf', false)
    expect(s.words).toBe(6) // 제목, 오늘은, 맑음, sunny, day, 항목 ("#" and "-" do not count)
    expect(s.paragraphs).toBe(3)
    expect(s.chars).toBe(s.charsWithSpaces - 9) // 5 spaces + 4 line breaks removed
  })
  it('counts an emoji as one character, not two', () => {
    expect(computeStats('a😀b', 'lf', false).charsWithSpaces).toBe(3)
  })
  it('measures bytes as the file would be saved: UTF-8, CRLF and BOM included', () => {
    expect(computeStats('가', 'lf', false).bytes).toBe(3)
    expect(computeStats('a\nb', 'crlf', false).bytes).toBe(4)
    expect(computeStats('a', 'lf', true).bytes).toBe(4)
  })
  it('handles empty and whitespace-only text', () => {
    expect(computeStats('', 'lf', false)).toEqual({ words: 0, chars: 0, charsWithSpaces: 0, paragraphs: 0, bytes: 0 })
    expect(computeStats('  \n\n \n', 'lf', false).paragraphs).toBe(0)
  })
})

describe('formatBytes', () => {
  it('groups digits and adds KB/MB only when large enough', () => {
    expect(formatBytes(999)).toEqual({ exact: '999', approx: null })
    expect(formatBytes(2048)).toEqual({ exact: '2,048', approx: '2.0 KB' })
    expect(formatBytes(5 * 1024 * 1024)).toEqual({ exact: '5,242,880', approx: '5.0 MB' })
  })
})
