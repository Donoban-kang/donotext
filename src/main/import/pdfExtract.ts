// Reads a PDF with pdfjs and returns its positioned text, ready for layoutPdf().

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as Pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { BOLD_FONT_WORD } from './koreanData'
import { downscale, rotate, toGray, uprightRotation, type BitmapKind, type Gray } from './pageBitmap'
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
  /** Per converted page: how much of it the biggest picture covers (0-1); null when it has none. */
  mainImageCoverage: Array<number | null>
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

/** The longest side a page picture is scaled down to before text recognition (about 300 dpi for A4). */
const OCR_MAX_SIDE = 3600
const IMAGE_WAIT_MS = 30_000

interface MainImage {
  coverage: number
  ctm: Matrix
  /** An object id to look up, or the picture itself for inline images. */
  ref: { id: string } | { inline: unknown }
}

/** The picture that covers most of the page (a scan is one page-sized picture), with how it was drawn. */
function findMainImage(opList: { fnArray: number[]; argsArray: unknown[] }, OPS: typeof Pdfjs.OPS, pageArea: number): MainImage | null {
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  let best: MainImage | null = null
  opList.fnArray.forEach((fn, i) => {
    const args = opList.argsArray[i] as unknown[] | null
    if (fn === OPS.save) stack.push([...ctm])
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform && args) ctm = concat(args as number[], ctm)
    else if ((fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) && args) {
      const coverage = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / pageArea
      if (!best || coverage > best.coverage) {
        best = { coverage, ctm: [...ctm] as Matrix, ref: fn === OPS.paintInlineImageXObject ? { inline: args[0] } : { id: String(args[0]) } }
      }
    }
  })
  return best
}

interface RawImage {
  width: number
  height: number
  kind: number
  data?: ArrayLike<number>
}

export class PdfSession {
  private constructor(
    private readonly pdfjs: typeof Pdfjs,
    private readonly task: ReturnType<typeof Pdfjs.getDocument>,
    private readonly doc: Awaited<ReturnType<typeof Pdfjs.getDocument>['promise']>,
    private readonly opts: ExtractOptions
  ) {}

  static async open(data: Uint8Array, opts: ExtractOptions): Promise<PdfSession> {
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
      iccUrl: `${dir}/iccs/`,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0
    })
    try {
      return new PdfSession(pdfjs, task, await task.promise, opts)
    } catch (e) {
      await task.destroy().catch(() => undefined)
      if ((e as { name?: string }).name === 'PasswordException') throw new PdfEncryptedError('encrypted')
      throw e
    }
  }

  get totalPages(): number {
    return this.doc.numPages
  }

  /** Positioned text, table borders and picture coverage of the first `maxPages` pages. */
  async extractText(): Promise<ExtractResult> {
    const { pdfjs, doc, opts } = this
    const OPS = pdfjs.OPS
    const pages: PdfPageInput[] = []
    const mainImageCoverage: Array<number | null> = []
    let imageCount = 0
    for (let n = 1; n <= Math.min(doc.numPages, opts.maxPages); n++) {
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
      let rules: PdfRules | undefined
      try {
        rules = collectRules(opList, OPS, [view[0]!, view[1]!])
      } catch {
        rules = undefined // table borders are a bonus; the text is still converted without them
      }
      const width = view[2]! - view[0]!
      const height = view[3]! - view[1]!
      pages.push({ width, height, items, rules })
      mainImageCoverage.push(findMainImage(opList, OPS, width * height)?.coverage ?? null)
      for (const fn of opList.fnArray) {
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) imageCount++
      }
      page.cleanup()
    }
    return { pages, totalPages: doc.numPages, imageCount, mainImageCoverage }
  }

  /**
   * The page's main picture as upright 8-bit gray, ready for text recognition; null when the page has no
   * picture this reader can decode. Pictures are read straight from the file, so no drawing library is needed.
   */
  async pageGray(index: number): Promise<Gray | null> {
    const { pdfjs, doc } = this
    const page = await doc.getPage(index + 1)
    try {
      const view = page.view
      const opList = await page.getOperatorList()
      const main = findMainImage(opList, pdfjs.OPS, (view[2]! - view[0]!) * (view[3]! - view[1]!))
      if (!main) return null
      let img: RawImage | null
      if ('inline' in main.ref) img = main.ref.inline as RawImage
      else {
        const id = main.ref.id
        img = await Promise.race([
          new Promise<RawImage | null>((resolve) => page.objs.get(id, (v: unknown) => resolve((v as RawImage | null) ?? null))),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), IMAGE_WAIT_MS))
        ])
      }
      if (!img || !img.data || !(img.kind === 1 || img.kind === 2 || img.kind === 3)) return null
      const kind = img.kind as BitmapKind
      const expected = kind === 1 ? Math.ceil(img.width / 8) * img.height : img.width * img.height * (kind === 2 ? 3 : 4)
      if (img.data.length < expected) return null
      const gray = rotate(downscale(toGray(img.width, img.height, kind, img.data), OCR_MAX_SIDE), uprightRotation(main.ctm, page.rotate))
      return gray
    } finally {
      page.cleanup()
    }
  }

  async close(): Promise<void> {
    await this.task.destroy()
  }
}

export async function extractPdfPages(data: Uint8Array, opts: ExtractOptions): Promise<ExtractResult> {
  const session = await PdfSession.open(data, opts)
  try {
    return await session.extractText()
  } finally {
    await session.close()
  }
}
