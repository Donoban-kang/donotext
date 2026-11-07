const URL_RE = /https?:\/\/[^\s<>)]+/g

/** Characters that would be read as Markdown or math syntax are escaped; URLs are left untouched. */
export function escapeMarkdown(text: string): string {
  // a line that would otherwise start a heading, bullet or numbered list
  return escapeInline(text)
    .replace(/^(#{1,6}(?=\s)|\+(?=\s))/, '\\$1')
    .replace(/^(\d+)([.)])(?=\s)/, '$1\\$2')
}

function escapeInline(text: string): string {
  const escapeChunk = (s: string): string => s.replace(/[\\*_`<>[\]~$|]/g, (c) => `\\${c}`)
  let out = ''
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    out += escapeChunk(text.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + escapeChunk(text.slice(last))
}
