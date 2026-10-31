import { Node } from '@tiptap/core'

/** The YAML block at the top of a document, editable as plain text and written back verbatim. */
export const FrontMatter = Node.create({
  name: 'frontMatter',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'pre[data-front-matter]', preserveWhitespace: 'full' }]
  },
  renderHTML() {
    return ['pre', { 'data-front-matter': '' }, 0]
  }
})
