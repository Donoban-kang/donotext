import type { JSONContent } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'
import { MarkdownManager } from '@tiptap/markdown'
import { isSafeImageSrc } from '../../../shared/images'
import { isSafeLinkUrl } from '../../../shared/links'
import { getExtensions } from './extensions'
import { splitFrontMatter } from './frontMatter'
import { escapeLineStarts } from './markdownText'
import { wouldParseAsMath } from './math'
import { htmlSource, type HtmlToken } from './rawHtml'

let manager: MarkdownManager | undefined

function getManager(): MarkdownManager {
  if (!manager) {
    manager = new MarkdownManager({ extensions: getExtensions() })
    // @tiptap/markdown routes inline HTML through a private DOM-based parser that drops
    // unknown tags. Keep it verbatim (and inert) instead. Guarded by the raw-HTML
    // roundtrip test in codec.test.ts; the TipTap packages are pinned to exact versions.
    const patchable = manager as unknown as { parseHTMLToken(t: HtmlToken): unknown }
    const original = patchable.parseHTMLToken.bind(manager)
    patchable.parseHTMLToken = (t) =>
      t.block === false ? { type: 'rawHtmlInline', attrs: { source: htmlSource(t) } } : original(t)
  }
  return manager
}

/**
 * Display/export only: removes link marks and image nodes that point at dangerous schemes
 * (javascript:, file:, data:text/html …). The saved markdown is NEVER changed by this: a document
 * the user wrote must come back exactly as meant, and rendering is where the danger lies.
 */
function neutralizeUnsafeTargets(node: JSONContent): JSONContent | null {
  if (node.type === 'image') {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    if (!isSafeImageSrc(src)) return null
  }
  const out: JSONContent = { ...node }
  if (node.marks) {
    out.marks = node.marks.filter(
      (m) => !(m.type === 'link' && !isSafeLinkUrl(typeof m.attrs?.href === 'string' ? m.attrs.href : ''))
    )
    if (out.marks.length === 0) delete out.marks
  }
  if (node.content) {
    out.content = node.content.map(neutralizeUnsafeTargets).filter((n): n is JSONContent => n !== null)
  }
  return out
}

function parseSafe(md: string): JSONContent {
  const { frontMatter, body } = splitFrontMatter(md)
  // The blank line that separates front matter from the body is not content.
  const json = getManager().parse(frontMatter === null ? body : body.replace(/^\n+/, ''))
  if (frontMatter === null) return json
  const fm: JSONContent = { type: 'frontMatter', content: frontMatter ? [{ type: 'text', text: frontMatter }] : [] }
  return { ...json, content: [fm, ...(json.content ?? [])] }
}

interface Stand { dollar: string; esc: string }

/**
 * Plain text can contain characters that would change meaning once written back: `$` pairs that
 * read as math, and block markers at the start of a line ("1." "#" "-" …). The serializer escapes
 * backslashes itself, so private-use stand-in characters mark where a backslash must go; they are
 * swapped for real backslashes after serialization.
 */
function prepareForSerialize(node: JSONContent, st: Stand, inCell = false): JSONContent {
  if (node.type === 'text') {
    const isCode = node.marks?.some((m) => m.type === 'code')
    return !isCode && node.text && wouldParseAsMath(node.text) ? { ...node, text: node.text.split('$').join(st.dollar) } : node
  }
  if (node.type === 'codeBlock' || node.type === 'frontMatter' || !node.content) return node
  const cell = inCell || node.type === 'tableCell' || node.type === 'tableHeader'
  if (node.type === 'paragraph' && !cell) {
    let lineStart = true
    const content = node.content.map((c) => {
      let out = prepareForSerialize(c, st, cell)
      // Only unmarked text starts a line as-is; bold, links, code … put their own characters first.
      if (out.type === 'text' && out.text && !out.marks?.length) out = { ...out, text: escapeLineStarts(out.text, lineStart, st.esc) }
      lineStart = c.type === 'hardBreak'
      return out
    })
    return { ...node, content }
  }
  return { ...node, content: node.content.map((c) => prepareForSerialize(c, st, cell)) }
}

/** Private-use characters that occur nowhere in the document. */
function pickStandIns(doc: JSONContent): Stand {
  const text = JSON.stringify(doc)
  const free: string[] = []
  for (let code = 0xe000; code < 0xf8ff && free.length < 2; code++) {
    const ch = String.fromCharCode(code)
    if (!text.includes(ch)) free.push(ch)
  }
  return { dollar: free[0] ?? '\uE000', esc: free[1] ?? '\uE001' }
}

const withoutFrontMatter = (doc: JSONContent): JSONContent => ({
  ...doc,
  content: (doc.content ?? []).filter((n) => n.type !== 'frontMatter')
})

/** Serializes editor JSON to markdown, ending non-empty output with a single newline. */
export function serializeMarkdown(doc: JSONContent): string {
  const first = doc.content?.[0]
  const fmText = first?.type === 'frontMatter' ? (first.content ?? []).map((n) => n.text ?? '').join('') : null
  const bodyDoc = withoutFrontMatter(doc)
  const st = pickStandIns(bodyDoc)
  const body = getManager()
    .serialize(prepareForSerialize(bodyDoc, st))
    .split(st.dollar)
    .join('\\$')
    .split(st.esc)
    .join('\\')
  const bodyText = body.trim() === '' ? '' : body.replace(/^\n+/, '').replace(/\n*$/, '\n')
  if (fmText === null) return bodyText
  const head = `---\n${fmText}${fmText ? '\n' : ''}---\n`
  return bodyText ? `${head}\n${bodyText}` : head
}

export function parseMarkdown(md: string): JSONContent {
  return parseSafe(md)
}

/** parse → serialize roundtrip; the form WYSIWYG editing would write back. */
export function normalizeMarkdown(md: string): string {
  return serializeMarkdown(parseSafe(md))
}

export function markdownToHtml(md: string): string {
  const doc = neutralizeUnsafeTargets(withoutFrontMatter(parseSafe(md))) ?? { type: 'doc', content: [] }
  return generateHTML(doc, getExtensions())
}
