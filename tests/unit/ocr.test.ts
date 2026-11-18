import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runConversion, type ImportJob } from '../../src/main/import/convert'
import { isUncertain, mergeHighlights, ocrPageToLayout, type OcrLine, type OcrPage } from '../../src/main/import/ocr'
import { layoutPdf } from '../../src/main/import/pdfLayout'

const word = (text: string, x0: number, confidence = 93) => ({ text, confidence, x0, y0: 100, x1: x0 + 10 * text.length, y1: 130 })
function line(words: Array<[string, number?]>, y = 100, confidence = 93): OcrLine {
  let x = 100
  const ws = words.map(([t, c]) => {
    const w = { ...word(t, x, c ?? 93), y0: y, y1: y + 30 }
    x += 10 * t.length + 12
    return w
  })
  return { text: ws.map((w) => w.text).join(' '), confidence, words: ws, x0: ws[0]!.x0, y0: y, x1: ws[ws.length - 1]!.x1, y1: y + 30 }
}

describe('isUncertain', () => {
  it('trusts a clean line and doubts a low-confidence one', () => {
    expect(isUncertain(line([['수신', 96], ['각급', 96], ['학교장', 96]], 100, 96))).toBe(false)
    expect(isUncertain(line([['수신'], ['각급']], 100, 60))).toBe(true)
  })
  it('doubts a line with one very weak word, or full of one-letter fragments', () => {
    expect(isUncertain(line([['교육부'], ['과', 43], ['1234']]))).toBe(true)
    expect(isUncertain(line([['정'], ['보'], ['보'], ['안'], ['점검']]))).toBe(true)
  })
  it('leaves ordinary single-syllable function words alone', () => {
    expect(isUncertain(line([['할', 93], ['수', 93], ['있는', 93], ['사업을', 93], ['추진합니다.', 93]]))).toBe(false)
  })
})

describe('ocrPageToLayout', () => {
  it('maps words to positioned fragments and marks only the doubtful lines', () => {
    const page: OcrPage = { lines: [line([['수신'], ['학교장']], 100), line([['흐'], ['x'], ['아']], 200, 60)] }
    const { input, uncertain } = ocrPageToLayout(page)
    expect(uncertain).toBe(1)
    expect(input.items.map((i) => i.str)).toEqual(['수신', '학교장', '==흐', 'x', '아=='])
    expect(input.height).toBeGreaterThan(230)
    // the layout engine reads them back as two lines
    expect(layoutPdf([input]).markdown).toContain('==흐 x 아==')
  })
  it('puts a misread circle bullet back so the line becomes a list item', () => {
    const page: OcrPage = { lines: [line([['<'], ['세부'], ['점검'], ['항목']], 100), line([['본문'], ['문장'], ['입니다']], 160)] }
    const md = layoutPdf([ocrPageToLayout(page).input]).markdown
    expect(md).toMatch(/^- 세부 점검 항목/m)
  })
  it('starts the highlight after a list marker so the line stays a list item', () => {
    const page: OcrPage = { lines: [line([['1.'], ['흐릿한'], ['줄']], 100, 50), line([['본문'], ['문장'], ['입니다']], 200)] }
    const md = layoutPdf([ocrPageToLayout(page).input]).markdown
    expect(md).toContain('1. ==흐릿한 줄==')
  })
  it('does not turn an ordinary first word into a bullet', () => {
    const page: OcrPage = { lines: [line([['OK'], ['세부'], ['항목']], 100)] }
    expect(layoutPdf([ocrPageToLayout(page).input]).markdown).not.toMatch(/^- /m)
  })
})

describe('mergeHighlights', () => {
  it('joins highlights that follow each other', () => {
    expect(mergeHighlights('==첫 줄== ==둘째 줄== 끝')).toBe('==첫 줄 둘째 줄== 끝')
    expect(mergeHighlights('==가==\n\n==나==')).toBe('==가==\n\n==나==')
  })
})

// ---- the real engine on the picture fixtures (slow: a couple of seconds each) ----
const req = createRequire(import.meta.url)
const base: Omit<ImportJob, 'format' | 'bytes'> = {
  labels: { slide: 'S', notes: 'N', ocrNote: 'READ BY OCR' },
  pdfjsDir: dirname(req.resolve('pdfjs-dist/package.json')),
  ocr: { tesseractDir: dirname(req.resolve('tesseract.js/package.json')), langDir: join(__dirname, '../../resources/ocr') }
}
const load = (n: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, '../fixtures/import', n)))
const flat = (s: string): string => s.replace(/[\s=\\>#-]/g, '')

describe('OCR of scans (real engine)', () => {
  it('reads a picture file: key words, numbering, the note at the top, progress', async () => {
    const steps: string[] = []
    const r = await runConversion({ ...base, format: 'image', bytes: load('scan-sample.png') }, (d, t) => steps.push(`${d}/${t}`))
    expect(r.markdown.startsWith('> READ BY OCR\n\n')).toBe(true)
    expect(flat(r.markdown)).toContain(flat('수신 각급 학교장'))
    expect(r.markdown).toContain('AICBM')
    expect(r.markdown).toContain('2026. 5. 1.')
    expect(r.markdown).toMatch(/^1\. 관련/m)
    expect(r.markdown).toMatch(/^ {4}- 가\. 점검 기간/m)
    expect(r.warnings[0]).toEqual({ code: 'ocrUsed', count: 1 })
    expect(steps).toEqual(['0/1', '1/1'])
  }, 60_000)

  it('reads a scanned PDF whose pages are a JPEG and a 1-bit CCITT picture', async () => {
    const steps: string[] = []
    const r = await runConversion({ ...base, format: 'pdf', bytes: load('scan-sample.pdf') }, (d, t) => steps.push(`${d}/${t}`))
    expect(r.warnings.find((w) => w.code === 'ocrUsed')).toEqual({ code: 'ocrUsed', count: 2 })
    expect(r.warnings.some((w) => w.code === 'noText')).toBe(false)
    expect((r.markdown.match(/AICBM/g) ?? []).length).toBe(2) // both pages were read
    expect(r.markdown).toContain('\n---\n')
    expect(steps).toEqual(['0/2', '1/2', '2/2'])
    expect(r.stats.pages).toBe(2)
  }, 60_000)

  it('keeps a real text page as it is and reads only the scanned page, in page order', async () => {
    const steps: string[] = []
    const r = await runConversion({ ...base, format: 'pdf', bytes: load('mixed.pdf') }, (d, t) => steps.push(`${d}/${t}`))
    expect(steps).toEqual(['0/1', '1/1']) // one page needed reading
    expect(r.markdown.indexOf('1쪽은 글자가 들어 있는 쪽입니다.')).toBeGreaterThan(-1)
    expect(r.markdown.indexOf('1쪽은')).toBeLessThan(r.markdown.indexOf('AICBM'))
    expect(r.warnings.find((w) => w.code === 'ocrUsed')).toEqual({ code: 'ocrUsed', count: 1 })
  }, 60_000)

  it('without an OCR engine a scan is reported as having no text (nothing is made up)', async () => {
    const r = await runConversion({ ...base, ocr: null, format: 'pdf', bytes: load('scan-sample.pdf') })
    expect(r.markdown).toBe('')
    expect(r.warnings).toContainEqual({ code: 'noText' })
  })

  it('refuses a picture file when OCR is unavailable', async () => {
    await expect(runConversion({ ...base, ocr: null, format: 'image', bytes: load('scan-sample.png') })).rejects.toMatchObject({ code: 'ocrUnavailable' })
  })

  it('reports a page without any picture or text as no text, and a broken picture file as unreadable', async () => {
    const blank = await runConversion({ ...base, format: 'pdf', bytes: load('blank.pdf') })
    expect(blank.warnings).toContainEqual({ code: 'noText' })
    await expect(runConversion({ ...base, format: 'image', bytes: new Uint8Array([1, 2, 3, 4]) })).rejects.toMatchObject({ code: 'unreadable' })
  }, 60_000)
})
