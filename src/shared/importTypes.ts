// Types shared by the document -> Markdown import (main process converters and the renderer UI).

export type ImportFormat = 'pdf' | 'docx' | 'html' | 'xlsx' | 'pptx'

/** Limits applied to every conversion (guards against huge or hostile files). */
export const IMPORT_MAX_BYTES = 100 * 1024 * 1024
export const IMPORT_MAX_PDF_PAGES = 500
export const IMPORT_TIMEOUT_MS = 60_000

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
  /** Some formatting (fonts, colours, merged cells, ...) was simplified. */
  | 'simplified'

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
  | 'failed'

export interface ImportFailure {
  ok: false
  code: ImportErrorCode
}

export type ImportOutcome = ImportResult | ImportFailure

const EXT_TO_FORMAT: Record<string, ImportFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  html: 'html',
  htm: 'html',
  xlsx: 'xlsx',
  pptx: 'pptx'
}

/** The importable format of a file name, or null. Case-insensitive. */
export function importFormatOf(name: string): ImportFormat | null {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_TO_FORMAT[name.slice(dot + 1).toLowerCase()] ?? null
}
