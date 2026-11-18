// @vitest-environment jsdom
// The editor reads some list indentations as extra nesting. Converted lists must survive its Markdown round trip.
import { describe, expect, it } from 'vitest'
import { normalizeListIndent } from '../../src/main/import/listIndent'
import { convertHtml } from '../../src/main/import/htmlConvert'
import { layoutPdf, type PdfPageInput, type PdfTextItem } from '../../src/main/import/pdfLayout'
import { normalizeMarkdown } from '../../src/renderer/editor/markdown/codec'

const indents = (md: string): number[] => md.split('\n').filter((l) => /^\s*([-*+]|\d+\.)\s/.test(l)).map((l) => l.length - l.trimStart().length)

describe('normalizeListIndent', () => {
  it('puts children at the parent content offset', () => {
    expect(normalizeListIndent('1.  one\n    -   sub1\n    -   sub2\n2.  two')).toBe('1. one\n   - sub1\n   - sub2\n2. two')
    expect(normalizeListIndent('-   a\n    -   b\n        1.  c')).toBe('- a\n  - b\n    1. c')
  })
  it('keeps text that belongs to an item with its item, and leaves code and plain text alone', () => {
    expect(normalizeListIndent('1.  one\n\n    continued\n\ntext')).toBe('1. one\n\n   continued\n\ntext')
    expect(normalizeListIndent('```\n    - not a list\n```')).toBe('```\n    - not a list\n```')
  })
})

describe('converted lists survive the editor round trip', () => {
  const W = 595
  const H = 842
  const run = (text: string, top: number, x: number): PdfTextItem => ({ str: text, x, y: H - top, width: text.length * 10, height: 10 })
  const page = (...items: PdfTextItem[]): PdfPageInput => ({ width: W, height: H, items })

  it('PDF: numbered parent with sibling bullets and a grandchild', () => {
    const md = layoutPdf([
      page(
        run('1. 관련 근거', 100, 56),
        run('2. 점검을 추진합니다.', 120, 56),
        run('가. 점검 기간: 5월', 140, 71),
        run('나. 점검 대상: 전체', 160, 71),
        run('○ 세부 내용입니다', 180, 86),
        run('○ 붙임 참조', 200, 86),
        run('3. 끝', 220, 56)
      )
    ]).markdown
    expect(indents(normalizeMarkdown(md))).toEqual(indents(md))
  })

  it('HTML/Word: nested ordered and bullet lists keep their structure', () => {
    const md = convertHtml(new TextEncoder().encode('<ol><li>하나<ul><li>가</li><li>나<ul><li>다</li></ul></li></ul></li><li>둘</li></ol>')).markdown
    expect(md).toBe('1. 하나\n   - 가\n   - 나\n     - 다\n2. 둘\n')
    expect(normalizeMarkdown(md)).toBe(md)
  })
})
