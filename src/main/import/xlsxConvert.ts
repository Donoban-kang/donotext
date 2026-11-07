// Excel (.xlsx) -> one Markdown table per visible sheet. Cached values are read; nothing is calculated
// or executed (macros, external links and formulas stay untouched).

import type { ImportWarning } from '../../shared/importTypes'
import { escapeMarkdown } from './markdownEscape'
import { markdownStats } from './markdownStats'
import { attr, child, childrenNamed, descend, descendAll, kids, parseXml, tagOf, textOf, type XNode } from './ooxml'
import type { Converted } from './types'
import { openOfficeZip } from './zipGuard'

export const XLSX_MAX_ROWS = 5000
export const XLSX_MAX_COLS = 100

const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])
const BUILTIN_FORMATS: Record<number, string> = {
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%'
}

function colIndex(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

const pad = (n: number): string => String(n).padStart(2, '0')

function formatDate(serial: number, date1904: boolean, withTime: boolean): string {
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  const d = new Date(base + Math.round(serial * 86400000))
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  if (serial < 1 && withTime) return time
  return withTime && serial % 1 !== 0 ? `${day} ${time}` : day
}

function decimalsOf(code: string): number {
  const m = /\.(0+)/.exec(code)
  return m ? m[1]!.length : 0
}

function plainNumber(n: number): string {
  return String(Number.parseFloat(n.toPrecision(15)))
}

function formatNumber(raw: string, code: string | undefined, isDate: boolean, date1904: boolean): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (isDate) return formatDate(n, date1904, /h|s/i.test((code ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '')))
  if (!code || /^general$/i.test(code)) return plainNumber(n)
  if (code.includes('%')) return `${(n * 100).toFixed(decimalsOf(code))}%`
  const d = decimalsOf(code)
  if (code.includes(',')) return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (/0/.test(code) && !/[a-z]/i.test(code.replace(/"[^"]*"/g, ''))) return n.toFixed(d)
  return plainNumber(n)
}

function sharedStrings(root: XNode[]): string[] {
  const sst = descend(root, 'sst')
  if (!sst) return []
  return childrenNamed(sst, 'si').map((si) => {
    // plain <t> or rich-text <r><t> runs; phonetic guides (<rPh>) are skipped
    let out = ''
    for (const k of kids(si)) {
      if (tagOf(k) === 't') out += textOf(kids(k))
      else if (tagOf(k) === 'r') out += textOf(childrenNamed(k, 't'))
    }
    return out
  })
}

interface StyleInfo {
  code: string | undefined
  isDate: boolean
}

function styleTable(root: XNode[]): StyleInfo[] {
  const custom = new Map<number, string>()
  for (const nf of descendAll(root, 'numFmt')) custom.set(Number(attr(nf, 'numFmtId')), attr(nf, 'formatCode') ?? '')
  const cellXfs = descend(root, 'cellXfs')
  if (!cellXfs) return []
  return childrenNamed(cellXfs, 'xf').map((xf) => {
    const id = Number(attr(xf, 'numFmtId') ?? 0)
    const code = custom.get(id) ?? BUILTIN_FORMATS[id]
    const stripped = (code ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
    const isDate = BUILTIN_DATE_IDS.has(id) || (custom.has(id) && /[dmyhs]/i.test(stripped) && !/^general$/i.test(stripped))
    return { code, isDate }
  })
}

export async function convertXlsx(bytes: Uint8Array): Promise<Converted> {
  const zip = await openOfficeZip(bytes)
  const read = async (path: string): Promise<XNode[] | null> => {
    const f = zip.file(path)
    return f ? parseXml(await f.async('string')) : null
  }

  const wb = await read('xl/workbook.xml')
  if (!wb) throw new Error('not a workbook')
  const rels = await read('xl/_rels/workbook.xml.rels')
  const target = new Map<string, string>()
  for (const r of descendAll(rels ?? [], 'Relationship')) target.set(attr(r, 'Id') ?? '', attr(r, 'Target') ?? '')
  const date1904 = attr(descend(wb, 'workbookPr') ?? ({} as XNode), 'date1904') === '1'
  const strings = sharedStrings((await read('xl/sharedStrings.xml')) ?? [])
  const styles = styleTable((await read('xl/styles.xml')) ?? [])

  const warnings: ImportWarning[] = []
  const parts: string[] = []
  let omittedRows = 0
  let sheetCount = 0

  for (const sheet of descendAll(wb, 'sheet')) {
    if ((attr(sheet, 'state') ?? 'visible') !== 'visible') continue
    const name = attr(sheet, 'name') ?? ''
    const rel = target.get(attr(sheet, 'r:id') ?? '')
    if (!rel) continue
    const path = rel.startsWith('/') ? rel.slice(1) : `xl/${rel}`
    const xml = await read(path)
    if (!xml) continue

    const grid = new Map<number, Map<number, string>>()
    let maxCol = 0
    for (const row of descendAll(xml, 'row')) {
      const r = Number(attr(row, 'r') ?? 0) - 1
      if (r < 0) continue
      for (const c of childrenNamed(row, 'c')) {
        const ref = attr(c, 'r') ?? ''
        const col = colIndex(ref)
        if (col < 0 || col >= XLSX_MAX_COLS) continue
        const t = attr(c, 't')
        const v = child(c, 'v')
        const raw = v ? textOf(kids(v)) : ''
        let text = ''
        if (t === 's') text = strings[Number(raw)] ?? ''
        else if (t === 'inlineStr') text = textOf(descendAll(kids(child(c, 'is') ?? ({} as XNode)), 't'))
        else if (t === 'b') text = raw === '1' ? 'TRUE' : 'FALSE'
        else if (t === 'str' || t === 'e') text = raw
        else if (raw !== '') {
          const st = styles[Number(attr(c, 's') ?? 0)]
          text = formatNumber(raw, st?.code, st?.isDate ?? false, date1904)
        }
        if (text === '') continue
        let rowMap = grid.get(r)
        if (!rowMap) grid.set(r, (rowMap = new Map()))
        rowMap.set(col, text)
        maxCol = Math.max(maxCol, col)
      }
    }

    const rowNumbers = [...grid.keys()].sort((a, b) => a - b)
    sheetCount++
    parts.push(`## ${escapeMarkdown(name)}`)
    if (rowNumbers.length === 0) {
      parts.push('')
      continue
    }
    const kept = rowNumbers.slice(0, XLSX_MAX_ROWS)
    omittedRows += rowNumbers.length - kept.length
    const cols = maxCol + 1
    const cell = (s: string | undefined): string => (s ? escapeMarkdown(s.replace(/\s*\n+\s*/g, ' ')) : ' ')
    const line = (r: number): string => `| ${Array.from({ length: cols }, (_, k) => cell(grid.get(r)?.get(k))).join(' | ')} |`
    const [first, ...rest] = kept
    parts.push([line(first!), `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`, ...rest.map(line)].join('\n'))
  }

  if (omittedRows > 0) warnings.push({ code: 'rowsTruncated', count: omittedRows })
  const markdown = parts.length ? `${parts.join('\n\n')}\n` : ''
  return { markdown, warnings, stats: { ...markdownStats(markdown), sheets: sheetCount } }
}
