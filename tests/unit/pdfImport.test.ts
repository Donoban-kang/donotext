import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractPdfPages } from '../../src/main/import/pdfExtract'
import { layoutPdf } from '../../src/main/import/pdfLayout'

const assetDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const sample = new Uint8Array(readFileSync(join(__dirname, '../fixtures/import/sample-gongmun.pdf')))

describe('sample official-document PDF (real pdfjs + layout)', () => {
  it('rebuilds title, numbering, table and drops headers/page numbers', async () => {
    const { pages, totalPages } = await extractPdfPages(sample, { assetDir, maxPages: 50 })
    expect(totalPages).toBe(3)
    const r = layoutPdf(pages)
    const md = r.markdown
    expect(md).toContain('# 2026년 학교 정보보안 점검 계획')
    expect(md).toContain('1. 관련: 교육부 정보보안과-1234')
    expect(md).toContain('    - 가. 점검 기간: 2026. 5. 1. \\~ 5. 31.')
    expect(md).toContain('        - 세부 점검 항목은 붙임 참조')
    expect(md).toContain('| 구분 | 항목 | 배점 |')
    expect(md).toContain('| 관리 | 개인정보 처리방침 게시 | 10 |')
    expect(md).toContain('## 제출 방법')
    expect(md).not.toContain('교육지원청 정보보안 점검계획')
    expect(md).not.toMatch(/^\s*- \d -/m)
    expect(r.warnings).toEqual([])
  })

  it('does not lose any text of the body', async () => {
    const { pages } = await extractPdfPages(sample, { assetDir, maxPages: 50 })
    const r = layoutPdf(pages)
    const flat = (s: string): string => s.replace(/[\s\\#|*\-]/g, '').replace(/---/g, '')
    for (const word of ['수신각급학교장', '개인정보처리방침게시', '서버실출입통제', '후속조치를지원하고자합니다']) {
      expect(flat(r.markdown)).toContain(word)
    }
  })

  it('stops at the page limit', async () => {
    const { pages, totalPages } = await extractPdfPages(sample, { assetDir, maxPages: 2 })
    expect(pages).toHaveLength(2)
    expect(totalPages).toBe(3)
  })

  it('rejects a file that is not a PDF', async () => {
    await expect(extractPdfPages(new Uint8Array([1, 2, 3, 4]), { assetDir, maxPages: 5 })).rejects.toBeTruthy()
  })
})
