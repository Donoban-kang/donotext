import { encodedLength, type Encoding, type Eol } from './textFormat'

export interface TextStats {
  words: number
  /** Characters excluding all whitespace. */
  chars: number
  /** Characters including spaces and line breaks. */
  charsWithSpaces: number
  paragraphs: number
  /** Size of the file as it would be saved (UTF-8, with the document's line endings and BOM). */
  bytes: number
}

function countCodePoints(s: string): number {
  let n = 0
  for (const _ of s) n++
  return n
}

/**
 * Counts what a writer expects to see: a "word" is a whitespace-separated piece that contains a letter
 * or digit (so a lone `#` or `---` does not count); a paragraph is a block of text between blank lines.
 */
export function computeStats(text: string, eol: Eol, bom: boolean, encoding: Encoding = 'utf-8'): TextStats {
  let words = 0
  for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) words++
  const paragraphs = text.split(/\n[ \t]*\n/).filter((p) => p.trim() !== '').length
  return {
    words,
    chars: countCodePoints(text.replace(/\s/g, '')),
    charsWithSpaces: countCodePoints(text),
    paragraphs,
    bytes: encodedLength(text, eol, bom, encoding)
  }
}

/** 1234 -> "1,234", 2048 -> "2,048 (2.0 KB)". */
export function formatBytes(bytes: number): { exact: string; approx: string | null } {
  const exact = bytes.toLocaleString('en-US')
  if (bytes < 1024) return { exact, approx: null }
  const kb = bytes / 1024
  return { exact, approx: kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB` }
}
