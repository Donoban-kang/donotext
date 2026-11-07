import type { ImportStats } from '../../shared/importTypes'

/** Rough structure counts of a Markdown text (headings, tables, list items). */
export function markdownStats(markdown: string): Pick<ImportStats, 'chars' | 'headings' | 'tables' | 'listItems'> {
  let headings = 0
  let tables = 0
  let listItems = 0
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) continue
    if (/^#{1,6}\s/.test(line)) headings++
    else if (/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) tables++
    else if (/^\s*([-*+]|\d+\.)\s/.test(line)) listItems++
  }
  return { chars: markdown.length, headings, tables, listItems }
}
