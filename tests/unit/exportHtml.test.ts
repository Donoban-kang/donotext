// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildExportHtml } from '../../src/renderer/editor/exportHtml'

const hostile = [
  '<script>alert(1)</script>',
  '',
  '[click](javascript:alert(1))',
  '',
  '<img src=x onerror=alert(1)>',
  '',
  '<iframe src="https://evil.example"></iframe>',
  '',
  '<style>body{display:none}</style>',
  '',
  '<svg onload=alert(1)><circle/></svg>',
  '',
  '<a href="JaVaScRiPt:alert(1)" onclick="alert(1)">x</a>',
  '',
  '<form action="https://evil.example"><input name=a></form>',
  ''
].join('\n')

describe('buildExportHtml', () => {
  it('produces a complete, self-contained HTML document', () => {
    const html = buildExportHtml('# 제목\n\n본문\n', '내 문서')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<title>내 문서</title>')
    expect(html).toContain('<h1')
    expect(html).toContain('본문')
    expect(html).toContain('Content-Security-Policy')
  })

  it('removes scripts, event handlers, javascript: links, frames, styles, forms and svg handlers', () => {
    const html = buildExportHtml(hostile, 't')
    const body = html.slice(html.indexOf('<body'))
    expect(body).not.toMatch(/<script/i)
    expect(body).not.toMatch(/onerror|onload|onclick/i)
    expect(body).not.toMatch(/javascript:/i)
    expect(body).not.toMatch(/<iframe|<style|<form|<input/i)
    expect(body).toContain('click') // the link text survives
  })

  it('renders harmless raw HTML from the markdown instead of showing its source', () => {
    const html = buildExportHtml('<div class="note">안내 <kbd>Ctrl</kbd></div>\n\n눌러 <kbd>Enter</kbd> 하세요\n', 't')
    expect(html).toContain('<div class="note">')
    expect(html).toContain('<kbd>Ctrl</kbd>')
    expect(html).toContain('<kbd>Enter</kbd>')
    expect(html).not.toContain('&lt;div')
  })

  it('escapes special characters in the title', () => {
    const html = buildExportHtml('x', '<b>"a" & b</b>')
    expect(html).toContain('<title>&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;</title>')
    expect(html).not.toContain('<title><b>')
  })

  it('renders tables, code blocks and task lists as elements', () => {
    const html = buildExportHtml('| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```ts\nconst x = 1\n```\n\n- [x] done\n', 't')
    expect(html).toContain('<table')
    expect(html).toContain('<pre')
    expect(html).toContain('const x = 1')
    expect(html).toMatch(/type="checkbox"|data-type="taskList"/)
  })

  it('renders formulas as MathML without needing fonts or scripts', () => {
    const html = buildExportHtml('값 $E=mc^2$ 와\n\n$$\n\\frac{a}{b}\n$$\n', 't')
    expect((html.match(/<math/g) ?? []).length).toBe(2)
    expect(html).not.toContain('data-latex')
    expect(html).not.toContain('class="katex"') // MathML only
  })

  it('keeps hostile TeX inert', () => {
    const html = buildExportHtml('$\\href{javascript:alert(1)}{x}$\n', 't')
    expect(html).not.toMatch(/href="javascript/i)
    expect(html).not.toMatch(/<script/i)
  })

  it('leaves front matter out of the document', () => {
    const html = buildExportHtml('---\nsecret: token\n---\n\n# 본문\n', 't')
    expect(html).not.toContain('secret')
    expect(html).toContain('본문')
  })

  it('is valid for an empty document', () => {
    const html = buildExportHtml('', 'empty')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<body>')
  })

  it('keeps ordinary links and images from http(s) and relative paths', () => {
    const html = buildExportHtml('[a](https://example.com) ![b](assets/a.png) ![c](https://example.com/c.png)\n', 't')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('src="assets/a.png"')
    expect(html).toContain('src="https://example.com/c.png"')
  })
})
