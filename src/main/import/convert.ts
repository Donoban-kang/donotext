// Runs one conversion. Pure with respect to the app: bytes in, Markdown out (used inside the worker thread
// and directly by tests).

import type { ImportFormat, ImportLabels, ImportWarning } from '../../shared/importTypes'
import { IMPORT_MAX_OCR_PAGES, IMPORT_MAX_PDF_PAGES } from '../../shared/importTypes'
import { convertDocx } from './docxConvert'
import { convertHtml } from './htmlConvert'
import { markdownStats } from './markdownStats'
import { decodeToGray, ImageDecodeError } from './decodeImage'
import { createOcrEngine, mergeHighlights, ocrPageToLayout, recognizeUpright, type OcrEngine, type OcrPaths } from './ocr'
import { rotate, type Gray } from './pageBitmap'
import { encodeGrayPng } from './pngEncode'
import { PdfEncryptedError, PdfSession } from './pdfExtract'
import { layoutPdf, type PdfPageInput } from './pdfLayout'
import { convertPptx } from './pptxConvert'
import type { Converted } from './types'
import { UnsafeArchiveError } from './zipGuard'
import { convertXlsx } from './xlsxConvert'

export interface ImportJob {
  format: ImportFormat
  bytes: Uint8Array
  labels: ImportLabels
  /** Directory of the `pdfjs-dist` package (character maps, fonts and the library itself). */
  pdfjsDir: string
  /** Where the OCR engine and its language data are; null when OCR is not available. */
  ocr: OcrPaths | null
}

export type JobFailureCode = 'encrypted' | 'unreadable' | 'tooLarge' | 'ocrUnavailable'

export class JobFailure extends Error {
  constructor(readonly code: JobFailureCode) {
    super(code)
  }
}

/** Called after each scanned page: `done` of `total`. */
export type ProgressFn = (done: number, total: number) => void

/** A page with (almost) no text and a picture over most of it is a scan. */
const SCAN_MIN_COVERAGE = 0.4
const SCAN_MAX_CHARS = 10

/** Reads a page picture, turning it if it was scanned sideways. */
function readGray(engine: OcrEngine, gray: Gray) {
  return recognizeUpright((degrees) => {
    const turned = rotate(gray, degrees)
    return engine.recognize(encodeGrayPng(turned.width, turned.height, turned.data))
  })
}

const textChars = (p: PdfPageInput): number => p.items.reduce((n, it) => n + it.str.trim().length, 0)

function withNote(markdown: string, note: string): string {
  return markdown ? `> ${note}\n\n${markdown}` : markdown
}

async function convertPdf(job: ImportJob, onProgress?: ProgressFn): Promise<Converted> {
  const session = await PdfSession.open(job.bytes, { assetDir: job.pdfjsDir, maxPages: IMPORT_MAX_PDF_PAGES })
  try {
    const { pages, totalPages, imageCount, mainImageCoverage } = await session.extractText()
    const scanned = pages.map((p, i) => textChars(p) < SCAN_MAX_CHARS && (mainImageCoverage[i] ?? 0) >= SCAN_MIN_COVERAGE)
    const warnings: ImportWarning[] = []

    // 1. read the scanned pages (only when the engine is available)
    const read = new Map<number, PdfPageInput>()
    let uncertain = 0
    let failed = 0
    let limited = 0
    const wanted = scanned.flatMap((s, i) => (s ? [i] : []))
    if (job.ocr && wanted.length > 0) {
      const todo = wanted.slice(0, IMPORT_MAX_OCR_PAGES)
      limited = wanted.length - todo.length
      const engine = await createOcrEngine(job.ocr)
      try {
        let done = 0
        onProgress?.(0, todo.length)
        for (const i of todo) {
          const gray = await session.pageGray(i)
          if (gray) {
            const result = await readGray(engine, gray)
            const laid = ocrPageToLayout(result)
            read.set(i, laid.input)
            uncertain += laid.uncertain
          } else failed++
          onProgress?.(++done, todo.length)
        }
      } finally {
        await engine.close()
      }
    }

    // 2. lay out runs of pages of the same kind and join them in page order
    const parts: string[] = []
    let removedLines = 0
    let garbled: ImportWarning | null = null
    for (let i = 0; i < pages.length; ) {
      const kind = read.has(i) ? 'ocr' : scanned[i] ? 'skip' : 'text'
      let j = i
      while (j < pages.length && (read.has(j) ? 'ocr' : scanned[j] ? 'skip' : 'text') === kind) j++
      if (kind !== 'skip') {
        // scanned pages are laid out one by one and separated by a rule, so they can be compared with the paper
        const groups: PdfPageInput[][] = kind === 'ocr' ? Array.from({ length: j - i }, (_, k) => [read.get(i + k)!]) : [pages.slice(i, j)]
        for (const group of groups) {
          const run = layoutPdf(group)
          const text = kind === 'ocr' ? mergeHighlights(run.markdown) : run.markdown
          if (text.trim()) parts.push(text.trimEnd())
          removedLines += run.stats.removedLines ?? 0
          for (const w of run.warnings) {
            if (w.code === 'garbled') garbled = w
            // "no text" of one run is not "no text" of the document: decided below
          }
        }
      }
      i = j
    }
    if (garbled) warnings.push(garbled)

    let markdown = parts.length ? `${parts.join('\n\n---\n\n')}\n` : ''
    if (read.size > 0) {
      markdown = withNote(markdown, job.labels.ocrNote)
      warnings.push({ code: 'ocrUsed', count: read.size })
      if (uncertain > 0) warnings.push({ code: 'ocrUncertain', count: uncertain })
    }
    if (failed > 0) warnings.push({ code: 'ocrFailed', count: failed })
    if (!markdown.trim()) warnings.push({ code: 'noText' })
    if (totalPages > pages.length) warnings.push({ code: 'pagesTruncated', count: totalPages - pages.length })
    if (limited > 0) warnings.push({ code: 'pagesTruncated', count: limited })
    // pictures read by OCR are not "skipped"; a scan the engine could not be used for is reported as no text
    const skippedImages = imageCount - read.size - (job.ocr ? 0 : scanned.filter(Boolean).length)
    if (skippedImages > 0) warnings.push({ code: 'imagesSkipped', count: skippedImages })

    return { markdown, warnings, stats: { ...markdownStats(markdown), pages: totalPages, removedLines } }
  } finally {
    await session.close()
  }
}

async function convertImage(job: ImportJob, onProgress?: ProgressFn): Promise<Converted> {
  if (!job.ocr) throw new JobFailure('ocrUnavailable')
  const gray = decodeToGray(job.bytes) // fails early (before the engine starts) on a broken or unsupported picture
  onProgress?.(0, 1)
  const engine = await createOcrEngine(job.ocr)
  try {
    const result = await readGray(engine, gray)
    const laid = ocrPageToLayout(result)
    const laidOut = layoutPdf([laid.input])
    const warnings: ImportWarning[] = []
    let markdown = laid.input.items.length > 0 ? mergeHighlights(laidOut.markdown) : ''
    if (markdown.trim()) {
      markdown = withNote(markdown, job.labels.ocrNote)
      warnings.push({ code: 'ocrUsed', count: 1 })
      if (laid.uncertain > 0) warnings.push({ code: 'ocrUncertain', count: laid.uncertain })
    } else warnings.push({ code: 'noText' })
    onProgress?.(1, 1)
    return { markdown, warnings, stats: { ...markdownStats(markdown), removedLines: laidOut.stats.removedLines } }
  } finally {
    await engine.close()
  }
}

export async function runConversion(job: ImportJob, onProgress?: ProgressFn): Promise<Converted> {
  try {
    switch (job.format) {
      case 'pdf':
        return await convertPdf(job, onProgress)
      case 'docx':
        return await convertDocx(job.bytes)
      case 'xlsx':
        return await convertXlsx(job.bytes)
      case 'pptx':
        return await convertPptx(job.bytes, job.labels)
      case 'html':
        return convertHtml(job.bytes)
      case 'image':
        return await convertImage(job, onProgress)
    }
  } catch (e) {
    // set DONOTEXT_DEBUG=1 to see the original error (the user only sees a short message)
    if (process.env['DONOTEXT_DEBUG']) console.error('[import]', e)
    if (e instanceof JobFailure) throw e
    if (e instanceof PdfEncryptedError) throw new JobFailure('encrypted')
    if (e instanceof UnsafeArchiveError) throw new JobFailure('tooLarge')
    if (e instanceof ImageDecodeError) throw new JobFailure('unreadable')
    throw new JobFailure('unreadable')
  }
}
