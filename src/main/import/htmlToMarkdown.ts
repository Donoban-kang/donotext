// HTML -> Markdown (used for .html files and as the second step of Word conversion).
// Nothing in the HTML is executed or fetched: only its text and structure are read.

import TurndownService from 'turndown'
import { strikethrough } from 'turndown-plugin-gfm'

export interface HtmlConversion {
  markdown: string
  /** <img> elements that were left out. */
  imagesSkipped: number
}

interface DomElement {
  nodeName: string
  children: ArrayLike<DomElement>
  innerHTML: string
  textContent: string | null
  querySelector(selector: string): DomElement | null
  querySelectorAll(selector: string): ArrayLike<DomElement>
  closest(selector: string): DomElement | null
  getAttribute(name: string): string | null
}

const SAFE_HREF_RE = /^(https?:|mailto:|tel:|#|[^:]*$)/i

export function htmlToMarkdown(html: string): HtmlConversion {
  let imagesSkipped = 0
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
    linkStyle: 'inlined'
  })
  td.use(strikethrough)
  td.remove(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'head', 'template'])

  td.addRule('skipImages', {
    filter: 'img',
    replacement: () => {
      imagesSkipped++
      return ''
    }
  })
  // links that could run code (javascript:, data:, ...) keep only their text
  td.addRule('safeLinks', {
    filter: (node) => node.nodeName === 'A' && node.getAttribute('href') !== null,
    replacement: (content, node) => {
      const href = (node as unknown as { getAttribute(n: string): string | null }).getAttribute('href')?.trim() ?? ''
      const text = content.trim()
      if (!text) return ''
      if (!SAFE_HREF_RE.test(href) || href === '') return text
      return `[${text}](${href.replace(/\)/g, '%29').replace(/\s/g, '%20')})`
    }
  })

  // Every table becomes a GFM table (the stock plugin keeps header-less tables, such as Word's, as raw HTML).
  td.addRule('anyTable', {
    filter: 'table',
    replacement: (_content, node) => {
      const table = node as unknown as DomElement
      const rows: string[][] = []
      for (const tr of Array.from(table.querySelectorAll('tr'))) {
        if (tr.closest('table') !== table) continue // a row of a nested table
        const cells: string[] = []
        for (const cell of Array.from(tr.children)) {
          if (!/^(TD|TH)$/.test(cell.nodeName)) continue
          const text = cell.querySelector('table')
            ? (cell.textContent ?? '')
            : td.turndown(cell.innerHTML)
          const flat = text.replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '\\|').trim()
          cells.push(flat)
          for (let k = 1; k < Math.min(Number(cell.getAttribute('colspan')) || 1, 20); k++) cells.push('')
        }
        if (cells.length) rows.push(cells)
      }
      if (rows.length === 0) return ''
      const cols = Math.max(...rows.map((r) => r.length))
      const line = (r: string[]): string => `| ${Array.from({ length: cols }, (_, k) => r[k] || ' ').join(' | ')} |`
      const caption = table.querySelector('caption')?.textContent?.trim()
      const [head, ...rest] = rows
      return `\n\n${caption ? `**${caption}**\n\n` : ''}${[line(head!), `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`, ...rest.map(line)].join('\n')}\n\n`
    }
  })

  const baseEscape = td.escape.bind(td)
  td.escape = (s: string): string => baseEscape(s).replace(/\$/g, '\\$')

  const md = td.turndown(html)
  const cleaned = md
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { markdown: cleaned ? `${cleaned}\n` : '', imagesSkipped }
}
