import mammoth from 'mammoth'
import type { ImportWarning } from '../../shared/importTypes'
import { htmlToMarkdown } from './htmlToMarkdown'
import { HEADING_STYLE, OUTLINE_STYLE, TITLE_STYLE } from './koreanData'
import { markdownStats } from './markdownStats'
import type { Converted } from './types'
import { openOfficeZip } from './zipGuard'

// Korean Word templates name their styles in Korean; the built-in map only knows the English names.
const LEVELS = [1, 2, 3, 4, 5, 6]
const STYLE_MAP = [
  // the document title is marked so the other headings can move one level down (see below)
  "p[style-name='Title'] => h1.dn-title:fresh",
  `p[style-name='${TITLE_STYLE}'] => h1.dn-title:fresh`,
  ...LEVELS.map((n) => `p[style-name='${HEADING_STYLE} ${n}'] => h${n}:fresh`),
  ...LEVELS.map((n) => `p[style-name='${OUTLINE_STYLE} ${n}'] => h${n}:fresh`)
]

export async function convertDocx(bytes: Uint8Array): Promise<Converted> {
  await openOfficeZip(bytes) // size guard; throws on a zip bomb or a broken archive
  const { value: html } = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    {
      styleMap: STYLE_MAP,
      // pictures are not carried over; an empty <img> is counted and removed by the HTML step
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' }))
    }
  )
  const { markdown, imagesSkipped } = htmlToMarkdown(demoteHeadingsBelowTitle(html))
  const warnings: ImportWarning[] = []
  if (imagesSkipped > 0) warnings.push({ code: 'imagesSkipped', count: imagesSkipped })
  return { markdown, warnings, stats: markdownStats(markdown) }
}

/** A document with a Title keeps it as `#`; its "Heading 1" then becomes `##`, and so on. */
export function demoteHeadingsBelowTitle(html: string): string {
  if (!html.includes('dn-title')) return html
  let inTitle = false // headings never nest, so one flag pairs each closing tag with its opening tag
  return html.replace(/<(\/?)h([1-6])([^>]*)>/g, (_m, slash: string, n: string, rest: string) => {
    if (!slash) inTitle = rest.includes('dn-title')
    const level = inTitle ? Number(n) : Math.min(Number(n) + 1, 6)
    return `<${slash}h${level}${inTitle ? '' : rest}>`
  })
}
