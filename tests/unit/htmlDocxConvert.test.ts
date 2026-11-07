import { describe, expect, it } from 'vitest'
import { convertDocx } from '../../src/main/import/docxConvert'
import { convertHtml } from '../../src/main/import/htmlConvert'
import { makeDocx } from './helpers/officeFiles'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('convertHtml', () => {
  it('converts headings, lists, emphasis, links and tables', () => {
    const r = convertHtml(
      enc(
        `<html><head><title>x</title><style>p{}</style></head><body><h1>제목</h1><p>본문 <strong>강조</strong> 와 <a href="https://example.com/a">링크</a></p><ul><li>하나</li><li>둘</li></ul><table><tr><th>구분</th><th>값</th></tr><tr><td>가</td><td>1</td></tr></table></body></html>`
      )
    )
    expect(r.markdown).toContain('# 제목')
    expect(r.markdown).toContain('**강조**')
    expect(r.markdown).toContain('[링크](https://example.com/a)')
    expect(r.markdown).toMatch(/^- +하나$/m)
    expect(r.markdown).toContain('| 구분 | 값 |')
    expect(r.markdown).not.toContain('p{}')
    expect(r.stats).toMatchObject({ headings: 1, tables: 1, listItems: 2 })
  })

  it('drops scripts, unsafe links and images, and counts the images', () => {
    const r = convertHtml(enc(`<p>앞<script>alert(1)</script><a href="javascript:alert(1)">누르기</a><img src="a.png"><img src="b.png"> 뒤</p>`))
    expect(r.markdown).not.toContain('alert')
    expect(r.markdown).not.toContain('javascript')
    expect(r.markdown).toContain('누르기')
    expect(r.markdown).not.toContain('a.png')
    expect(r.warnings).toEqual([{ code: 'imagesSkipped', count: 2 }])
  })

  it('escapes dollar signs so they are not read as math', () => {
    expect(convertHtml(enc('<p>가격 $5 와 $6</p>')).markdown).toContain('\\$5 와 \\$6')
  })

  it('turns tables without a header row into Markdown tables, never raw HTML', () => {
    const r = convertHtml(
      enc(
        `<table><caption>표 1</caption><tr><td colspan="2"><p>합친 칸</p></td><td>셋</td></tr><tr><td><p>첫째</p><p>둘째 문단</p></td><td>a|b</td><td></td></tr></table>`
      )
    )
    expect(r.markdown).not.toMatch(/<\/?(table|tr|td|p)\b/)
    expect(r.markdown).toContain('**표 1**')
    expect(r.markdown).toContain('| 합친 칸 |   | 셋 |')
    expect(r.markdown).toContain('| 첫째 둘째 문단 | a\\|b |   |')
  })

  it('keeps only the text of a table nested in a cell', () => {
    const r = convertHtml(enc(`<table><tr><td>바깥<table><tr><td>안쪽</td></tr></table></td><td>옆</td></tr></table>`))
    expect(r.markdown).toContain('바깥')
    expect(r.markdown).toContain('안쪽')
    expect(r.stats.tables).toBe(1)
  })

  it('returns empty text for an empty page', () => {
    expect(convertHtml(enc('<html><body></body></html>')).markdown).toBe('')
  })
})

describe('convertDocx', () => {
  it('converts English and Korean heading styles, bold and tables', async () => {
    const bytes = await makeDocx(
      [
        { text: '보고서 제목', style: 'Heading1' },
        { text: '한글 제목 스타일', style: 'Style1' },
        { text: '둘째 제목', style: 'Heading2' },
        { text: '굵은 글', bold: true },
        { text: '일반 문단입니다.' }
      ],
      { table: [['구분', '값'], ['가', '1']] }
    )
    const r = await convertDocx(bytes)
    expect(r.markdown).toContain('# 보고서 제목')
    expect(r.markdown).toContain('# 한글 제목 스타일')
    expect(r.markdown).toContain('## 둘째 제목')
    expect(r.markdown).toContain('**굵은 글**')
    expect(r.markdown).toContain('일반 문단입니다.')
    expect(r.markdown).toContain('| 구분 | 값 |')
    expect(r.stats.tables).toBe(1)
  })

  it('leaves pictures out and reports how many', async () => {
    const r = await convertDocx(await makeDocx([{ text: '그림이 있는 문서' }], { images: 2 }))
    expect(r.markdown).toContain('그림이 있는 문서')
    expect(r.markdown).not.toContain('![')
    expect(r.warnings).toEqual([{ code: 'imagesSkipped', count: 2 }])
  })

  it('rejects a file that is not a docx', async () => {
    await expect(convertDocx(new Uint8Array([1, 2, 3]))).rejects.toBeTruthy()
  })
})
