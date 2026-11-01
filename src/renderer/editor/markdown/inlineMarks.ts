import {
  Mark,
  mergeAttributes,
  type Extensions,
  type JSONContent,
  type MarkdownLexerConfiguration,
  type MarkdownParseHelpers,
  type MarkdownRendererHelpers,
  type MarkdownToken,
  type MarkdownTokenizer
} from '@tiptap/core'

/**
 * Inline formats with no CommonMark syntax of their own. They are saved the way most editors do:
 * superscript and subscript as <sup>/<sub> tags (like the underline TipTap already writes as <u>),
 * and highlight as ==text==. Everything else about the document stays untouched.
 */

const parseMark = (name: string) => (token: MarkdownToken, h: MarkdownParseHelpers) => h.applyMark(name, h.parseInline(token.tokens ?? []))
const renderWrapped = (open: string, close: string) => (node: JSONContent, h: MarkdownRendererHelpers) => `${open}${h.renderChildren(node)}${close}`

/** Finds the matching closing tag, skipping code spans and backslash escapes inside. */
function tagTokenizer(tag: 'sup' | 'sub', name: string): MarkdownTokenizer {
  const open = `<${tag}>`
  const close = `</${tag}>`
  return {
    name,
    level: 'inline',
    start: (src: string) => src.toLowerCase().indexOf(open),
    tokenize: (src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) => {
      if (src.slice(0, open.length).toLowerCase() !== open) return undefined
      const delimiters = new RegExp(`\\\\[\\s\\S]|\`+|${close}`, 'gi')
      delimiters.lastIndex = open.length
      let m = delimiters.exec(src)
      while (m) {
        if (m[0].startsWith('`')) {
          const span = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(src.slice(m.index))
          if (span) delimiters.lastIndex = m.index + span[0].length
        } else if (!m[0].startsWith('\\')) {
          const text = src.slice(open.length, m.index)
          if (!text) return undefined
          return { type: name, raw: src.slice(0, delimiters.lastIndex), text, tokens: lexer.inlineTokens(text) }
        }
        m = delimiters.exec(src)
      }
      return undefined
    }
  }
}

export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: ({ HTMLAttributes }) => ['sup', mergeAttributes(HTMLAttributes), 0],
  parseMarkdown: parseMark('superscript'),
  renderMarkdown: renderWrapped('<sup>', '</sup>'),
  markdownTokenizer: tagTokenizer('sup', 'superscript')
})

export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML: () => [{ tag: 'sub' }],
  renderHTML: ({ HTMLAttributes }) => ['sub', mergeAttributes(HTMLAttributes), 0],
  parseMarkdown: parseMark('subscript'),
  renderMarkdown: renderWrapped('<sub>', '</sub>'),
  markdownTokenizer: tagTokenizer('sub', 'subscript')
})

/** ==text==: the opening marks must hug the text, so "a == b" and "=== rule" stay plain text. */
const HIGHLIGHT = /^==(?=[^\s=])((?:\\[\s\S]|[^=\\\n]|=(?!=))*?[^\s=\\])==(?!=)/

export const Highlight = Mark.create({
  name: 'highlight',
  parseHTML: () => [{ tag: 'mark' }],
  renderHTML: ({ HTMLAttributes }) => ['mark', mergeAttributes(HTMLAttributes), 0],
  parseMarkdown: parseMark('highlight'),
  renderMarkdown: renderWrapped('==', '=='),
  markdownTokenizer: {
    name: 'highlight',
    level: 'inline',
    start: (src: string) => src.indexOf('=='),
    tokenize: (src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) => {
      const m = HIGHLIGHT.exec(src)
      return m ? { type: 'highlight', raw: m[0], text: m[1], tokens: lexer.inlineTokens(m[1]) } : undefined
    }
  }
})

export const inlineMarks: Extensions = [Superscript, Subscript, Highlight]
