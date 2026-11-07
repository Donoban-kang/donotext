import { describe, expect, it } from 'vitest'
import { convertPptx } from '../../src/main/import/pptxConvert'
import { convertXlsx, XLSX_MAX_ROWS } from '../../src/main/import/xlsxConvert'
import { makePptx, makeXlsx } from './helpers/officeFiles'

describe('convertXlsx', () => {
  it('writes each visible sheet as a table and skips hidden sheets', async () => {
    const r = await convertXlsx(
      await makeXlsx([
        { name: '예산', rows: [['항목', '금액'], ['소프트웨어', 1200], ['하드웨어', 3400.5]] },
        { name: '숨김', rows: [['비밀']], hidden: true },
        { name: '메모', rows: [['내용'], ['가나다']] }
      ])
    )
    expect(r.markdown).toContain('## 예산')
    expect(r.markdown).toContain('| 항목 | 금액 |')
    expect(r.markdown).toContain('| 소프트웨어 | 1200 |')
    expect(r.markdown).toContain('| 하드웨어 | 3400.5 |')
    expect(r.markdown).toContain('## 메모')
    expect(r.markdown).not.toContain('비밀')
    expect(r.stats).toMatchObject({ sheets: 2, tables: 2 })
  })

  it('shows dates, percentages and thousands separators as a reader would see them', async () => {
    const r = await convertXlsx(
      await makeXlsx([
        {
          name: 'S',
          rows: [
            ['날짜', '비율', '금액', '월'],
            [{ n: 45292, style: 'date' }, { n: 0.256, style: 'percent' }, { n: 1234567, style: 'thousands' }, { n: 45323, style: 'customDate' }]
          ]
        }
      ])
    )
    expect(r.markdown).toContain('| 2024-01-01 | 26% | 1,234,567 | 2024-02-01 |')
  })

  it('reads booleans, empty cells and removes floating point noise', async () => {
    const r = await convertXlsx(await makeXlsx([{ name: 'S', rows: [['a', 'b', 'c'], [true, null, 0.1 + 0.2]] }]))
    expect(r.markdown).toContain('| TRUE |   | 0.3 |')
  })

  it('honours the 1904 date system', async () => {
    const r = await convertXlsx(await makeXlsx([{ name: 'S', rows: [['d'], [{ n: 0, style: 'date' }]] }], { date1904: true }))
    expect(r.markdown).toContain('1904-01-01')
  })

  it('escapes pipes and keeps a cell on one line', async () => {
    const r = await convertXlsx(await makeXlsx([{ name: 'S', rows: [['x'], ['a|b\nc']] }]))
    expect(r.markdown).toContain('a\\|b c')
  })

  it('cuts very long sheets and says how many rows were left out', async () => {
    const rows = Array.from({ length: XLSX_MAX_ROWS + 25 }, (_, k) => [`행${k}`])
    const r = await convertXlsx(await makeXlsx([{ name: 'S', rows }]))
    expect(r.warnings).toEqual([{ code: 'rowsTruncated', count: 25 }])
  })

  it('rejects a file that is not a workbook', async () => {
    await expect(convertXlsx(new Uint8Array([1, 2, 3]))).rejects.toBeTruthy()
  })
})

describe('convertPptx', () => {
  const labels = { slide: 'Slide', notes: 'Notes' }

  it('writes a section per slide in order with title, bullets, tables and notes', async () => {
    const r = await convertPptx(
      await makePptx([
        { title: '사업 개요', body: ['첫 항목', { text: '하위 항목', lvl: 1 }], notes: '발표 시 강조할 점' },
        { textBox: ['제목 없는 슬라이드의 글'], table: [['구분', '값'], ['가', '1']] }
      ]),
      labels
    )
    expect(r.markdown).toContain('## 사업 개요')
    expect(r.markdown).toContain('- 첫 항목')
    expect(r.markdown).toContain('    - 하위 항목')
    expect(r.markdown).toContain('> **Notes** 발표 시 강조할 점')
    expect(r.markdown).toContain('## Slide 2')
    expect(r.markdown).toContain('제목 없는 슬라이드의 글')
    expect(r.markdown).toContain('| 구분 | 값 |')
    expect(r.markdown.indexOf('사업 개요')).toBeLessThan(r.markdown.indexOf('Slide 2'))
    expect(r.markdown).toContain('\n---\n')
    expect(r.markdown).not.toMatch(/^1$/m) // the slide number field is not text
    expect(r.stats.slides).toBe(2)
  })

  it('counts pictures and reports them as skipped', async () => {
    const r = await convertPptx(await makePptx([{ title: 't', images: 3 }]), labels)
    expect(r.warnings).toEqual([{ code: 'imagesSkipped', count: 3 }])
  })

  it('rejects a file that is not a presentation', async () => {
    await expect(convertPptx(new Uint8Array([1, 2, 3]), labels)).rejects.toBeTruthy()
  })
})
