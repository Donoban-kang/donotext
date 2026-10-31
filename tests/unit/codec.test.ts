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

  it('never starts the output with blank lines', () => {
    expect(normalizeMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n').startsWith('|')).toBe(true)
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

  it('keeps unsafe link and image targets in the saved markdown (only rendering neutralises them)', () => {
    const out = normalizeMarkdown('[x](javascript:alert(1)) and ![y](file:///etc/passwd) and [ok](https://ok.example)\n')
    expect(out).toContain('javascript:alert(1)')
    expect(out).toContain('file:///etc/passwd')
    expect(out).toContain('https://ok.example')
  })

  it('renders unsafe targets inertly in HTML while keeping the link text', () => {
    const html = markdownToHtml('[x](javascript:alert(1)) and [y](https://ok.example) ![z](javascript:alert(1))\n')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('x')
    expect(html).toContain('https://ok.example')
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

describe('front matter', () => {
  it('survives a roundtrip unchanged and keeps the body', () => {
    const md = '---\ntitle: 제목\ntags: [a, b]\n---\n\n# 본문\n'
    const out = normalizeMarkdown(md)
    expect(out.startsWith('---\ntitle: 제목\ntags: [a, b]\n---\n')).toBe(true)
    expect(out).toContain('# 본문')
    expect(normalizeMarkdown(out)).toBe(out)
  })
  it('keeps a document that is only front matter', () => {
    const out = normalizeMarkdown('---\na: 1\n---\n')
    expect(out).toBe('---\na: 1\n---\n')
  })
  it('does not treat a horizontal rule in the middle of the text as front matter', () => {
    const out = normalizeMarkdown('# t\n\n---\n\ntext\n')
    expect(out).toContain('# t')
    expect(out).toContain('text')
    expect(out.startsWith('---')).toBe(false)
  })
  it('is left out of HTML export', () => {
    const html = markdownToHtml('---\nsecret: x\n---\n\n# Title\n')
    expect(html).toContain('<h1')
    expect(html).not.toContain('secret')
  })
})

describe('math', () => {
  it('round-trips inline and block formulas verbatim', () => {
    const md = '질량 $E=mc^2$ 은\n\n$$\n\\int_0^1 x\\,dx = \\frac12\n$$\n\n끝\n'
    const out = normalizeMarkdown(md)
    expect(out).toContain('$E=mc^2$')
    expect(out).toContain('$$\n\\int_0^1 x\\,dx = \\frac12\n$$')
    expect(normalizeMarkdown(out)).toBe(out)
  })
  it('accepts a one-line $$ block', () => {
    expect(normalizeMarkdown('$$x^2$$\n')).toContain('$$\nx^2\n$$')
  })
  it('does not turn prices into formulas', () => {
    const out = normalizeMarkdown('사과는 $5 이고 배는 $10 입니다.\n')
    expect(out).toContain('$5')
    expect(out).toContain('$10')
    expect(markdownToHtml('사과는 $5 이고 배는 $10 입니다.\n')).not.toContain('data-latex')
  })
  it('keeps escaped dollar signs literal and stable', () => {
    const once = normalizeMarkdown('\\$a\\$ 는 수식이 아닙니다\n')
    expect(once).not.toContain('data-latex')
    expect(normalizeMarkdown(once)).toBe(once)
    expect(markdownToHtml(once)).not.toContain('data-latex')
  })
  it('does not interpret $ inside inline code or code blocks', () => {
    const md = '`$x$` 와\n\n```\n$y$\n$$\nz\n$$\n```\n'
    const out = normalizeMarkdown(md)
    expect(out).toContain('`$x$`')
    expect(out).toContain('$y$')
    expect(markdownToHtml(md)).not.toContain('data-latex')
  })
  it('exposes the formula for HTML export instead of dropping it', () => {
    const html = markdownToHtml('값 $a_1$ 입니다\n\n$$\nb\n$$\n')
    expect(html).toContain('data-latex="a_1"')
    expect(html).toContain('data-latex="b"')
  })
  it('does not throw on malformed formulas and keeps their source', () => {
    const out = normalizeMarkdown('깨진 $\\frac{1$ 수식\n')
    expect(out).toContain('\\frac{1')
  })
})

