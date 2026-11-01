// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markdownToHtml, normalizeMarkdown } from '../../src/renderer/editor/markdown/codec'

describe('underline, superscript, subscript and highlight', () => {
  it.each([
    ['underline', 'a <u>under</u> b\n', '<u>'],
    ['superscript', 'x<sup>2</sup> here\n', '<sup>'],
    ['subscript', 'H<sub>2</sub>O\n', '<sub>'],
    ['highlight', 'mark ==this== please\n', '<mark>']
  ])('%s is shown as a real format and saved back in the same form', (_n, md, tag) => {
    expect(markdownToHtml(md)).toContain(tag)
    expect(normalizeMarkdown(md)).toBe(md)
  })

  it('keeps combinations such as bold inside a highlight', () => {
    expect(normalizeMarkdown('==**bold** text==\n')).toBe('==**bold** text==\n')
    const out = normalizeMarkdown('<u>**x**</u> <sup>*y*</sup>\n')
    expect(out).toMatch(/<u>/)
    expect(out).toMatch(/<sup>.*<\/sup>/)
    expect(normalizeMarkdown(out)).toBe(out) // stable once written
  })

  it('leaves ordinary text with equals signs alone', () => {
    for (const md of ['a == b and c == d\n', '=== not a mark\n', 'x ==\n', 'if (a==b) return\n', '1 == 1 == 1\n']) {
      expect(markdownToHtml(md)).not.toContain('<mark>')
      expect(normalizeMarkdown(md).trimEnd()).toBe(md.trimEnd())
    }
  })

  it('does not treat tags inside code as formats', () => {
    expect(markdownToHtml('`<sup>x</sup>` and `==y==`\n')).not.toMatch(/<sup>|<mark>/)
    expect(normalizeMarkdown('`<sup>x</sup>` and `==y==`\n')).toBe('`<sup>x</sup>` and `==y==`\n')
  })

  it('a stray or empty tag stays as it was written', () => {
    expect(normalizeMarkdown('open <sup>never closed\n')).toContain('<sup>')
    expect(normalizeMarkdown('empty <sub></sub> tag\n')).toContain('<sub></sub>')
  })

  it('superscript and subscript do not combine on the same text', () => {
    const out = normalizeMarkdown('<sup><sub>x</sub></sup>\n')
    expect(out).not.toBe('')
  })
})
