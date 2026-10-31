import { diffArrays } from 'diff'

/** A run of base lines [start, end) that one side replaced with `lines` (start === end: pure insertion). */
interface Hunk {
  start: number
  end: number
  lines: string[]
}

function hunksOf(base: string[], other: string[]): Hunk[] {
  const out: Hunk[] = []
  let i = 0
  let cur: Hunk | null = null
  for (const part of diffArrays(base, other)) {
    if (part.removed) {
      cur ??= { start: i, end: i, lines: [] }
      cur.end = i + part.count
      i += part.count
    } else if (part.added) {
      cur ??= { start: i, end: i, lines: [] }
      cur.lines.push(...part.value)
    } else {
      if (cur) out.push(cur)
      cur = null
      i += part.count
    }
  }
  if (cur) out.push(cur)
  return out
}

const same = (a: Hunk, b: Hunk): boolean =>
  a.start === b.start && a.end === b.end && a.lines.length === b.lines.length && a.lines.every((l, k) => l === b.lines[k])

const collide = (a: Hunk, b: Hunk): boolean =>
  (a.start < b.end && b.start < a.end) || (a.start === a.end && b.start === b.end && a.start === b.start)

/**
 * Line-based three-way merge. `base` is the text both sides started from; returns the text with
 * both sets of edits applied, or null when the two sides changed the same lines differently.
 */
export function merge3(base: string, local: string, remote: string): string | null {
  if (local === remote) return local
  if (local === base) return remote
  if (remote === base) return local

  const b = base.split('\n')
  const mine = hunksOf(b, local.split('\n'))
  const theirs = hunksOf(b, remote.split('\n'))
  for (const x of mine) {
    for (const y of theirs) {
      if (!same(x, y) && collide(x, y)) return null
    }
  }

  const all = [...mine, ...theirs.filter((y) => !mine.some((x) => same(x, y)))].sort((p, q) => p.start - q.start || p.end - q.end)
  const out: string[] = []
  let pos = 0
  for (const h of all) {
    out.push(...b.slice(pos, h.start), ...h.lines)
    pos = Math.max(pos, h.end)
  }
  out.push(...b.slice(pos))
  return out.join('\n')
}
