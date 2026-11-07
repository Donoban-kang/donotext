// PDF layout analysis: positioned text fragments -> Markdown.
//
// PDFs carry no paragraphs, only text runs at coordinates. This module rebuilds structure from geometry:
// lines, repeated header/footer removal, headings (font size), paragraphs (line fill + spacing),
// Korean official-document numbering (1. / 가. / ○ / -), and simple tables (column alignment).
// It is pure (no pdfjs, no I/O) so it can be unit tested with synthetic fragments.

import type { ImportStats, ImportWarning } from '../../shared/importTypes'
import { escapeMarkdown } from './markdownEscape'
import { BULLET_CHARS, CIRCLED_LABELS, LABEL_SYLLABLES, PAGE_NUMBER_UNITS, PARTICLES } from './koreanData'

export { escapeMarkdown }

export interface PdfTextItem {
  str: string
  /** Left edge, PDF points (origin bottom-left). */
  x: number
  /** Baseline, PDF points (origin bottom-left). */
  y: number
  width: number
  /** Approximate font size in points. */
  height: number
  bold?: boolean
}

/** Thin lines drawn on a page (table borders), in the same coordinates as the text. */
export interface PdfRules {
  h: Array<{ y: number; x0: number; x1: number }>
  v: Array<{ x: number; y0: number; y1: number }>
}

export interface PdfPageInput {
  width: number
  height: number
  items: PdfTextItem[]
  rules?: PdfRules
}

export interface PdfLayoutResult {
  markdown: string
  warnings: ImportWarning[]
  stats: ImportStats
}

interface Seg {
  text: string
  x0: number
  x1: number
  bold: boolean
}

interface Line {
  page: number
  y: number
  fs: number
  x0: number
  x1: number
  text: string
  segs: Seg[]
  bold: boolean
  /** The source text run ended with a real space (a certain word boundary when the line wraps). */
  trailingSpace: boolean
  /** Symbol glyphs that stood in front of the text and carry no real character (list numbers drawn from a symbol font). */
  glyphMarker: 'ordered' | 'bullet' | null
  /** Baseline measured from the page top (0 = top edge). */
  fromTop: number
  pageHeight: number
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'item'; level: number; ordered: number | null; text: string }
  | { kind: 'table'; rows: string[][] }

// ---------- small helpers ----------

const PAGE_NUMBER_RE = new RegExp(String.raw`^[-–—~\s]*(?:page\s*)?\d{1,4}(?:\s*[/／]\s*\d{1,4})?[-–—~\s]*(?:${PAGE_NUMBER_UNITS}|p\.?)?$`, 'i')

const HANGUL_RE = /[\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]/
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/
const PUA_RE = /[\uE000-\uF8FF]/
const PUA_ONLY_RE = /^[\uE000-\uF8FF]+$/

// A marker is only a list marker when it is followed by text.
const ORDERED_RE = /^(\d{1,2})\.\s+(?=\S)/
const BULLET_RE = new RegExp(String.raw`^([${BULLET_CHARS}*]|[-–—])\s+(?=\S)`)
const LABEL_RE = new RegExp(
  String.raw`^(?:[${LABEL_SYLLABLES}]\.|[${LABEL_SYLLABLES}]\)|\(\d{1,2}\)|\([${LABEL_SYLLABLES}]\)|\d{1,2}\)|[${CIRCLED_LABELS}])\s*(?=\S)`
)

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}

function normalizeSpaces(s: string): string {
  return s.replace(/[ \t\u00A0]+/g, ' ').trim()
}


// ---------- 1. fragments -> lines ----------

function buildLines(pages: PdfPageInput[]): Line[] {
  const lines: Line[] = []
  pages.forEach((page, pageIndex) => {
    const items = page.items.filter((it) => it.str.trim() !== '' && Number.isFinite(it.x) && Number.isFinite(it.y))
    // top to bottom, then left to right
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const groups: PdfTextItem[][] = []
    let current: PdfTextItem[] = []
    let curY = 0
    let curFs = 0
    for (const it of items) {
      const fs = it.height > 0 ? it.height : 10
      if (current.length === 0) {
        current = [it]
        curY = it.y
        curFs = fs
        continue
      }
      if (Math.abs(it.y - curY) <= 0.45 * Math.max(fs, curFs)) {
        current.push(it)
        curFs = Math.max(curFs, fs)
      } else {
        groups.push(current)
        current = [it]
        curY = it.y
        curFs = fs
      }
    }
    if (current.length) groups.push(current)

    for (const group of groups) {
      group.sort((a, b) => a.x - b.x)
      // List numbers or bullets drawn from a symbol font arrive as private-use characters ("1" "." -> two
      // meaningless glyphs). They are not text: drop them, remember that the line is a list item.
      let glyphs = 0
      let markerX: number | undefined
      while (group.length > 1 && PUA_ONLY_RE.test(group[0]!.str.trim())) {
        glyphs += [...group[0]!.str.trim()].length
        markerX ??= group[0]!.x
        group.shift()
      }
      const fs = Math.max(...group.map((g) => (g.height > 0 ? g.height : 10)))
      const segs: Seg[] = []
      for (const it of group) {
        const text = it.str.replace(/\s+/g, ' ')
        const last = segs[segs.length - 1]
        const gap = last ? it.x - last.x1 : 0
        const bold = Boolean(it.bold)
        if (last && gap <= 1.2 * fs) {
          const needsSpace = gap > 0.15 * fs && !last.text.endsWith(' ') && !text.startsWith(' ')
          last.text += (needsSpace ? ' ' : '') + text
          last.x1 = Math.max(last.x1, it.x + it.width)
          last.bold = last.bold && bold
        } else {
          segs.push({ text, x0: it.x, x1: it.x + it.width, bold })
        }
      }
      for (const s of segs) s.text = normalizeSpaces(s.text)
      const kept = segs.filter((s) => s.text !== '')
      if (kept.length === 0) continue
      lines.push({
        page: pageIndex,
        y: group[0]!.y,
        fs,
        x0: markerX ?? kept[0]!.x0,
        x1: kept[kept.length - 1]!.x1,
        text: kept.map((s) => s.text).join(' '),
        segs: kept,
        bold: kept.every((s) => s.bold),
        trailingSpace: /\s$/.test(group[group.length - 1]!.str),
        glyphMarker: glyphs === 0 ? null : glyphs >= 2 ? 'ordered' : 'bullet',
        fromTop: page.height - group[0]!.y,
        pageHeight: page.height
      })
    }
  })
  return lines
}

// ---------- 2. repeated header / footer / page numbers ----------

function removeFurniture(lines: Line[], pageCount: number): { kept: Line[]; removed: number } {
  const edge = (l: Line): boolean => l.fromTop < l.pageHeight * 0.12 || l.fromTop > l.pageHeight * 0.88
  const keyOf = (l: Line): string => l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
  const pagesWithKey = new Map<string, Set<number>>()
  for (const l of lines) {
    if (!edge(l)) continue
    const key = keyOf(l)
    let set = pagesWithKey.get(key)
    if (!set) pagesWithKey.set(key, (set = new Set()))
    set.add(l.page)
  }
  const needed = Math.max(2, Math.ceil(pageCount * 0.5))
  const kept: Line[] = []
  let removed = 0
  for (const l of lines) {
    if (edge(l)) {
      const repeated = (pagesWithKey.get(keyOf(l))?.size ?? 0) >= needed
      if (repeated || PAGE_NUMBER_RE.test(l.text)) {
        removed++
        continue
      }
    }
    kept.push(l)
  }
  return { kept, removed }
}

// ---------- 3. line classification ----------

interface Marker {
  kind: 'ordered' | 'bullet' | 'label'
  number: number | null
  /** Text after the marker (labels keep their marker text). */
  rest: string
}

function detectMarker(text: string): Marker | null {
  const ordered = ORDERED_RE.exec(text)
  if (ordered) {
    // at most two digits, so "2026. 5. 1." (a date) is not read as item 2026
    return { kind: 'ordered', number: Number(ordered[1]), rest: text.slice(ordered[0].length) }
  }
  const bullet = BULLET_RE.exec(text)
  if (bullet) {
    return { kind: 'bullet', number: null, rest: text.slice(bullet[0].length) }
  }
  const label = LABEL_RE.exec(text)
  if (label) return { kind: 'label', number: null, rest: text }
  return null
}

/** The list marker of a line: a real one in its text, or symbol glyphs that were in front of it. */
function markerOf(line: Line): Marker | null {
  if (line.glyphMarker === 'ordered') return { kind: 'ordered', number: 0, rest: line.text } // number 0 = "count for me"
  if (line.glyphMarker === 'bullet') return { kind: 'bullet', number: null, rest: line.text }
  return detectMarker(line.text)
}

function cellular(line: Line): boolean {
  if (line.segs.length < 2) return false
  // "1.   text" with a wide tab gap is a list marker, not two cells
  const first = line.segs[0]!.text
  if (detectMarker(`${first} x`) && first.length <= 3 && !/\d{3,}/.test(first)) return false
  return true
}

// ---------- 4. tables ----------

function buildTable(rows: Line[]): string[][] {
  // Column count = the most common number of cells per row; rows with that many cells define the columns.
  const counts = new Map<number, number>()
  for (const r of rows) counts.set(r.segs.length, (counts.get(r.segs.length) ?? 0) + 1)
  let cols = 2
  let best = -1
  for (const [n, c] of counts) {
    if (c > best || (c === best && n > cols)) {
      best = c
      cols = n
    }
  }
  const full = rows.filter((r) => r.segs.length === cols)
  // Header cells are often centred and body cells left-aligned, so a column is described by the
  // median left edge of its cells rather than by overlapping ranges.
  const anchors = Array.from({ length: cols }, (_, k) => median(full.map((r) => r.segs[k]!.x0)))
  return rows.map((r) => {
    const cells = new Array<string>(cols).fill('')
    if (r.segs.length === cols) {
      r.segs.forEach((s, k) => (cells[k] = s.text))
      return cells
    }
    for (const s of r.segs) {
      let idx = 0
      for (let k = 1; k < cols; k++) if (Math.abs(s.x0 - anchors[k]!) < Math.abs(s.x0 - anchors[idx]!)) idx = k
      cells[idx] = cells[idx] ? `${cells[idx]} ${s.text}` : s.text
    }
    return cells
  })
}

/** A bordered table: its row boundaries (top to bottom) and column boundaries (left to right). */
export interface TableBox {
  ys: number[]
  xs: number[]
}

/**
 * Groups the border lines of a page into tables: lines that touch belong together, and the distinct
 * positions of the horizontal and vertical lines are the row and column boundaries. Lone lines (an
 * underline, a decorative bar) never make a table: it needs at least two rows and two columns.
 */
export function findTableBoxes(rules: PdfRules | undefined): TableBox[] {
  if (!rules) return []
  type Seg = { x0: number; x1: number; y0: number; y1: number; h: boolean }
  const segs: Seg[] = [
    ...rules.h.map((r) => ({ x0: r.x0, x1: r.x1, y0: r.y, y1: r.y, h: true })),
    ...rules.v.map((r) => ({ x0: r.x, x1: r.x, y0: r.y0, y1: r.y1, h: false }))
  ]
  const TOL = 2
  const parent = segs.map((_, k) => k)
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k]!)))
  for (let a = 0; a < segs.length; a++) {
    for (let b = a + 1; b < segs.length; b++) {
      const p = segs[a]!
      const q = segs[b]!
      if (p.x0 <= q.x1 + TOL && q.x0 <= p.x1 + TOL && p.y0 <= q.y1 + TOL && q.y0 <= p.y1 + TOL) parent[find(a)] = find(b)
    }
  }
  const groups = new Map<number, Seg[]>()
  segs.forEach((sg, k) => groups.set(find(k), [...(groups.get(find(k)) ?? []), sg]))
  const distinct = (values: number[]): number[] => {
    const out: number[] = []
    for (const v of [...values].sort((a, b) => a - b)) if (out.length === 0 || v - out[out.length - 1]! > TOL) out.push(v)
    return out
  }
  const boxes: TableBox[] = []
  for (const group of groups.values()) {
    const ys = distinct(group.filter((g) => g.h).map((g) => g.y0)).reverse()
    const xs = distinct(group.filter((g) => !g.h).map((g) => g.x0))
    if (ys.length >= 3 && xs.length >= 3) boxes.push({ ys, xs }) // 3 lines = 2 rows / 2 columns
  }
  return boxes
}

// ---------- 5. text joining ----------

const TRAILING_PUNCT_RE = /[.,;:?!)\]”’」』>]+$/

export type WrapMode = 'word' | 'char'

/**
 * Do the document's lines break between words ("word", a space belongs at the break) or anywhere
 * inside text ("char", no space)? Decided from the characters that end full-width lines: with word
 * wrapping they are word endings (particles, verb endings, punctuation) far more often than chance.
 */
export function detectWrapMode(lineEnds: string[], shortfalls: number[] = []): WrapMode {
  // Character wrapping fills every line up to the last character that fits, so no wrapped line stops more
  // than one character short of the margin. A ragged right edge can therefore only be word wrapping.
  if (shortfalls.length >= 8 && shortfalls.filter((x) => x < 1.05).length / shortfalls.length < 0.8) return 'word'
  const samples = lineEnds.filter((t) => HANGUL_RE.test(t.slice(-1)) || TRAILING_PUNCT_RE.test(t))
  if (samples.length < 8) return 'word'
  const hits = samples.filter((t) => TRAILING_PUNCT_RE.test(t) || PARTICLES.has(t[t.length - 1]!)).length
  return hits / samples.length >= 0.3 ? 'word' : 'char'
}

export function joinWrapped(prev: string, next: string, mode: WrapMode = 'word', wordBreak = false): string {
  if (!prev) return next
  if (!next) return prev
  if (wordBreak && HANGUL_RE.test(prev[prev.length - 1]!) && HANGUL_RE.test(next[0]!)) return `${prev} ${next}`
  const a = prev[prev.length - 1]!
  const b = next[0]!
  // English hyphenation: "informa-" + "tion"
  if (/[a-z]-$/.test(prev) && /^[a-z]/.test(next)) return prev.slice(0, -1) + next
  if (HANGUL_RE.test(a) && HANGUL_RE.test(b)) return mode === 'char' ? prev + next : `${prev} ${next}`
  if (CJK_RE.test(a) && CJK_RE.test(b)) return prev + next
  if (/^[)\]”’」』.,;:?!]/.test(next)) return prev + next
  if (/[(\[“‘「『]$/.test(prev)) return prev + next
  return `${prev} ${next}`
}

// ---------- main ----------

interface OpenBlock {
  block: Extract<Block, { kind: 'paragraph' | 'item' }>
  lines: Line[]
  hasMarker: boolean
  x0: number
}

export function layoutPdf(pages: PdfPageInput[]): PdfLayoutResult {
  const warnings: ImportWarning[] = []
  const built = buildLines(pages)
  const totalChars = built.reduce((n, l) => n + l.text.length, 0)

  if (built.length === 0 || totalChars < Math.max(10, pages.length * 5)) {
    warnings.push({ code: 'noText' })
    return {
      markdown: '',
      warnings,
      stats: { pages: pages.length, chars: totalChars, headings: 0, tables: 0, listItems: 0, removedLines: 0 }
    }
  }

  const { kept, removed } = removeFurniture(built, pages.length)
  const body = kept.length ? kept : built

  // garbled text check (private-use / replacement characters)
  const all = body.map((l) => l.text).join('')
  const bad = [...all].filter((c) => c === '\uFFFD' || PUA_RE.test(c)).length
  if (all.length > 0 && bad / all.length > 0.05) warnings.push({ code: 'garbled', count: bad })

  // body font size = the size carrying most characters
  const sizeWeight = new Map<number, number>()
  for (const l of body) {
    const key = Math.round(l.fs * 2) / 2
    sizeWeight.set(key, (sizeWeight.get(key) ?? 0) + l.text.length)
  }
  let bodyFs = 10
  let best = -1
  for (const [fs, w] of sizeWeight) {
    if (w > best) {
      best = w
      bodyFs = fs
    }
  }

  // heading levels from the distinct larger sizes (largest = level 1)
  const sizeKey = (l: Line): number => Math.round(l.fs * 2) / 2
  const headingSizes = [...new Set(body.filter((l) => l.fs >= bodyFs * 1.1 && l.text.length <= 90 && !l.glyphMarker).map(sizeKey))]
    .sort((a, b) => b - a)
    .slice(0, 4)
  const headingLevel = (l: Line): number => {
    // a numbered line is a heading only when it is set larger than the body ("1. Overview" as a chapter title)
    if (l.text.length > 90 || l.glyphMarker || (markerOf(l) && l.fs < bodyFs * 1.1)) return 0
    const idx = headingSizes.indexOf(sizeKey(l))
    return idx >= 0 ? idx + 1 : 0
  }

  // where full lines end, per page
  const docEnds = body.filter((l) => l.text.length >= 15).map((l) => l.x1)
  // Too few long lines to measure: assume equal left and right page margins.
  const pageW = pages[0]?.width ?? 595
  const docRight = docEnds.length >= 3 ? percentile(docEnds, 0.9) : pageW - Math.min(...body.map((l) => l.x0))
  const rightMargin = new Map<number, number>()
  for (let p = 0; p < pages.length; p++) {
    const ends = body.filter((l) => l.page === p && l.text.length >= 15 && Math.abs(l.fs - bodyFs) < 1).map((l) => l.x1)
    rightMargin.set(p, ends.length >= 3 ? percentile(ends, 0.9) : docRight)
  }
  const isFull = (l: Line): boolean => l.x1 >= (rightMargin.get(l.page) ?? docRight) - 4 * l.fs

  // typical line pitch inside a paragraph: gaps that follow a clearly full line
  const gaps: number[] = []
  for (let k = 0; k + 1 < body.length; k++) {
    const a = body[k]!
    const b = body[k + 1]!
    if (a.page === b.page && a.x1 >= (rightMargin.get(a.page) ?? docRight) - 2 * a.fs && Math.abs(a.fs - b.fs) < 1) gaps.push(a.y - b.y)
  }
  const pitch = gaps.length ? median(gaps) : bodyFs * 1.8

  // word wrapping or character wrapping? (decides whether a line break gets a space)
  const ends: string[] = []
  const shortfalls: number[] = []
  for (let k = 0; k + 1 < body.length; k++) {
    const a = body[k]!
    const b = body[k + 1]!
    if (a.page !== b.page || cellular(a) || markerOf(b)) continue
    const R = rightMargin.get(a.page) ?? docRight
    if (a.x1 >= R - 2 * a.fs) ends.push(a.text)
    // a line that is followed by the rest of its paragraph and is not short for another reason
    if (a.text.length >= 12 && a.x1 >= R - 8 * a.fs && a.y - b.y <= pitch * 1.35 && Math.abs(a.fs - b.fs) < 1) shortfalls.push(Math.max(0, (R - a.x1) / a.fs))
  }
  const wrapMode = detectWrapMode(ends, shortfalls)


  // Bordered tables: the border lines give exact rows and columns, so cell text that wraps over several
  // lines stays in its cell. Tables without borders fall back to the column-alignment rule further down.
  const consumed = new Set<Line>()
  const tableAt = new Map<Line, Extract<Block, { kind: 'table' }>>()
  for (let pg = 0; pg < pages.length; pg++) {
    for (const box of findTableBoxes(pages[pg]!.rules)) {
      const top = box.ys[0]!
      const bottom = box.ys[box.ys.length - 1]!
      const left = box.xs[0]!
      const right = box.xs[box.xs.length - 1]!
      const inside = body.filter((l) => l.page === pg && l.y <= top + 2 && l.y >= bottom - 2 && l.segs.some((sg) => (sg.x0 + sg.x1) / 2 >= left - 2 && (sg.x0 + sg.x1) / 2 <= right + 2))
      if (inside.length === 0) continue
      const rows = box.ys.length - 1
      const cols = box.xs.length - 1
      const cells: string[][][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []))
      const rowOf = (y: number): number => {
        for (let r = 0; r < rows; r++) if (y <= box.ys[r]! + 2 && y > box.ys[r + 1]! - 2) return r
        return -1
      }
      for (const l of inside) {
        const r = rowOf(l.y)
        if (r < 0) continue
        for (const sg of l.segs) {
          const cx = (sg.x0 + sg.x1) / 2
          let c = 0
          for (let k = 0; k < cols; k++) if (cx >= box.xs[k]! - 2) c = k
          cells[r]![c]!.push(sg.text)
        }
      }
      const grid = cells.map((row) => row.map((pieces) => pieces.reduce((acc, t) => joinWrapped(acc, t, wrapMode), '')))
      const filled = grid.filter((row) => row.some((c) => c !== ''))
      if (filled.length < 2) continue
      for (const l of inside) consumed.add(l)
      tableAt.set(inside[0]!, { kind: 'table', rows: filled })
    }
  }

  // Left edge of ordinary paragraphs: the most common start x of body-size text.
  const startWeight = new Map<number, number>()
  for (const l of body) {
    if (consumed.has(l) || Math.abs(l.fs - bodyFs) >= 1 || markerOf(l) || cellular(l)) continue
    const key = Math.round(l.x0)
    startWeight.set(key, (startWeight.get(key) ?? 0) + l.text.length)
  }
  let baseX = Math.min(...body.map((l) => l.x0))
  best = -1
  for (const [x, w] of startWeight) {
    if (w > best) {
      best = w
      baseX = x
    }
  }
  const isCentered = (l: Line): boolean => {
    const w = pages[l.page]?.width ?? 595
    return Math.abs((l.x0 + l.x1) / 2 - w / 2) < 2 * l.fs && l.x1 - l.x0 < 0.7 * (w - 2 * baseX)
  }
  /**
   * A bullet drawn as a picture leaves no text, only an indented line. An indented line starts a bullet unless
   * it is a first-line indent (the next line of the same paragraph is back at the left edge) or is centred.
   */
  const isImplicitBullet = (k: number): boolean => {
    const l = body[k]!
    if (consumed.has(l) || markerOf(l) || cellular(l) || headingLevel(l) > 0 || isCentered(l)) return false
    if (l.fs >= bodyFs * 1.1 || l.x0 < baseX + 1.2 * bodyFs || l.x0 > baseX + 8 * bodyFs) return false
    const nxt = body[k + 1]
    const backAtEdge = nxt && nxt.page === l.page && nxt.x0 < baseX + 0.6 * bodyFs && l.y - nxt.y <= pitch * 1.35 && isFull(l)
    return !backAtEdge
  }

  // A picture bullet has no marker, so its text starts one marker-width further right than a real marker
  // line at the same nesting level. `hang` (marker to text distance, measured on glyph markers) corrects that.
  const hangs = body.filter((l) => l.glyphMarker && l.segs[0]).map((l) => l.segs[0]!.x0 - l.x0).filter((h) => h > 0)
  const hang = hangs.length ? median(hangs) : 1.15 * bodyFs
  const levelXOf = (l: Line): number => (markerOf(l) ? l.x0 : l.x0 - hang)

  // list nesting from the indents of marker lines and indented bullets
  const centers: number[] = []
  const levelXs = body.filter((l, k) => markerOf(l) || isImplicitBullet(k)).map(levelXOf).sort((a, b) => a - b)
  for (const x of levelXs) {
    if (centers.length === 0 || x - centers[centers.length - 1]! > 0.9 * bodyFs) centers.push(x)
  }
  const levelOf = (x: number): number => {
    let idx = 0
    for (let k = 0; k < centers.length; k++) if (x >= centers[k]! - 0.9 * bodyFs) idx = k
    return Math.min(idx, 5)
  }

  const blocks: Block[] = []
  let open: OpenBlock | null = null
  const close = (): void => {
    if (!open) return
    const { block, lines } = open
    if (block.kind === 'paragraph' && lines.length === 1 && lines[0]!.bold && block.text.length <= 60) block.text = `**${block.text}**`
    open = null
  }

  let i = 0
  while (i < body.length) {
    const line = body[i]!

    const bordered = tableAt.get(line)
    if (bordered) {
      close()
      blocks.push(bordered)
      i++
      continue
    }
    if (consumed.has(line)) {
      i++
      continue
    }

    // table: a run of multi-cell lines
    if (cellular(line)) {
      const run: Line[] = [line]
      let j = i + 1
      while (j < body.length) {
        const nxt = body[j]!
        const prev = run[run.length - 1]!
        if (nxt.page !== prev.page || prev.y - nxt.y > 3.2 * Math.max(prev.fs, nxt.fs) || !cellular(nxt)) break
        run.push(nxt)
        j++
      }
      if (run.length >= 2) {
        close()
        blocks.push({ kind: 'table', rows: buildTable(run) })
        i = j
        continue
      }
    }

    // heading (a title wrapped over several lines of the same size stays one heading)
    const level = headingLevel(line)
    if (level > 0) {
      close()
      let text = line.text
      let j = i + 1
      while (
        j < body.length &&
        body[j]!.page === line.page &&
        headingLevel(body[j]!) === level &&
        line.y - body[j]!.y <= 1.9 * line.fs &&
        sizeKey(body[j]!) === sizeKey(line)
      ) {
        text = joinWrapped(text, body[j]!.text, wrapMode)
        j++
      }
      blocks.push({ kind: 'heading', level, text })
      i = j
      continue
    }

    const marker = markerOf(line)
    const implicit = !marker && isImplicitBullet(i)

    // continuation of the open paragraph / list item?
    if (open && !marker && !(implicit && !open.hasMarker && open.x0 !== line.x0)) {
      const prev = open.lines[open.lines.length - 1]!
      const gap = prev.page === line.page ? prev.y - line.y : pitch
      const firstLineIndent = !open.hasMarker && line.x0 > open.x0 + 1.2 * bodyFs
      if (isFull(prev) && gap <= pitch * 1.35 && !firstLineIndent && Math.abs(prev.fs - line.fs) < 1) {
        open.lines.push(line)
        const shortBy = (rightMargin.get(prev.page) ?? docRight) - prev.x1
        // a real space at the break, or a gap wider than one character, can only be a word boundary
        const wordBreak = prev.trailingSpace || shortBy > 1.05 * prev.fs
        open.block.text = joinWrapped(open.block.text, line.text, wrapMode, wordBreak)
        i++
        continue
      }
    }

    close()
    if (marker || implicit) {
      const block: Block = {
        kind: 'item',
        level: levelOf(levelXOf(line)),
        ordered: marker?.kind === 'ordered' ? marker.number : null,
        text: marker ? marker.rest : line.text
      }
      blocks.push(block)
      open = { block, lines: [line], hasMarker: true, x0: line.x0 }
    } else {
      const block: Block = { kind: 'paragraph', text: line.text }
      blocks.push(block)
      open = { block, lines: [line], hasMarker: false, x0: line.x0 }
    }
    i++
  }
  close()

  return render(blocks, pages.length, totalChars, removed, warnings)
}

// ---------- 6. Markdown output ----------

function render(blocks: Block[], pageCount: number, chars: number, removed: number, warnings: ImportWarning[]): PdfLayoutResult {
  const out: string[] = []
  let headings = 0
  let tables = 0
  let listItems = 0
  let prevKind: Block['kind'] | null = null

  // A list starts at its shallowest item, and a level never jumps more than one step deeper.
  for (let k = 0; k < blocks.length; ) {
    if (blocks[k]!.kind !== 'item') {
      k++
      continue
    }
    let end = k
    while (end < blocks.length && blocks[end]!.kind === 'item') end++
    const run = blocks.slice(k, end) as Array<Extract<Block, { kind: 'item' }>>
    const min = Math.min(...run.map((b) => b.level))
    let prev = -1
    for (const b of run) {
      b.level = Math.min(b.level - min, prev + 1)
      prev = b.level
    }
    k = end
  }

  // numbers: real ones are kept, glyph markers (number 0) are counted per nesting level
  const counters: number[] = []
  for (const b of blocks) {
    if (b.kind !== 'item') {
      counters.length = 0
      continue
    }
    counters.length = b.level + 1
    if (b.ordered === 0) b.ordered = counters[b.level] = (counters[b.level] ?? 0) + 1
    else counters[b.level] = b.ordered ?? 0
  }

  for (const b of blocks) {
    let piece: string
    switch (b.kind) {
      case 'heading':
        headings++
        piece = `${'#'.repeat(Math.min(b.level, 4))} ${escapeMarkdown(b.text)}`
        break
      case 'paragraph':
        piece = b.text.startsWith('**') && b.text.endsWith('**') ? `**${escapeMarkdown(b.text.slice(2, -2))}**` : escapeMarkdown(b.text)
        break
      case 'item': {
        listItems++
        const indent = '    '.repeat(b.level)
        piece = `${indent}${b.ordered !== null ? `${b.ordered}. ` : '- '}${escapeMarkdown(b.text)}`
        break
      }
      case 'table': {
        tables++
        const cols = Math.max(...b.rows.map((r) => r.length))
        const cell = (s: string | undefined): string => escapeMarkdown(s ?? '') || ' '
        const row = (r: string[]): string => `| ${Array.from({ length: cols }, (_, k) => cell(r[k])).join(' | ')} |`
        const [head, ...rest] = b.rows
        piece = [row(head!), `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`, ...rest.map(row)].join('\n')
        break
      }
    }
    // consecutive list items stay one tight list; everything else is separated by a blank line
    const tight = b.kind === 'item' && prevKind === 'item'
    out.push(tight ? piece : `\n${piece}`)
    prevKind = b.kind
  }

  const markdown = out
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
  return {
    markdown: `${markdown}\n`,
    warnings,
    stats: { pages: pageCount, chars, headings, tables, listItems, removedLines: removed }
  }
}
