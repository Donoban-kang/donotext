import type { FormatId } from './format'

export interface Edit {
  from: number
  to: number
  insert: string
  /** Selection after the edit. */
  anchor: number
  head: number
}

/** Markers written around the selection in the source editor, per format. */
export const WRAPPERS: Partial<Record<FormatId, [string, string]>> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
  superscript: ['<sup>', '</sup>'],
  subscript: ['<sub>', '</sub>'],
  highlight: ['==', '=='],
  code: ['`', '`'],
  math: ['$', '$'],
  strike: ['~~', '~~']
}

/**
 * Wraps the selection in `open`/`close`, or removes them when the selection is already wrapped
 * (markers just outside it, or the markers are part of the selection). With nothing selected the
 * markers are inserted and the caret placed between them.
 */
export function toggleWrap(doc: string, from: number, to: number, open: string, close: string): Edit {
  const sel = doc.slice(from, to)
  if (sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close)) {
    const inner = sel.slice(open.length, sel.length - close.length)
    return { from, to, insert: inner, anchor: from, head: from + inner.length }
  }
  if (doc.slice(from - open.length, from) === open && doc.slice(to, to + close.length) === close && from >= open.length) {
    return { from: from - open.length, to: to + close.length, insert: sel, anchor: from - open.length, head: from - open.length + sel.length }
  }
  const insert = open + sel + close
  return sel === ''
    ? { from, to, insert, anchor: from + open.length, head: from + open.length }
    : { from, to, insert, anchor: from + open.length, head: from + open.length + sel.length }
}

/** `[text](url)`; with nothing selected the address itself becomes the text. Empty url unlinks `[text](...)`. */
export function linkEdit(doc: string, from: number, to: number, url: string): Edit {
  const sel = doc.slice(from, to)
  const existing = /^\[([^\]]*)\]\([^)]*\)$/.exec(sel)
  const text = existing ? existing[1] : sel
  if (url === '') return { from, to, insert: text, anchor: from, head: from + text.length }
  const label = text === '' ? url : text
  const insert = `[${label}](${url})`
  return { from, to, insert, anchor: from + 1, head: from + 1 + label.length }
}

/** `![](path)` at the selection (the selection becomes the alt text). */
export function imageEdit(doc: string, from: number, to: number, path: string): Edit {
  const alt = doc.slice(from, to).replace(/[\[\]\n]/g, ' ')
  const insert = `![${alt}](${path})`
  return { from, to, insert, anchor: from + insert.length, head: from + insert.length }
}

/** Removes paired inline markers from a piece of text; unpaired characters are left alone. */
export function clearFormatting(text: string): string {
  let out = text
  const rules: Array<[RegExp, string]> = [
    [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
    [/<\/?(?:u|sup|sub)>/gi, ''],
    [/\*\*(.+?)\*\*/gs, '$1'],
    [/__(.+?)__/gs, '$1'],
    [/~~(.+?)~~/gs, '$1'],
    [/==(?=\S)(.+?)(?<=\S)==/gs, '$1'],
    [/`([^`]+)`/g, '$1'],
    [/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/gs, '$1'],
    [/(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/gs, '$1']
  ]
  for (const [re, to] of rules) out = out.replace(re, to)
  return out
}
