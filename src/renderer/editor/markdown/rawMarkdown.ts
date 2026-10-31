import { Node } from '@tiptap/core'

/**
 * Markdown the editor has no rich form for is kept verbatim as an inert atom, so saving never
 * deletes or rewrites it: link reference definitions (`[id]: https://…`), footnote definitions
 * (`[^1]: note`) and footnote references (`[^1]`).
 */
interface Token {
  raw?: string
  text?: string
}

const source = (t: Token): string => (t.raw ?? t.text ?? '').replace(/\n+$/, '')

// "[^label]: text" plus following lines indented by 4+ spaces or a tab (blank lines allowed between).
const FOOTNOTE_DEF = /^\[\^[^\]\s]+\]:[^\n]*(?:\n(?:[ \t]{4,}[^\n]*|\n(?=[ \t]{4,}\S)))*(?:\n|$)/
const FOOTNOTE_REF = /^\[\^[^\]\s]+\]/

export const RawMarkdownBlock = Node.create({
  name: 'rawMarkdownBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'pre[data-raw-markdown]', preserveWhitespace: 'full' }]
  },
  renderHTML({ node }) {
    return ['pre', { 'data-raw-markdown': '' }, String(node.attrs.source)]
  },
  // marked's own `def` token covers `[id]: url`; the tokenizer below adds footnote definitions to it.
  markdownTokenName: 'def',
  markdownTokenizer: {
    name: 'footnoteDef',
    level: 'block',
    start: (src: string) => src.search(/^\[\^[^\]\s]+\]:/m),
    tokenize: (src: string) => {
      const m = FOOTNOTE_DEF.exec(src)
      return m ? { type: 'def', raw: m[0], text: m[0] } : undefined
    }
  },
  parseMarkdown: (token: Token) => ({ type: 'rawMarkdownBlock', attrs: { source: source(token) } }),
  renderMarkdown: (node: { attrs?: { source?: string } }) => node.attrs?.source ?? ''
})

export const RawMarkdownInline = Node.create({
  name: 'rawMarkdownInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { source: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'code[data-raw-markdown]' }]
  },
  renderHTML({ node }) {
    return ['code', { 'data-raw-markdown': '' }, String(node.attrs.source)]
  },
  markdownTokenName: 'footnoteRef',
  markdownTokenizer: {
    name: 'footnoteRef',
    level: 'inline',
    start: (src: string) => src.indexOf('[^'),
    tokenize: (src: string) => {
      const m = FOOTNOTE_REF.exec(src)
      return m ? { type: 'footnoteRef', raw: m[0], text: m[0] } : undefined
    }
  },
  parseMarkdown: (token: Token) => ({ type: 'rawMarkdownInline', attrs: { source: source(token) } }),
  renderMarkdown: (node: { attrs?: { source?: string } }) => node.attrs?.source ?? ''
})
