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

export interface PdfPageInput {
  width: number
  height: number
  items: PdfTextItem[]
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
        x0: kept[0]!.x0,
        x1: kept[kept.length - 1]!.x1,
        text: kept.map((s) => s.text).join(' '),
        segs: kept,
        bold: kept.every((s) => s.bold),
        trailingSpace: /\s$/.test(group[group.length - 1]!.str),
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

// ---------- 5. text joining ----------

const TRAILING_PUNCT_RE = /[.,;:?!)\]”’」』>]+$/

export type WrapMode = 'word' | 'char'

/**
 * Do the document's lines break between words ("word", a space belongs at the break) or anywhere
 * inside text ("char", no space)? Decided from the characters that end full-width lines: with word
 * wrapping they are word endings (particles, verb endings, punctuation) far more often than chance.
 */
export function detectWrapMode(lineEnds: string[]): WrapMode {
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
  const headingSizes = [...new Set(body.filter((l) => l.fs >= bodyFs * 1.15 && l.text.length <= 90).map(sizeKey))]
    .sort((a, b) => b - a)
    .slice(0, 4)
  const headingLevel = (l: Line): number => {
    if (l.text.length > 90 || detectMarker(l.text)) return 0
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

  // word wrapping or character wrapping? (decides whether a line break gets a space)
  const ends: string[] = []
  for (let k = 0; k + 1 < body.length; k++) {
    const a = body[k]!
    const b = body[k + 1]!
    if (a.page === b.page && a.x1 >= (rightMargin.get(a.page) ?? docRight) - 2 * a.fs && !cellular(a) && !detectMarker(b.text)) ends.push(a.text)
  }
  const wrapMode = detectWrapMode(ends)

  // typical line pitch inside a paragraph: gaps that follow a clearly full line
  const gaps: number[] = []
  for (let k = 0; k + 1 < body.length; k++) {
    const a = body[k]!
    const b = body[k + 1]!
    if (a.page === b.page && a.x1 >= (rightMargin.get(a.page) ?? docRight) - 2 * a.fs && Math.abs(a.fs - b.fs) < 1) gaps.push(a.y - b.y)
  }
  const pitch = gaps.length ? median(gaps) : bodyFs * 1.8

  // list nesting from the indents of marker lines
  const centers: number[] = []
  for (const x of body.filter((l) => detectMarker(l.text)).map((l) => l.x0).sort((a, b) => a - b)) {
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

    const marker = detectMarker(line.text)

    // continuation of the open paragraph / list item?
    if (open && !marker) {
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
    if (marker) {
      const block: Block = {
        kind: 'item',
        level: levelOf(line.x0),
        ordered: marker.kind === 'ordered' ? marker.number : null,
        text: marker.rest
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
