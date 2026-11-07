// Reads a PDF with pdfjs and returns its positioned text, ready for layoutPdf().

import { BOLD_FONT_WORD } from './koreanData'
import type { PdfPageInput, PdfTextItem } from './pdfLayout'

export interface ExtractOptions {
  /** Directory of the installed `pdfjs-dist` package (for CJK character maps and standard fonts). */
  assetDir: string
  maxPages: number
}

export interface ExtractResult {
  pages: PdfPageInput[]
  totalPages: number
  /** Images drawn on the converted pages (they are not carried over). */
  imageCount: number
}

export class PdfEncryptedError extends Error {}

interface RawItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  fontName?: string
}

const BOLD_RE = new RegExp(`bold|black|heavy|extrabold|semibold|demi|${BOLD_FONT_WORD}`, 'i')

export async function extractPdfPages(data: Uint8Array, opts: ExtractOptions): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const dir = opts.assetDir.replace(/[\\/]+$/, '')
  const task = pdfjs.getDocument({
    // pdfjs takes ownership of the buffer it is given; hand it a copy so the caller's bytes stay valid
    data: data.slice(),
    cMapUrl: `${dir}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${dir}/standard_fonts/`,
    wasmUrl: `${dir}/wasm/`,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0
  })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') throw new PdfEncryptedError('encrypted')
    throw e
  }
  try {
    const total = doc.numPages
    const pages: PdfPageInput[] = []
    let imageCount = 0
    for (let n = 1; n <= Math.min(total, opts.maxPages); n++) {
      const page = await doc.getPage(n)
      const view = page.view // [x0, y0, x1, y1]
      const content = await page.getTextContent()
      const boldCache = new Map<string, boolean>()
      const isBold = (fontName: string | undefined): boolean => {
        if (!fontName) return false
        const hit = boldCache.get(fontName)
        if (hit !== undefined) return hit
        let bold = false
        try {
          const font = page.commonObjs.get(fontName) as { name?: string; bold?: boolean } | undefined
          bold = Boolean(font?.bold) || BOLD_RE.test(font?.name ?? '')
        } catch {
          bold = false
        }
        boldCache.set(fontName, bold)
        return bold
      }
      const items: PdfTextItem[] = []
      for (const raw of content.items as RawItem[]) {
        if (typeof raw.str !== 'string' || !raw.transform) continue
        const t = raw.transform
        const size = Math.hypot(t[2] ?? 0, t[3] ?? 0) || raw.height || 0
        items.push({
          str: raw.str,
          x: (t[4] ?? 0) - view[0]!,
          y: (t[5] ?? 0) - view[1]!,
          width: raw.width ?? 0,
          height: size,
          bold: isBold(raw.fontName)
        })
      }
      pages.push({ width: view[2]! - view[0]!, height: view[3]! - view[1]!, items })
      try {
        const ops = await page.getOperatorList()
        const OPS = pdfjs.OPS
        for (const fn of ops.fnArray) {
          if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) imageCount++
        }
      } catch {
        // image counting is best effort
      }
      page.cleanup()
    }
    return { pages, totalPages: total, imageCount }
  } finally {
    await task.destroy()
  }
}
