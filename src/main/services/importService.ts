import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { IMPORT_MAX_BYTES, IMPORT_TIMEOUT_MS, importFormatOf, type ImportOutcome } from '../../shared/importTypes'
import type { ImportJob, JobFailureCode } from '../import/convert'
import type { PptxLabels } from '../import/pptxConvert'
import type { Converted } from '../import/types'

/** Runs a job somewhere that can be stopped (a worker thread). Rejects with `timeout` or a failure code. */
export type JobRunner = (job: ImportJob, timeoutMs: number) => Promise<Converted>

export class ImportTimeoutError extends Error {}
export class ImportJobError extends Error {
  constructor(readonly code: JobFailureCode) {
    super(code)
  }
}

export interface ImportServiceDeps {
  run: JobRunner
  /** Directory of the installed `pdfjs-dist` package. */
  pdfjsDir: string
  /** Only paths this returns true for may be converted (the files the user dropped or chose). */
  isAllowed: (path: string) => boolean
  timeoutMs?: number
}

export class ImportService {
  constructor(private readonly deps: ImportServiceDeps) {}

  /** Converts a file the user picked or dropped. Never throws: every problem is an `ok: false` outcome. */
  async importFile(path: string, labels: PptxLabels): Promise<ImportOutcome> {
    const name = basename(path)
    if (!this.deps.isAllowed(path)) return { ok: false, code: 'notAllowed', name }
    const format = importFormatOf(path)
    if (!format) return { ok: false, code: 'unsupported', name }
    let bytes: Uint8Array
    try {
      const info = await stat(path)
      if (!info.isFile()) return { ok: false, code: 'unreadable', name }
      if (info.size > IMPORT_MAX_BYTES) return { ok: false, code: 'tooLarge', name }
      bytes = new Uint8Array(await readFile(path))
    } catch {
      return { ok: false, code: 'unreadable', name }
    }
    try {
      const result = await this.deps.run({ format, bytes, labels, pdfjsDir: this.deps.pdfjsDir }, this.deps.timeoutMs ?? IMPORT_TIMEOUT_MS)
      return {
        ok: true,
        format,
        baseName: basename(path, extname(path)),
        markdown: result.markdown,
        warnings: result.warnings,
        stats: result.stats
      }
    } catch (e) {
      if (e instanceof ImportTimeoutError) return { ok: false, code: 'timeout', name }
      if (e instanceof ImportJobError) return { ok: false, code: e.code, name }
      return { ok: false, code: 'failed', name }
    }
  }
}
