import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JobFailure, runConversion, type ImportJob } from '../../src/main/import/convert'
import type { ImportFormat } from '../../src/shared/importTypes'

const pdfjsDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const load = (name: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, '../fixtures/import', name)))
const job = (format: ImportFormat, bytes: Uint8Array): ImportJob => ({ format, bytes, labels: { slide: 'Slide', notes: 'Notes' }, pdfjsDir })

describe('runConversion', () => {
  it('converts each format from its real sample', async () => {
    expect((await runConversion(job('pdf', load('cid.pdf')))).markdown).toContain('# 2026년 학교 정보보안 점검 계획')
    expect((await runConversion(job('docx', load('real.docx')))).markdown).toContain('## 1. 추진 배경')
    expect((await runConversion(job('xlsx', load('real.xlsx')))).markdown).toContain('## 예산')
    expect((await runConversion(job('pptx', load('real.pptx')))).markdown).toContain('## 사업 개요')
    expect((await runConversion(job('html', new TextEncoder().encode('<h1>안녕</h1>')))).markdown).toContain('# 안녕')
  })

  it('reports the real page count and structure of a PDF', async () => {
    const r = await runConversion(job('pdf', load('sample-gongmun.pdf')))
    expect(r.stats).toMatchObject({ pages: 3, tables: 1 })
    expect(r.stats.headings).toBeGreaterThanOrEqual(3)
  })

  it('reports a PDF without a text layer instead of returning an empty success', async () => {
    const r = await runConversion(job('pdf', load('blank.pdf')))
    expect(r.markdown).toBe('')
    expect(r.warnings).toEqual([{ code: 'noText' }])
  })

  it('recognises a password-protected PDF', async () => {
    await expect(runConversion(job('pdf', load('encrypted.pdf')))).rejects.toMatchObject({ code: 'encrypted' })
  })

  it('turns broken input into an "unreadable" failure for every format', async () => {
    for (const format of ['pdf', 'docx', 'xlsx', 'pptx'] as const) {
      const err = await runConversion(job(format, new Uint8Array([1, 2, 3, 4]))).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(JobFailure)
      expect((err as JobFailure).code).toBe('unreadable')
    }
  })

  it('treats a zip with the wrong content as unreadable, not as a crash', async () => {
    const err = await runConversion(job('docx', load('real.xlsx'))).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JobFailure)
  })
})
