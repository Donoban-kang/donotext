// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { markdownToHtml, normalizeMarkdown, parseMarkdown } from '../../src/renderer/editor/markdown/codec'

/**
 * Editing one character in the WYSIWYG view and saving must never change what a document MEANS.
 * Notation may change (`*` → `-`), meaning may not: re-reading what we write has to give the same
 * document as reading the original.
 */
const model = (md: string): string => JSON.stringify(parseMarkdown(md).content ?? [])

const cases: Record<string, string> = {
  'escaped ordered-list marker': '1\\. not a list\n',
  'escaped year at line start': '2024\\. was a good year\n',
  'escaped heading marker': '\\# not a heading\n',
  'escaped bullet markers': '\\- not a list\n\n\\* neither\n\n\\+ nor this\n',
  'escaped quote marker': '\\> not a quote\n',
  'escaped marker on a second line of a paragraph': 'first line\n\\- not a list item\n',
  'escaped emphasis': '\\*not italic\\* and \\_not italic\\_\n',
  'escaped brackets': '\\[not a link\\](x)\n',
  'escaped backtick': 'a \\`b\\` c\n',
  'escaped pipe in a table': '| a | b |\n| --- | --- |\n| x \\| y | z |\n',
  'escaped backslash': 'a \\\\ b\n',
  'footnote reference and definition': 'text[^1] more\n\n[^1]: the note\n',
  'footnote with several lines': 'x[^note]\n\n[^note]: first line\n    continued line\n',
  'link reference definition used': '[site][ref]\n\n[ref]: https://example.com "Title"\n',
  'link reference definition unused': 'plain text\n\n[unused]: https://example.com\n',
  'named entities': 'a &amp; b &lt;tag&gt; &copy; 2024\n',
  'non-breaking space entity': 'a&nbsp;b\n',
  'image with spaces in the path': '![pic](<assets/a b.png>)\n',
  'link with spaces in the target': '[doc](<my notes/a b.md>)\n',
  'link target with parentheses': '[x](https://en.wikipedia.org/wiki/Foo_(bar))\n',
  'unsafe link target is kept': '[click](javascript:alert(1))\n',
  'unsafe image source is kept': '![x](file:///etc/passwd)\n',
  'data link is kept': '[x](data:text/html,hello)\n',
  'hard line break': 'line one  \nline two\n',
  'nested emphasis': '**bold *and italic* text** and ~~gone~~\n',
  'code span with backticks': '`` a`b ``\n',
  'autolink': '<https://example.com> and <me@example.com>\n',
  'html comment': '<!-- keep me -->\n\ntext\n',
  'nested lists with code': '- a\n  - b\n\n    ```js\n    x\n    ```\n',
  'ordered list from 3': '3. three\n4. four\n',
  'task list': '- [ ] todo\n- [x] done\n',
  'blockquote with list': '> - a\n> - b\n',
  'setext-looking text with equals': 'not a heading\n=== still text\n',
  'dollar prices': 'costs $5 and $10\n',
  'korean mix': '한글 **굵게** `코드` [링크](https://예시.kr)\n'
}

describe('what a document means survives an edit-and-save roundtrip', () => {
  for (const [name, md] of Object.entries(cases)) {
    it(name, () => {
      const out = normalizeMarkdown(md)
      expect(model(out), `output was:\n${out}`).toBe(model(md))
      expect(normalizeMarkdown(out), 'second pass must not change anything').toBe(out)
    })
  }
})

describe('nothing is deleted from the file', () => {
  it('keeps unsafe link and image targets in the saved markdown', () => {
    const out = normalizeMarkdown('[a](javascript:alert(1)) ![b](file:///etc/passwd) [c](data:text/html,x)\n')
    expect(out).toContain('javascript:alert(1)')
    expect(out).toContain('file:///etc/passwd')
    expect(out).toContain('data:text/html,x')
  })
  it('keeps footnote definitions and unused reference definitions', () => {
    const out = normalizeMarkdown('a[^1]\n\n[^1]: note\n\n[unused]: https://example.com\n')
    expect(out).toContain('[^1]: note')
    expect(out).toContain('[unused]: https://example.com')
    expect(out).not.toContain('[^1](')
  })
  it('writes escaped markers back escaped', () => {
    expect(normalizeMarkdown('1\\. not a list\n')).toContain('1\\.')
    expect(normalizeMarkdown('\\# not a heading\n')).toContain('\\#')
  })
  it('does not turn entities into literal text', () => {
    const out = normalizeMarkdown('a &amp; b\n')
    expect(out).not.toContain('&amp;amp;')
  })
})

describe('display and export still neutralise dangerous targets', () => {
  it('markdownToHtml never emits javascript:, file: or data:text/html targets', () => {
    const html = markdownToHtml('[a](javascript:alert(1)) ![b](file:///etc/passwd) [c](data:text/html,x) ![d](javascript:x)\n')
    expect(html).not.toMatch(/javascript:|file:\/\/|data:text\/html/i)
    expect(html).toContain('a')
  })
})
