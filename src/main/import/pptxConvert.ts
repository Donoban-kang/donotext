// PowerPoint (.pptx) -> Markdown: one section per slide with its title, text, tables and speaker notes.

import { escapeMarkdown } from './markdownEscape'
import { markdownStats } from './markdownStats'
import { attr, child, childrenNamed, descend, descendAll, kids, parseXml, tagOf, textOf, type XNode } from './ooxml'
import type { Converted } from './types'
import { openOfficeZip } from './zipGuard'
import type { ImportWarning } from '../../shared/importTypes'

/** Words the converter writes into the Markdown itself (supplied by the UI language). */
export interface PptxLabels {
  /** "Slide" - used as the heading of a slide that has no title: `## Slide 3`. */
  slide: string
  /** "Speaker notes" */
  notes: string
}

const SKIP_PLACEHOLDERS = new Set(['sldNum', 'dt', 'ftr', 'hdr'])

function paragraphText(p: XNode): string {
  let out = ''
  for (const k of kids(p)) {
    const t = tagOf(k)
    if (t === 'a:r') out += textOf(childrenNamed(k, 'a:t'))
    else if (t === 'a:br') out += ' '
    else if (t === 'a:fld') {
      const type = attr(k, 'type') ?? ''
      if (!/^(slidenum|datetime)/i.test(type)) out += textOf(childrenNamed(k, 'a:t'))
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

interface Collected {
  title: string
  blocks: string[]
  images: number
}

function collect(nodes: XNode[], acc: Collected): void {
  for (const n of nodes) {
    const t = tagOf(n)
    if (t === 'p:grpSp') collect(kids(n), acc)
    else if (t === 'p:pic') acc.images++
    else if (t === 'p:graphicFrame') {
      const tbl = descend(kids(n), 'a:tbl')
      if (!tbl) continue
      const rows = childrenNamed(tbl, 'a:tr').map((tr) =>
        childrenNamed(tr, 'a:tc').map((tc) =>
          escapeMarkdown(
            childrenNamed(child(tc, 'a:txBody') ?? ({} as XNode), 'a:p')
              .map(paragraphText)
              .filter(Boolean)
              .join(' ')
          )
        )
      )
      if (rows.length === 0) continue
      const cols = Math.max(...rows.map((r) => r.length))
      const line = (r: string[]): string => `| ${Array.from({ length: cols }, (_, k) => r[k] || ' ').join(' | ')} |`
      const [head, ...rest] = rows
      acc.blocks.push([line(head!), `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`, ...rest.map(line)].join('\n'))
    } else if (t === 'p:sp') {
      const ph = descend(kids(n), 'p:ph')
      const phType = ph ? (attr(ph, 'type') ?? 'body') : null
      if (phType && SKIP_PLACEHOLDERS.has(phType)) continue
      const body = child(n, 'p:txBody')
      if (!body) continue
      const paras = childrenNamed(body, 'a:p')
      if (phType === 'title' || phType === 'ctrTitle') {
        const text = paras.map(paragraphText).filter(Boolean).join(' ')
        if (text) acc.title = acc.title ? `${acc.title} ${text}` : text
        continue
      }
      const lines: string[] = []
      for (const p of paras) {
        const text = paragraphText(p)
        if (!text) continue
        const pPr = child(p, 'a:pPr')
        const lvl = Math.min(Number(pPr ? attr(pPr, 'lvl') : 0) || 0, 5)
        const none = pPr ? Boolean(child(pPr, 'a:buNone')) : false
        const numbered = pPr ? Boolean(child(pPr, 'a:buAutoNum')) : false
        const bulleted = pPr ? Boolean(child(pPr, 'a:buChar')) : false
        // body placeholders inherit their bullets from the slide layout
        const inherits = phType === 'body' || phType === null ? phType === 'body' : false
        if (numbered) lines.push(`${'    '.repeat(lvl)}1. ${escapeMarkdown(text)}`)
        else if (!none && (bulleted || inherits || lvl > 0)) lines.push(`${'    '.repeat(lvl)}- ${escapeMarkdown(text)}`)
        else lines.push(escapeMarkdown(text))
      }
      if (lines.length) acc.blocks.push(lines.join('\n'))
    }
  }
}

function resolve(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = baseDir.split('/').filter(Boolean)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

export async function convertPptx(bytes: Uint8Array, labels: PptxLabels): Promise<Converted> {
  const zip = await openOfficeZip(bytes)
  const read = async (path: string): Promise<XNode[] | null> => {
    const f = zip.file(path)
    return f ? parseXml(await f.async('string')) : null
  }
  const pres = await read('ppt/presentation.xml')
  if (!pres) throw new Error('not a presentation')
  const presRels = await read('ppt/_rels/presentation.xml.rels')
  const target = new Map<string, string>()
  for (const r of descendAll(presRels ?? [], 'Relationship')) target.set(attr(r, 'Id') ?? '', attr(r, 'Target') ?? '')

  const sections: string[] = []
  let images = 0
  let slideNo = 0
  for (const id of descendAll(pres, 'p:sldId')) {
    const rel = target.get(attr(id, 'r:id') ?? '')
    if (!rel) continue
    const slidePath = resolve('ppt', rel)
    const slide = await read(slidePath)
    if (!slide) continue
    slideNo++
    const tree = descend(slide, 'p:spTree')
    const acc: Collected = { title: '', blocks: [], images: 0 }
    if (tree) collect(kids(tree), acc)
    images += acc.images

    // speaker notes live in a separate part linked from the slide
    let notes = ''
    const dir = slidePath.slice(0, slidePath.lastIndexOf('/'))
    const slideRels = await read(`${dir}/_rels/${slidePath.slice(slidePath.lastIndexOf('/') + 1)}.rels`)
    const noteRel = descendAll(slideRels ?? [], 'Relationship').find((r) => /\/notesSlide$/.test(attr(r, 'Type') ?? ''))
    if (noteRel) {
      const noteXml = await read(resolve(dir, attr(noteRel, 'Target') ?? ''))
      const noteTree = noteXml ? descend(noteXml, 'p:spTree') : undefined
      if (noteTree) {
        const lines: string[] = []
        for (const sp of kids(noteTree)) {
          if (tagOf(sp) !== 'p:sp') continue
          const ph = descend(kids(sp), 'p:ph')
          if (!ph || attr(ph, 'type') !== 'body') continue
          for (const p of childrenNamed(child(sp, 'p:txBody') ?? ({} as XNode), 'a:p')) {
            const text = paragraphText(p)
            if (text) lines.push(text)
          }
        }
        notes = lines.join(' ')
      }
    }

    const heading = acc.title ? escapeMarkdown(acc.title) : `${escapeMarkdown(labels.slide)} ${slideNo}`
    const section = [`## ${heading}`, ...acc.blocks]
    if (notes) section.push(`> **${escapeMarkdown(labels.notes)}** ${escapeMarkdown(notes)}`)
    sections.push(section.join('\n\n'))
  }

  const warnings: ImportWarning[] = []
  if (images > 0) warnings.push({ code: 'imagesSkipped', count: images })
  const markdown = sections.length ? `${sections.join('\n\n---\n\n')}\n` : ''
  return { markdown, warnings, stats: { ...markdownStats(markdown), slides: slideNo } }
}
