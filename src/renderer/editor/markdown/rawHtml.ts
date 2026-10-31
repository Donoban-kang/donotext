import { Node } from '@tiptap/core'

/**
 * Raw HTML in markdown is kept verbatim but never interpreted: it is shown as literal
 * text, so nothing in it can execute, and it round-trips unchanged on save.
 */
export interface HtmlToken {
  raw?: string
  text?: string
  block?: boolean
}

export const htmlSource = (t: HtmlToken): string => (t.raw ?? t.text ?? '').replace(/\n+$/, '')

export const RawHtmlBlock = Node.create({
  name: 'rawHtmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'pre[data-raw-html]', preserveWhitespace: 'full' }]
  },
  renderHTML({ node }) {
    return ['pre', { 'data-raw-html': '' }, String(node.attrs.source)]
  },
  markdownTokenName: 'html',
  parseMarkdown(token: HtmlToken) {
    if (token.block === false) return []
    return { type: 'rawHtmlBlock', attrs: { source: htmlSource(token) } }
  },
  renderMarkdown(node: { attrs?: { source?: string } }) {
    return node.attrs?.source ?? ''
  }
})

export const RawHtmlInline = Node.create({
  name: 'rawHtmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { source: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'code[data-raw-html]' }]
  },
  renderHTML({ node }) {
    return ['code', { 'data-raw-html': '' }, String(node.attrs.source)]
  },
  markdownTokenName: 'html',
  parseMarkdown(token: HtmlToken) {
    if (token.block !== false) return []
    return { type: 'rawHtmlInline', attrs: { source: htmlSource(token) } }
  },
  renderMarkdown(node: { attrs?: { source?: string } }) {
    return node.attrs?.source ?? ''
  }
})
