/** Link/image destination as markdown writes it: wrapped in <> when a bare target would end early. */
export function markdownDestination(url: string): string {
  let balanced = true
  let depth = 0
  for (const ch of url) {
    if (ch === '(') depth++
    else if (ch === ')' && --depth < 0) balanced = false
  }
  if (depth !== 0) balanced = false
  if (url !== '' && balanced && !/[\s<>]/.test(url)) return url
  const inner = url.replace(/[<>]/g, (c) => encodeURIComponent(c)).replace(/\n/g, '%0A').replace(/\r/g, '%0D')
  return `<${inner}>`
}

/**
 * Marks characters at the start of a line that markdown would read as block syntax, by putting
 * `esc` in front of them. The caller later swaps `esc` for a backslash; going through a stand-in
 * keeps the serializer from escaping the backslash itself.
 */
export function escapeLineStarts(text: string, atBlockStart: boolean, esc: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 && !atBlockStart ? line : escapeLine(line, esc)))
    .join('\n')
}

/**
 * The serializer already escapes `*` `_` `` ` `` `~` `[` `<` and writes `>` as an entity, so only
 * the markers it leaves alone are handled here: `#`, `-`/`+` bullets, `---`/`===` lines and "1.".
 */
function escapeLine(line: string, esc: string): string {
  const lead = /^ {0,3}/.exec(line)![0]
  const rest = line.slice(lead.length)
  if (/^#{1,6}(?:\s|$)/.test(rest) || /^[-+](?:\s|$)/.test(rest)) return `${lead}${esc}${rest}`
  if (/^-(?:[ \t]*-){2,}[ \t]*$/.test(rest) || /^=+[ \t]*$/.test(rest)) return `${lead}${esc}${rest}`
  // ordered list: escape the dot/parenthesis, as in "1\."
  const ordered = /^(\d{1,9})([.)])(?=\s|$)/.exec(rest)
  if (ordered) return `${lead}${ordered[1]}${esc}${ordered[2]}${rest.slice(ordered[0].length)}`
  return line
}
