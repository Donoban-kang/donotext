// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { markdownToHtml, normalizeMarkdown } from '../../src/renderer/editor/markdown/codec'

const dir = join(__dirname, '../fixtures/corpus')
const corpus = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, md: readFileSync(join(dir, f), 'utf8') }))

describe('normalizeMarkdown', () => {
  it.each(corpus)('is idempotent for $name', ({ md }) => {
    const once = normalizeMarkdown(md)
    expect(normalizeMarkdown(once)).toBe(once)
  })

  it('returns an empty string for an empty document', () => {
    expect(normalizeMarkdown('')).toBe('')
  })

  it('preserves headings, table rows, code content and Korean text', () => {
    const get = (n: string): string => normalizeMarkdown(corpus.find((c) => c.name === n)!.md)
    expect(get('headings.md').match(/^#{1,3} /gm)).toHaveLength(3)
    expect(get('table.md').match(/^\|/gm)).toHaveLength(5)
    expect(get('code.md')).toContain('const answer: number = 42')
    expect(get('code.md')).toContain('```')
    expect(get('korean.md')).toContain('한글 본문입니다')
    expect(get('lists.md')).toContain('중첩 2')
    expect(get('tasks.md')).toMatch(/- \[x\] 끝낸 일/)
  })

  it('drops unsafe link targets but keeps the link text', () => {
    const out = normalizeMarkdown('[x](javascript:alert(1)) and [y](https://ok.example)')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('x')
    expect(out).toContain('https://ok.example')
  })

  it('drops unsafe image sources', () => {
    expect(normalizeMarkdown('![a](javascript:alert(1))')).not.toContain('javascript:')
  })

  it('round-trips block and inline raw HTML verbatim', () => {
    expect(normalizeMarkdown('<div>hi</div>\n')).toContain('<div>hi</div>')
    const inline = normalizeMarkdown('press <kbd>Ctrl</kbd> now\n')
    expect(inline).toContain('<kbd>')
    expect(inline).toContain('Ctrl')
    expect(inline).toContain('</kbd>')
  })

  it('does not throw on raw HTML and keeps it as inert text', () => {
    const out = normalizeMarkdown('<script>alert(1)</script>\n')
    expect(out).toContain('alert(1)')
  })
})

describe('markdownToHtml', () => {
  it('renders headings, tables and code blocks as HTML elements', () => {
    const html = markdownToHtml('# T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```\ncode\n```\n')
    expect(html).toContain('<h1')
    expect(html).toContain('<table')
    expect(html).toContain('<pre')
  })
  it('never emits an executable script element or javascript: href from hostile markdown', () => {
    const html = markdownToHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).not.toMatch(/<img[^>]*onerror/i)
  })
})
