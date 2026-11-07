import { describe, expect, it } from 'vitest'
import { detectWrapMode, escapeMarkdown, joinWrapped, layoutPdf, type PdfPageInput, type PdfTextItem } from '../../src/main/import/pdfLayout'

const W = 595
const H = 842

const widthOf = (s: string, fs: number): number => [...s].reduce((n, c) => n + (/[ -~]/.test(c) ? fs * 0.5 : fs), 0)

/** One text run on a line. `top` is measured from the page top, like a ruler. */
function run(text: string, top: number, x = 56, fs = 10, bold = false): PdfTextItem {
  return { str: text, x, y: H - top, width: widthOf(text, fs), height: fs, bold }
}

const page = (...items: PdfTextItem[]): PdfPageInput => ({ width: W, height: H, items })

/** Body text lines of a paragraph at 17pt pitch starting at `top`. */
function lines(texts: string[], top: number, x = 56): PdfTextItem[] {
  return texts.map((t, k) => run(t, top + k * 17, x))
}

// Full-width Korean lines (about 480pt wide) and a short last line.
const FULL = '가나다라마바사아자차카타파하'.repeat(3).slice(0, 48) // 48 syllables = 480pt

describe('layoutPdf: paragraphs', () => {
  it('joins wrapped lines into one paragraph and keeps separate paragraphs apart', () => {
    const r = layoutPdf([
      page(
        ...lines([`${FULL}를`, `${FULL}는`, '끝나는 줄입니다.'], 100),
        ...lines([`${FULL}를`, `${FULL}는`, '두번째 문단 끝.'], 200)
      )
    ])
    const paras = r.markdown.trim().split('\n\n')
    expect(paras).toHaveLength(2)
    expect(paras[0]).toContain('끝나는 줄입니다.')
    expect(paras[1]).toContain('두번째 문단 끝.')
  })

  it('does not merge short lines that are separate paragraphs', () => {
    const r = layoutPdf([page(run('수신 각급 학교장', 100), run('(경유)', 117), run('제목 점검 계획 알림', 134))])
    expect(r.markdown.trim().split('\n\n')).toHaveLength(3)
  })

  it('continues a paragraph across a page break', () => {
    const r = layoutPdf([
      page(...lines([`${FULL}를`, `${FULL}는`, `${FULL}를`], 700)),
      page(...lines(['이어지는 마지막 줄.'], 60))
    ])
    expect(r.markdown.trim().split('\n\n')).toHaveLength(1)
    expect(r.markdown).toContain('이어지는 마지막 줄.')
  })
})

describe('layoutPdf: headers, footers, page numbers', () => {
  const body = (n: number): PdfPageInput =>
    page(
      run('○○교육지원청 점검계획', 30, 400),
      ...lines([`본문 ${n}쪽 첫 줄입니다.`], 120),
      run(`- ${n} -`, 800, 285)
    )

  it('drops text that repeats at the page edges and lone page numbers', () => {
    const r = layoutPdf([body(1), body(2), body(3)])
    expect(r.markdown).not.toContain('교육지원청')
    expect(r.markdown).not.toMatch(/- \d -/)
    expect(r.markdown).toContain('본문 1쪽')
    expect(r.markdown).toContain('본문 3쪽')
    expect(r.stats.removedLines).toBe(6)
  })

  it('keeps a body line that merely looks like a number when it is not at the edge', () => {
    const r = layoutPdf([page(run('분기별 합계 금액 표', 300), run('12', 317))])
    expect(r.markdown).toContain('12')
  })
})

describe('layoutPdf: headings', () => {
  it('uses larger font sizes as heading levels, largest first', () => {
    const r = layoutPdf([
      page(
        run('큰 제목', 80, 56, 24),
        run('중간 제목', 130, 56, 16),
        ...lines([`${FULL}를`, `${FULL}는`, '본문 끝.'], 180)
      )
    ])
    expect(r.markdown).toContain('# 큰 제목')
    expect(r.markdown).toContain('## 중간 제목')
    expect(r.stats.headings).toBe(2)
  })

  it('does not turn a numbered line into a heading just because it is big', () => {
    const r = layoutPdf([page(run('1. 크게 쓴 번호 줄', 80, 56, 16), ...lines([`${FULL}를`, '본문 끝.'], 130))])
    expect(r.markdown).not.toMatch(/^#/m)
  })
})

describe('layoutPdf: Korean official-document numbering', () => {
  it('turns 1. / 가. / ○ / - into nested lists by indent', () => {
    const r = layoutPdf([
      page(
        run('1. 관련 근거', 100, 56),
        run('2. 점검을 추진합니다.', 120, 56),
        run('가. 점검 기간: 5월', 140, 71),
        run('나. 점검 대상: 전체', 160, 71),
        run('○ 세부 내용입니다', 180, 86),
        run('- 붙임 참조', 200, 86)
      )
    ])
    expect(r.markdown.trim().split('\n')).toEqual([
      '1. 관련 근거',
      '2. 점검을 추진합니다.',
      '    - 가. 점검 기간: 5월',
      '    - 나. 점검 대상: 전체',
      '        - 세부 내용입니다',
      '        - 붙임 참조'
    ])
    expect(r.stats.listItems).toBe(6)
  })

  it('does not read a date at the start of a line as list item 2026', () => {
    const r = layoutPdf([page(run('2026. 5. 1. 부터 시행합니다', 100))])
    expect(r.markdown).not.toMatch(/^2026\. /)
    expect(r.markdown).toContain('2026')
  })

  it('keeps a wrapped list item together with its continuation line', () => {
    const r = layoutPdf([
      page(
        run(`○ ${FULL.slice(0, 46)}를`, 100, 86),
        run('이어지는 설명입니다.', 117, 100),
        run('○ 다음 항목', 134, 86)
      )
    ])
    const out = r.markdown.trim().split('\n')
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('이어지는 설명입니다.')
  })
})

describe('layoutPdf: tables', () => {
  it('builds a Markdown table; centred header cells still land in the right columns', () => {
    const r = layoutPdf([
      page(
        run('구분', 100, 80),
        run('항목', 100, 286),
        run('배점', 100, 494),
        run('관리', 117, 58),
        run('개인정보 처리방침 게시', 117, 126),
        run('10', 117, 494),
        run('기술', 134, 58),
        run('PC 백신 설치', 134, 126),
        run('20', 134, 494)
      )
    ])
    expect(r.markdown.trim().split('\n')).toEqual([
      '| 구분 | 항목 | 배점 |',
      '| --- | --- | --- |',
      '| 관리 | 개인정보 처리방침 게시 | 10 |',
      '| 기술 | PC 백신 설치 | 20 |'
    ])
    expect(r.stats.tables).toBe(1)
  })

  it('puts a row with a missing cell under the nearest column', () => {
    const r = layoutPdf([
      page(
        run('가', 100, 60),
        run('나', 100, 260),
        run('다', 100, 460),
        run('1', 117, 60),
        run('3', 117, 460),
        run('4', 134, 60),
        run('5', 134, 260),
        run('6', 134, 460)
      )
    ])
    expect(r.markdown).toContain('| 1 |   | 3 |')
  })

  it('escapes pipes inside cells', () => {
    const r = layoutPdf([page(run('a|b 항목', 100, 60), run('c 설명입니다', 100, 300), run('d 항목', 117, 60), run('e 설명입니다', 117, 300))])
    expect(r.markdown).toContain('a\\|b')
  })

  it('does not make a table from a single wide gap', () => {
    const r = layoutPdf([page(run('왼쪽 글', 100, 60), run('오른쪽 글', 100, 400))])
    expect(r.stats.tables).toBe(0)
  })
})

describe('layoutPdf: problems are reported, not hidden', () => {
  it('reports a page without text as noText', () => {
    const r = layoutPdf([page(), page()])
    expect(r.markdown).toBe('')
    expect(r.warnings).toEqual([{ code: 'noText' }])
  })

  it('reports private-use characters as garbled', () => {
    const r = layoutPdf([page(run(' 정상', 100))])
    expect(r.warnings.some((w) => w.code === 'garbled')).toBe(true)
  })
})

describe('escapeMarkdown', () => {
  it('escapes characters the editor would read as syntax', () => {
    expect(escapeMarkdown('가격은 $100 * 2 <b> [a] a_b')).toBe('가격은 \\$100 \\* 2 \\<b\\> \\[a\\] a\\_b')
  })
  it('leaves URLs intact', () => {
    expect(escapeMarkdown('참고 https://example.com/a_b?x=1 입니다')).toBe('참고 https://example.com/a_b?x=1 입니다')
  })
  it('protects a line that would start a heading or list', () => {
    expect(escapeMarkdown('# not heading')).toBe('\\# not heading')
    expect(escapeMarkdown('2026. 5. 1.')).toBe('2026\\. 5. 1.')
  })
})

describe('joinWrapped / detectWrapMode', () => {
  it('uses a space at word-wrapped breaks and none at character-wrapped breaks', () => {
    expect(joinWrapped('수준을', '높이고', 'word')).toBe('수준을 높이고')
    expect(joinWrapped('합니', '다.', 'char')).toBe('합니다.')
  })
  it('forces a space when the break is certainly a word boundary', () => {
    expect(joinWrapped('예방하기', '위하여', 'char', true)).toBe('예방하기 위하여')
  })
  it('joins English hyphenation and keeps closing punctuation attached', () => {
    expect(joinWrapped('informa-', 'tion')).toBe('information')
    expect(joinWrapped('끝', ').')).toBe('끝).')
    expect(joinWrapped('hello', 'world')).toBe('hello world')
  })
  it('detects word wrapping from particles and punctuation at line ends', () => {
    const word = ['수준을', '사고를', '학교는', '문서의', '업무에', '결과를', '계획은', '시스템이', '평가로', '지원도']
    const char = ['수준을 높', '사고 예방하', '학교별 점', '문서 작성', '업무 처', '결과 종', '계획 수', '시스템 운', '평가 방', '지원 대']
    expect(detectWrapMode(word)).toBe('word')
    expect(detectWrapMode(char)).toBe('char')
    expect(detectWrapMode(['가', '나'])).toBe('word') // too few samples
  })
})
