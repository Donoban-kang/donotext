import type { JSONContent } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'
import { MarkdownManager } from '@tiptap/markdown'
import { isSafeLinkUrl } from '../../../shared/links'
import { getExtensions } from './extensions'
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
  return sanitizeNode(getManager().parse(md)) ?? { type: 'doc', content: [] }
}

/** Serializes editor JSON to markdown, ending non-empty output with a single newline. */
export function serializeMarkdown(doc: JSONContent): string {
  const md = getManager().serialize(doc)
  return md.trim() === '' ? '' : md.replace(/\n*$/, '\n')
}

export function parseMarkdown(md: string): JSONContent {
  return parseSafe(md)
}

/** parse → serialize roundtrip; the form WYSIWYG editing would write back. */
export function normalizeMarkdown(md: string): string {
  return serializeMarkdown(parseSafe(md))
}

export function markdownToHtml(md: string): string {
  return generateHTML(parseSafe(md), getExtensions())
}
