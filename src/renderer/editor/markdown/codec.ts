import type { JSONContent } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'
import { MarkdownManager } from '@tiptap/markdown'
import { isSafeLinkUrl } from '../../../shared/links'
import { getExtensions } from './extensions'
import { splitFrontMatter } from './frontMatter'
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

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i

function isSafeImageSrc(src: string): boolean {
  const s = src.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (SAFE_DATA_IMAGE.test(s)) return true
  if (/^donotext-file:/i.test(s)) return true
  return isSafeLinkUrl(s) && !/^mailto:/i.test(s)
}

/** Removes link marks and image nodes that point at unsafe URL schemes. */
function sanitizeNode(node: JSONContent): JSONContent | null {
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
    out.content = node.content.map(sanitizeNode).filter((n): n is JSONContent => n !== null)
  }
  return out
}

function parseSafe(md: string): JSONContent {
  const { frontMatter, body } = splitFrontMatter(md)
  // The blank line that separates front matter from the body is not content.
  const json = sanitizeNode(getManager().parse(frontMatter === null ? body : body.replace(/^\n+/, ''))) ?? { type: 'doc', content: [] }
  if (frontMatter === null) return json
  const fm: JSONContent = { type: 'frontMatter', content: frontMatter ? [{ type: 'text', text: frontMatter }] : [] }
  return { ...json, content: [fm, ...(json.content ?? [])] }
}

/**
 * Marks `$` in plain text that would otherwise be read back as a formula. The serializer escapes
 * backslashes itself, so a sentinel character stands in for the dollar sign and is turned into
 * `\$` after serialization.
 */
function markLiteralDollars(node: JSONContent, sentinel: string): JSONContent {
  if (node.type === 'text') {
    const isCode = node.marks?.some((m) => m.type === 'code')
    return !isCode && node.text && wouldParseAsMath(node.text) ? { ...node, text: node.text.split('$').join(sentinel) } : node
  }
  if (node.type === 'codeBlock' || node.type === 'frontMatter') return node
  return node.content ? { ...node, content: node.content.map((c) => markLiteralDollars(c, sentinel)) } : node
}

/** A private-use character that does not occur anywhere in the document. */
function pickSentinel(doc: JSONContent): string {
  const text = JSON.stringify(doc)
  for (let code = 0xe000; code < 0xf8ff; code++) {
    const ch = String.fromCharCode(code)
    if (!text.includes(ch)) return ch
  }
  return '\uE000'
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
  const sentinel = pickSentinel(bodyDoc)
  const body = getManager().serialize(markLiteralDollars(bodyDoc, sentinel)).split(sentinel).join('\\$')
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
  return generateHTML(withoutFrontMatter(parseSafe(md)), getExtensions())
}
