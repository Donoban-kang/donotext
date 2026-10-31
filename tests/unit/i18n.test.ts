import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { scan } from '../../scripts/i18nScan.mjs'
import { ko } from '../../src/renderer/app/i18n/ko'
import { t } from '../../src/renderer/app/i18n'

describe('UI strings', () => {
  it('has no hard-coded Korean outside the translation table', () => {
    expect(scan('src')).toEqual([])
  })
  it('substitutes placeholders and keeps unknown ones visible', () => {
    expect(t('confirmUnsavedTitle', { name: '메모.md' })).toBe('"메모.md"의 변경 내용을 저장할까요?')
    expect(t('confirmUnsavedTitle')).toContain('{name}')
  })
  it('uses every placeholder consistently (no stray braces)', () => {
    for (const [key, text] of Object.entries(ko)) {
      expect(text.replace(/\{\w+\}/g, ''), key).not.toMatch(/[{}]/)
    }
  })
})
