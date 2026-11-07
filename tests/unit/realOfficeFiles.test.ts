// Files written by python-docx, python-pptx, openpyxl and reportlab (see tests/fixtures/import/make-office-samples.py).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertDocx, demoteHeadingsBelowTitle } from '../../src/main/import/docxConvert'
import { extractPdfPages } from '../../src/main/import/pdfExtract'
import { layoutPdf } from '../../src/main/import/pdfLayout'
import { convertPptx } from '../../src/main/import/pptxConvert'
import { convertXlsx } from '../../src/main/import/xlsxConvert'

const load = (name: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, '../fixtures/import', name)))
const assetDir = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))

describe('real Word file', () => {
  it('keeps the title as # and moves Heading 1 below it', async () => {
    const r = await convertDocx(load('real.docx'))
    expect(r.markdown).toContain('# 2026년 정보보안 점검 결과 보고')
    expect(r.markdown).toContain('## 1. 추진 배경')
    expect(r.markdown).toContain('## 2. 점검 결과')
  })
  it('converts lists, tables and emphasis with single-space markers', async () => {
    const r = await convertDocx(load('real.docx'))
    expect(r.markdown).toMatch(/^- 점검 대상 확인$/m)
    expect(r.markdown).toMatch(/^1\. 개선과제 도출$/m)
    expect(r.markdown).toContain('| 관리 | 개인정보 처리방침 게시 | 10 |')
    expect(r.markdown).toContain('**굵은 글씨와**')
    expect(r.markdown).toContain('*기울임*')
  })
})

describe('demoteHeadingsBelowTitle', () => {
  it('leaves documents without a title alone', () => {
    expect(demoteHeadingsBelowTitle('<h1>a</h1><h2>b</h2>')).toBe('<h1>a</h1><h2>b</h2>')
  })
  it('shifts every other heading one level down, up to 6', () => {
    expect(demoteHeadingsBelowTitle('<h1 class="dn-title">t</h1><h1>a</h1><h2>b</h2><h6>c</h6>')).toBe('<h1>t</h1><h2>a</h2><h3>b</h3><h6>c</h6>')
  })
})

describe('real PowerPoint file', () => {
  it('reads titles, inherited bullets, nested levels, tables, notes and text boxes', async () => {
    const r = await convertPptx(load('real.pptx'), { slide: 'Slide', notes: 'Notes' })
    expect(r.markdown).toContain('## 사업 개요')
    expect(r.markdown).toContain('- 첫 번째 항목\n    - 하위 항목\n- 두 번째 항목')
    expect(r.markdown).toContain('> **Notes** 발표 때 강조할 점입니다.')
    expect(r.markdown).toContain('| 소프트웨어 | 1,200 |')
    expect(r.markdown).toContain('## Slide 3')
    expect(r.markdown).toContain('제목 없는 슬라이드의 글')
    expect(r.stats.slides).toBe(3)
  })
})

describe('real Excel file', () => {
  it('decodes Korean text stored as numeric character references', async () => {
    const r = await convertXlsx(load('real.xlsx'))
    expect(r.markdown).not.toContain('&#')
    expect(r.markdown).toContain('## 예산')
    expect(r.markdown).toContain('| 항목 | 금액 | 비율 | 날짜 |')
  })
  it('formats numbers, percentages and dates and skips hidden sheets and uncalculated formulas', async () => {
    const r = await convertXlsx(load('real.xlsx'))
    expect(r.markdown).toContain('| 소프트웨어 | 1,234,567 | 25.6% | 2026-05-01 |')
    expect(r.markdown).toContain('| 하드웨어 | 3400.5 | 50% | 2026-05-02 14:30 |')
    expect(r.markdown).toContain('| 합친 셀 |')
    expect(r.markdown).not.toContain('비밀')
    expect(r.markdown).not.toContain('=B2')
  })
})

describe('PDF whose Korean font is not embedded', () => {
  it('still extracts the text through the built-in character maps', async () => {
    const { pages } = await extractPdfPages(load('cid.pdf'), { assetDir, maxPages: 5 })
    const r = layoutPdf(pages)
    expect(r.markdown).toContain('# 2026년 학교 정보보안 점검 계획')
    expect(r.markdown).toContain('1. 관련: 교육부 정보보안과-1234')
    expect(r.markdown).toContain('    - 가. 점검 기간: 2026. 5. 1. \\~ 5. 31.')
    expect(r.warnings).toEqual([])
  })
})
