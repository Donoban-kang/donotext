// Runs one conversion. Pure with respect to the app: bytes in, Markdown out (used inside the worker thread
// and directly by tests).

import type { ImportFormat, ImportWarning } from '../../shared/importTypes'
import { IMPORT_MAX_PDF_PAGES } from '../../shared/importTypes'
import { convertDocx } from './docxConvert'
import { convertHtml } from './htmlConvert'
import { markdownStats } from './markdownStats'
import { extractPdfPages, PdfEncryptedError } from './pdfExtract'
import { layoutPdf } from './pdfLayout'
import { convertPptx, type PptxLabels } from './pptxConvert'
import type { Converted } from './types'
import { UnsafeArchiveError } from './zipGuard'
import { convertXlsx } from './xlsxConvert'

export interface ImportJob {
  format: ImportFormat
  bytes: Uint8Array
  labels: PptxLabels
  /** Directory of the `pdfjs-dist` package (character maps, fonts and the library itself). */
  pdfjsDir: string
}

export type JobFailureCode = 'encrypted' | 'unreadable' | 'tooLarge'

export class JobFailure extends Error {
  constructor(readonly code: JobFailureCode) {
    super(code)
  }
}

async function convertPdf(job: ImportJob): Promise<Converted> {
  const { pages, totalPages, imageCount } = await extractPdfPages(job.bytes, { assetDir: job.pdfjsDir, maxPages: IMPORT_MAX_PDF_PAGES })
  const laid = layoutPdf(pages)
  const warnings: ImportWarning[] = [...laid.warnings]
  if (totalPages > pages.length) warnings.push({ code: 'pagesTruncated', count: totalPages - pages.length })
  // a scanned page is one big picture: reporting it as "pictures skipped" would only confuse
  if (imageCount > 0 && !warnings.some((w) => w.code === 'noText')) warnings.push({ code: 'imagesSkipped', count: imageCount })
  return { markdown: laid.markdown, warnings, stats: { ...laid.stats, ...markdownStats(laid.markdown), pages: totalPages, removedLines: laid.stats.removedLines } }
}

export async function runConversion(job: ImportJob): Promise<Converted> {
  try {
    switch (job.format) {
      case 'pdf':
        return await convertPdf(job)
      case 'docx':
        return await convertDocx(job.bytes)
      case 'xlsx':
        return await convertXlsx(job.bytes)
      case 'pptx':
        return await convertPptx(job.bytes, job.labels)
      case 'html':
        return convertHtml(job.bytes)
    }
  } catch (e) {
    if (e instanceof PdfEncryptedError) throw new JobFailure('encrypted')
    if (e instanceof UnsafeArchiveError) throw new JobFailure('tooLarge')
    throw new JobFailure('unreadable')
  }
}
