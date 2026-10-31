import { describe, expect, it } from 'vitest'
import { merge3 } from '../../src/renderer/editor/merge3'

const t = (...lines: string[]): string => lines.join('\n')

describe('merge3', () => {
  const base = t('# 제목', '', '본문', '')

  it('takes the other side when only one side changed', () => {
    expect(merge3(base, base, t('# 제목', '', '본문', '', '원격', ''))).toBe(t('# 제목', '', '본문', '', '원격', ''))
    expect(merge3(base, t('# 제목', '', '본문한', ''), base)).toBe(t('# 제목', '', '본문한', ''))
  })
  it('combines edits that touch different places', () => {
    const local = t('# 제목', '', '본문한', '')
    const remote = t('# 제목', '', '본문', '', '원격 문단', '')
    expect(merge3(base, local, remote)).toBe(t('# 제목', '', '본문한', '', '원격 문단', ''))
  })
  it('combines an edit at the start with one at the end', () => {
    const b = t('a', 'b', 'c')
    expect(merge3(b, t('A', 'b', 'c'), t('a', 'b', 'C'))).toBe(t('A', 'b', 'C'))
  })
  it('keeps one copy when both sides made the same change', () => {
    const same = t('a', 'X', 'c')
    expect(merge3(t('a', 'b', 'c'), same, same)).toBe(same)
    expect(merge3(t('a', 'b', 'c'), t('a', 'X', 'c', 'd'), t('a', 'X', 'c'))).toBe(t('a', 'X', 'c', 'd'))
  })
  it('reports a conflict when both sides changed the same line differently', () => {
    expect(merge3(t('a', 'b', 'c'), t('a', 'LOCAL', 'c'), t('a', 'REMOTE', 'c'))).toBeNull()
  })
  it('reports a conflict for two different insertions at the same spot', () => {
    expect(merge3(t('a', 'c'), t('a', 'x', 'c'), t('a', 'y', 'c'))).toBeNull()
  })
  it('does not treat neighbouring edits as a conflict', () => {
    expect(merge3(t('a', 'b', 'c'), t('a', 'B', 'c'), t('a', 'b', 'c', 'd'))).toBe(t('a', 'B', 'c', 'd'))
    expect(merge3(t('a', 'b', 'c'), t('a', 'b', 'C'), t('0', 'a', 'b', 'c'))).toBe(t('0', 'a', 'b', 'C'))
  })
  it('handles deletions and empty inputs', () => {
    expect(merge3(t('a', 'b', 'c'), t('a', 'c'), t('a', 'b', 'c', 'd'))).toBe(t('a', 'c', 'd'))
    expect(merge3('', 'x', '')).toBe('x')
    expect(merge3('', '', 'y')).toBe('y')
    expect(merge3('', 'x', 'y')).toBeNull()
  })
  it('works with Korean text and long documents', () => {
    const lines = Array.from({ length: 400 }, (_, i) => `줄 ${i}`)
    const local = [...lines]
    local[10] = '줄 10 수정'
    const remote = [...lines]
    remote[390] = '줄 390 수정'
    const merged = merge3(lines.join('\n'), local.join('\n'), remote.join('\n'))!.split('\n')
    expect(merged[10]).toBe('줄 10 수정')
    expect(merged[390]).toBe('줄 390 수정')
    expect(merged).toHaveLength(400)
  })
})
