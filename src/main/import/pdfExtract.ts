// Reads a PDF with pdfjs and returns its positioned text, ready for layoutPdf().

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as Pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { BOLD_FONT_WORD } from './koreanData'
import type { PdfPageInput, PdfRules, PdfTextItem } from './pdfLayout'

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

type Matrix = [number, number, number, number, number, number]

/** `m` applied first, then `ctm` (the PDF `cm` operator). */
function concat(m: ArrayLike<number>, ctm: Matrix): Matrix {
  const [a, b, c, d, e, f] = ctm
  return [
    m[0]! * a + m[1]! * c,
    m[0]! * b + m[1]! * d,
    m[2]! * a + m[3]! * c,
    m[2]! * b + m[3]! * d,
    m[4]! * a + m[5]! * c + e,
    m[4]! * b + m[5]! * d + f
  ]
}

const THIN = 1.6 // points: table borders are drawn as rectangles this thin (or as zero-area strokes)

/**
 * Thin horizontal and vertical lines the page draws (table borders), in page coordinates. Only the painted
 * shapes matter, so the path is judged by its bounding box.
 */
function collectRules(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: typeof Pdfjs.OPS, origin: [number, number]): PdfRules {
  const painters = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke])
  const rules: PdfRules = { h: [], v: [] }
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[] | null
    if (fn === OPS.save) stack.push([...ctm])
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform && args) ctm = concat(args as number[], ctm)
    else if (fn === OPS.constructPath && args && painters.has(args[0] as number)) {
      const box = args[2] as ArrayLike<number> | undefined
      if (!box || box.length < 4) return
      const xs: number[] = []
      const ys: number[] = []
      for (const [x, y] of [[box[0]!, box[1]!], [box[2]!, box[1]!], [box[0]!, box[3]!], [box[2]!, box[3]!]] as Array<[number, number]>) {
        xs.push(x * ctm[0] + y * ctm[2] + ctm[4] - origin[0])
        ys.push(x * ctm[1] + y * ctm[3] + ctm[5] - origin[1])
      }
      const x0 = Math.min(...xs)
      const x1 = Math.max(...xs)
      const y0 = Math.min(...ys)
      const y1 = Math.max(...ys)
      if (y1 - y0 <= THIN && x1 - x0 >= 8) rules.h.push({ y: (y0 + y1) / 2, x0, x1 })
      else if (x1 - x0 <= THIN && y1 - y0 >= 8) rules.v.push({ x: (x0 + x1) / 2, y0, y1 })
    }
  })
  return rules
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
  const dir = opts.assetDir.replace(/[\\/]+$/, '')
  // Loaded by file path, not by package name: in the installed app the library sits outside the packed archive.
  const pdfjs = (await import(/* @vite-ignore */ pathToFileURL(join(dir, 'legacy/build/pdf.mjs')).href)) as typeof Pdfjs
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
      const opList = await page.getOperatorList()
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
      const OPS = pdfjs.OPS
      let rules: PdfRules | undefined
      try {
        rules = collectRules(opList, OPS, [view[0]!, view[1]!])
      } catch {
        rules = undefined // table borders are a bonus; the text is still converted without them
      }
      pages.push({ width: view[2]! - view[0]!, height: view[3]! - view[1]!, items, rules })
      for (const fn of opList.fnArray) {
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) imageCount++
      }
      page.cleanup()
    }
    return { pages, totalPages: total, imageCount }
  } finally {
    await task.destroy()
  }
}
