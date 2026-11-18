// Types shared by the document -> Markdown import (main process converters and the renderer UI).

export type ImportFormat = 'pdf' | 'docx' | 'html' | 'xlsx' | 'pptx' | 'image'

/** Limits applied to every conversion (guards against huge or hostile files). */
export const IMPORT_MAX_BYTES = 100 * 1024 * 1024
export const IMPORT_MAX_PDF_PAGES = 500
/** A conversion is stopped after this long without a sign of progress (OCR reports one per page). */
export const IMPORT_TIMEOUT_MS = 60_000
/** ...and in any case after this long. */
export const IMPORT_MAX_TOTAL_MS = 20 * 60_000
/** Most scanned pages read by OCR in one PDF. */
export const IMPORT_MAX_OCR_PAGES = 100

/** Words the converter writes into the Markdown itself; they come from the UI language. */
export interface ImportLabels {
  slide: string
  notes: string
  /** Note placed at the top of a document that was read by OCR. */
  ocrNote: string
}

/** Progress of a long conversion (OCR): `done` of `total` pages finished. */
export interface ImportProgress {
  name: string
  done: number
  total: number
}

/**
 * Notes about what the converter could not carry over. Codes (not texts) cross the process boundary;
 * the renderer maps them to Korean messages.
 */
export type ImportWarningCode =
  /** A PDF has (almost) no text layer: a scanned image. OCR is not part of the app. */
  | 'noText'
  /** Many characters could not be mapped to real text (broken font encoding). */
  | 'garbled'
  /** Only the first pages were converted. */
  | 'pagesTruncated'
  /** A sheet was longer than the limit; `count` rows were left out. */
  | 'rowsTruncated'
  /** Embedded pictures were left out. `count` is how many. */
  | 'imagesSkipped'
  /** Text was read from pictures by OCR (`count` = pages or pictures). */
  | 'ocrUsed'
  /** OCR was unsure about `count` lines; they are highlighted. */
  | 'ocrUncertain'
  /** `count` scanned pages could not be read (no usable picture in the file). */
  | 'ocrFailed'

export interface ImportWarning {
  code: ImportWarningCode
  count?: number
}

export interface ImportStats {
  pages?: number
  sheets?: number
  slides?: number
  chars: number
  headings: number
  tables: number
  listItems: number
  /** Repeated header/footer and page-number lines that were dropped (PDF only). */
  removedLines?: number
}

export interface ImportResult {
  ok: true
  format: ImportFormat
  /** Suggested name for the new document (source file name without its extension). */
  baseName: string
  markdown: string
  warnings: ImportWarning[]
  stats: ImportStats
}

export type ImportErrorCode =
  | 'tooLarge'
  | 'unsupported'
  | 'unreadable'
  | 'encrypted'
  | 'timeout'
  | 'notAllowed'
  | 'ocrUnavailable'
  | 'failed'

export interface ImportFailure {
  ok: false
  code: ImportErrorCode
  /** File name (with extension) for the message shown to the user. */
  name: string
}

export type ImportOutcome = ImportResult | ImportFailure

const EXT_TO_FORMAT: Record<string, ImportFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  html: 'html',
  htm: 'html',
  xlsx: 'xlsx',
  pptx: 'pptx',
  png: 'image',
  jpg: 'image',
  jpeg: 'image'
}

/** The importable format of a file name, or null. Case-insensitive. */
export function importFormatOf(name: string): ImportFormat | null {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_TO_FORMAT[name.slice(dot + 1).toLowerCase()] ?? null
}
