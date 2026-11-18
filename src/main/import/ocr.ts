// Offline text recognition (Tesseract through tesseract.js) for scanned pages and pictures.
// Everything runs on this computer: the language data ships with the app and nothing is downloaded.

import { createWorker, type Worker } from 'tesseract.js'
import type { PdfPageInput, PdfTextItem } from './pdfLayout'

export interface OcrPaths {
  /** Directory of the installed `tesseract.js` package (its worker script is started from there). */
  tesseractDir: string
  /** Directory holding `kor.traineddata.gz` and `eng.traineddata.gz`. */
  langDir: string
}

export interface OcrWord {
  text: string
  confidence: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrLine {
  text: string
  /** 0-100, how sure the engine is about the whole line. */
  confidence: number
  words: OcrWord[]
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrPage {
  lines: OcrLine[]
}

export interface OcrEngine {
  recognize(image: Uint8Array): Promise<OcrPage>
  close(): Promise<void>
}

/** Lines the engine is less sure about than this get a "check me" highlight. */
export const UNCERTAIN_BELOW = 70
/** A word below this makes its line worth checking even when the line as a whole looks sure. */
const WORD_UNCERTAIN_BELOW = 50
/** Share of one-letter fragments ("정 보 보 안") above which a line is probably mis-split text or noise. */
const FRAGMENT_RATIO = 0.5

/** What a printed circle bullet (○) is often read as. */
const BULLET_LOOKALIKE = /^[O0oº°©◯○●•·<«»*]$/
const LETTER_FRAGMENT = /^[\p{L}]$/u
/** A first word that is only a list marker: the highlight starts after it so the line is still read as an item. */
const MARKER_WORD = /^(?:\d{1,2}[.)]|[\uAC00-\uD7A3][.)]|\(\d{1,2}\)|[○●◦·•\-–—])$/

/**
 * Whether a line deserves a "check me" mark. The engine's own confidence stays high for text it split wrongly,
 * so fragmentation and single weak words count as well.
 */
export function isUncertain(line: OcrLine, threshold = UNCERTAIN_BELOW): boolean {
  if (line.confidence < threshold) return true
  if (line.words.some((w) => w.confidence < WORD_UNCERTAIN_BELOW)) return true
  const fragments = line.words.filter((w) => LETTER_FRAGMENT.test(w.text)).length
  return line.words.length >= 3 && fragments / line.words.length >= FRAGMENT_RATIO
}

interface RawBox {
  x0: number
  y0: number
  x1: number
  y1: number
}
interface RawWord {
  text: string
  confidence: number
  bbox: RawBox
}
interface RawLine {
  text: string
  confidence: number
  bbox: RawBox
  words?: RawWord[]
}

export async function createOcrEngine(paths: OcrPaths): Promise<OcrEngine> {
  const sep = paths.tesseractDir.includes('\\') ? '\\' : '/'
  const worker: Worker = await createWorker(['kor', 'eng'], 1, {
    workerPath: `${paths.tesseractDir.replace(/[\\/]+$/, '')}${sep}src${sep}worker-script${sep}node${sep}index.js`,
    langPath: paths.langDir,
    gzip: true,
    cacheMethod: 'none', // never write language data anywhere
    // A failed job already rejects the promise it belongs to; without a handler the library throws a second,
    // uncatchable error from its message callback and would take the worker thread down with it.
    errorHandler: () => undefined
  })
  return {
    async recognize(image) {
      const { data } = await worker.recognize(Buffer.from(image), {}, { blocks: true, text: false })
      const lines: OcrLine[] = []
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const raw of para.lines as unknown as RawLine[]) {
            const words = (raw.words ?? [])
              .map((w) => ({ text: w.text.trim(), confidence: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }))
              .filter((w) => w.text !== '')
            if (words.length === 0) continue
            lines.push({
              text: words.map((w) => w.text).join(' '),
              confidence: raw.confidence,
              words,
              x0: raw.bbox.x0,
              y0: raw.bbox.y0,
              x1: raw.bbox.x1,
              y1: raw.bbox.y1
            })
          }
        }
      }
      return { lines }
    },
    async close() {
      await worker.terminate()
    }
  }
}

/**
 * Turns recognised lines into the positioned fragments the PDF layout engine reads, so paragraphs, headings,
 * numbered items and tables are rebuilt the same way for scans as for ordinary PDFs. A line the engine is
 * unsure about is wrapped in `==...==` (the editor's highlight) so a reader knows where to compare.
 */
export function ocrPageToLayout(page: OcrPage, threshold = UNCERTAIN_BELOW): { input: PdfPageInput; uncertain: number } {
  const width = Math.max(1, ...page.lines.map((l) => l.x1)) + 1
  const height = Math.max(1, ...page.lines.map((l) => l.y1)) + 1
  const items: PdfTextItem[] = []
  let uncertain = 0
  for (const line of page.lines) {
    const flagged = isUncertain(line, threshold)
    if (flagged) uncertain++
    const fs = Math.max(1, line.y1 - line.y0)
    const bullet = line.words.length >= 3 && BULLET_LOOKALIKE.test(line.words[0]!.text) && /^[\uAC00-\uD7A3]/.test(line.words[1]!.text)
    const markFrom = line.words.length > 1 && (bullet || MARKER_WORD.test(line.words[0]!.text)) ? 1 : 0
    line.words.forEach((w, k) => {
      const last = k === line.words.length - 1
      // a circle bullet misread as a letter or sign: put the bullet back so the line is seen as a list item
      const text = k === 0 && bullet ? '○' : w.text
      items.push({
        str: `${flagged && k === markFrom ? '==' : ''}${text}${flagged && last ? '==' : ''}`,
        x: w.x0,
        y: height - line.y1,
        width: Math.max(1, w.x1 - w.x0),
        height: fs
      })
    })
  }
  return { input: { width, height, items }, uncertain }
}

/** Neighbouring highlighted lines that ended up in one paragraph become one highlight. */
export function mergeHighlights(markdown: string): string {
  return markdown.replace(/==[ \t]+==/g, ' ')
}
