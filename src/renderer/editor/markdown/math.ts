import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import katex from 'katex'

// Pandoc-style: the opening $ is followed by a non-space, the closing $ follows a non-space
// and is not followed by a digit, so "$5 and $10" stays plain text.
const INLINE = /^\$(?=\S)((?:\\.|[^$\n\\])+?)(?<!\s)\$(?!\d)/
const BLOCK_FENCED = /^\$\$[ \t]*\n([\s\S]+?)\n\$\$[ \t]*(?:\n|$)/
const BLOCK_ONE_LINE = /^\$\$([^\n$]+?)\$\$[ \t]*(?:\n|$)/

/** True when plain text would be read back as math, so its dollar signs must be escaped on save. */
export function wouldParseAsMath(text: string): boolean {
  if (!text.includes('$')) return false
  if (text.includes('$$')) return true
  for (let i = text.indexOf('$'); i >= 0; i = text.indexOf('$', i + 1)) {
    if (i > 0 && text[i - 1] === '\\') continue
    if (INLINE.test(text.slice(i))) return true
  }
  return false
}

interface MathToken {
  raw?: string
  text?: string
}

/** Renders a formula safely: invalid TeX is shown as source, never thrown and never trusted. */
export function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode, trust: false, strict: 'ignore' })
  } catch {
    return ''
  }
}

function mathNodeView(displayMode: boolean) {
  return ({ node, getPos, editor }: { node: PMNode; getPos: () => number | undefined; editor: import('@tiptap/core').Editor }) => {
    const dom = document.createElement(displayMode ? 'div' : 'span')
    dom.className = displayMode ? 'dn-math dn-math-block' : 'dn-math dn-math-inline'
    let current = node
    let editing = false

    const show = (): void => {
      editing = false
      const latex = String(current.attrs.latex ?? '')
      dom.innerHTML = latex.trim() ? renderLatex(latex, displayMode) : ''
      if (!latex.trim()) dom.textContent = '수식을 입력하세요 (더블클릭)'
      dom.title = latex
    }

    const startEdit = (): void => {
      if (editing || !editor.isEditable) return
      editing = true
      const field = document.createElement(displayMode ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement
      field.className = 'dn-math-input'
      field.value = String(current.attrs.latex ?? '')
      field.setAttribute('aria-label', '수식 입력')
      dom.replaceChildren(field)
      field.focus()
      let done = false
      const commit = (save: boolean): void => {
        if (done) return
        done = true
        const pos = getPos()
        if (save && typeof pos === 'number' && field.value !== current.attrs.latex) {
          editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { latex: field.value }))
        }
        show()
        editor.commands.focus()
      }
      field.addEventListener('blur', () => commit(true))
      field.addEventListener('keydown', (e) => {
        const ev = e as KeyboardEvent
        if (ev.key === 'Escape') commit(false)
        else if (ev.key === 'Enter' && (!displayMode || ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault()
          commit(true)
        }
        ev.stopPropagation()
      })
    }

    dom.addEventListener('dblclick', startEdit)
    show()
    return {
      dom,
      update(n: PMNode) {
        if (n.type !== current.type) return false
        current = n
        if (!editing) show()
        return true
      },
      stopEvent: () => editing,
      ignoreMutation: () => true
    }
  }
}

const latexAttr = {
  latex: {
    default: '',
    parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') ?? '',
    renderHTML: () => ({})
  }
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return latexAttr
  },
  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }]
  },
  renderHTML({ node }) {
    const latex = String(node.attrs.latex)
    return ['span', mergeAttributes({ 'data-math-inline': '', 'data-latex': latex, class: 'math-inline' }), `$${latex}$`]
  },
  markdownTokenName: 'mathInline',
  markdownTokenizer: {
    name: 'mathInline',
    level: 'inline',
    start: (src: string) => {
      for (let i = src.indexOf('$'); i >= 0; i = src.indexOf('$', i + 1)) if (i === 0 || src[i - 1] !== '\\') return i
      return -1
    },
    tokenize: (src: string) => {
      const m = INLINE.exec(src)
      return m ? { type: 'mathInline', raw: m[0], text: m[1] } : undefined
    }
  },
  parseMarkdown: (token: MathToken) => ({ type: 'mathInline', attrs: { latex: token.text ?? '' } }),
  renderMarkdown: (node: { attrs?: { latex?: string } }) => `$${node.attrs?.latex ?? ''}$`,
  addNodeView() {
    return mathNodeView(false)
  },
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[\s(])\$(?=\S)([^$\n]*[^\s$])\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1]
          const start = range.from + match[0].indexOf('$')
          state.tr.replaceWith(start, range.to, this.type.create({ latex }))
        }
      })
    ]
  }
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return latexAttr
  },
  parseHTML() {
    return [{ tag: 'div[data-math-block]' }]
  },
  renderHTML({ node }) {
    const latex = String(node.attrs.latex)
    return ['div', mergeAttributes({ 'data-math-block': '', 'data-latex': latex, class: 'math-block' }), `$$\n${latex}\n$$`]
  },
  markdownTokenName: 'mathBlock',
  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block',
    start: (src: string) => src.search(/^\$\$/m),
    tokenize: (src: string) => {
      const m = BLOCK_FENCED.exec(src) ?? BLOCK_ONE_LINE.exec(src)
      return m ? { type: 'mathBlock', raw: m[0], text: m[1].trim() } : undefined
    }
  },
  parseMarkdown: (token: MathToken) => ({ type: 'mathBlock', attrs: { latex: token.text ?? '' } }),
  renderMarkdown: (node: { attrs?: { latex?: string } }) => `$$\n${node.attrs?.latex ?? ''}\n$$`,
  addNodeView() {
    return mathNodeView(true)
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$\s$/,
        handler: ({ state, range }) => {
          state.tr.replaceWith(range.from - 1, range.to, this.type.create({ latex: '' }))
        }
      })
    ]
  }
})
