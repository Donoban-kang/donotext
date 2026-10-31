export interface OutlineItem {
  level: number
  text: string
  /** Character offset of the heading line within the markdown text. */
  offset: number
}

/** ATX headings of a markdown document, skipping front matter and fenced code blocks. */
export function extractOutline(md: string): OutlineItem[] {
  const lines = md.split('\n')
  const out: OutlineItem[] = []
  let offset = 0
  let i = 0

  if (lines[0] === '---') {
    const end = lines.findIndex((l, idx) => idx > 0 && (l === '---' || l === '...'))
    if (end > 0) {
      for (; i <= end; i++) offset += lines[i].length + 1
    }
  }

  let fence: { char: string; len: number } | null = null
  for (; i < lines.length; i++) {
    const line = lines[i]
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = { char: f[1][0], len: f[1].length }
      else if (f[1][0] === fence.char && f[1].length >= fence.len) fence = null
    } else if (!fence) {
      const m = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)
      if (m && m[2].trim() !== '') out.push({ level: m[1].length, text: m[2].trim(), offset })
    }
    offset += line.length + 1
  }
  return out
}
