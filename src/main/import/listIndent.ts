// Re-indents nested Markdown lists so every child sits at its parent's content offset ("1. " = 3, "- " = 2).
// turndown indents children by four spaces whatever the parent's marker is; the editor reads four spaces under a
// numbered parent as one more level of nesting, so sibling items would come out nested inside each other.

const ITEM_RE = /^(\s*)([-*+]|\d+\.)(\s+)(.*)$/

interface Open {
  /** Indent the item had, and the width of its marker plus the spaces after it (its content offset), before. */
  orig: number
  origOffset: number
  /** The same after re-indenting: the item's indent and the width of its marker. */
  indent: number
  width: number
}

export function normalizeListIndent(markdown: string): string {
  const out: string[] = []
  const stack: Open[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence || line.trim() === '') {
      out.push(line)
      continue
    }
    const m = ITEM_RE.exec(line)
    const lead = line.length - line.trimStart().length
    if (m) {
      while (stack.length && stack[stack.length - 1]!.orig >= lead) stack.pop()
      const parent = stack[stack.length - 1]
      const indent = parent ? parent.indent + parent.width : 0
      const marker = `${m[2]} `
      stack.push({ orig: lead, origOffset: m[2]!.length + m[3]!.length, indent, width: marker.length })
      out.push(`${' '.repeat(indent)}${marker}${m[4]}`)
    } else if (lead === 0) {
      stack.length = 0 // an unindented line ends every list
      out.push(line)
    } else {
      // text inside an item (a second paragraph, a table): keep it with its item
      const owner = [...stack].reverse().find((o) => o.orig < lead)
      // move by how much the item's content offset moved, so the text stays under its item
      out.push(owner ? `${' '.repeat(Math.max(0, lead + (owner.indent + owner.width) - (owner.orig + owner.origOffset)))}${line.trimStart()}` : line)
    }
  }
  return out.join('\n')
}
