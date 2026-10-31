/**
 * Splits a leading YAML front-matter block from the markdown body.
 * Only a block that starts on the very first line and is closed by `---` or `...` counts.
 */
export function splitFrontMatter(md: string): { frontMatter: string | null; body: string } {
  const lines = md.split('\n')
  if (lines[0] !== '---') return { frontMatter: null, body: md }
  const end = lines.findIndex((l, i) => i > 0 && (l === '---' || l === '...'))
  if (end < 0) return { frontMatter: null, body: md }
  return { frontMatter: lines.slice(1, end).join('\n'), body: lines.slice(end + 1).join('\n') }
}
