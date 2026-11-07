import type { ImportWarning } from '../../shared/importTypes'
import { htmlToMarkdown } from './htmlToMarkdown'
import { markdownStats } from './markdownStats'
import type { Converted } from './types'

export function convertHtml(bytes: Uint8Array): Converted {
  const html = new TextDecoder('utf-8').decode(bytes)
  const { markdown, imagesSkipped } = htmlToMarkdown(html)
  const warnings: ImportWarning[] = []
  if (imagesSkipped > 0) warnings.push({ code: 'imagesSkipped', count: imagesSkipped })
  return { markdown, warnings, stats: markdownStats(markdown) }
}
