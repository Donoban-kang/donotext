const unify = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** True when `path` is `root` or lies beneath it. Works for both "/" and "\" separators. */
export function isSameOrInside(path: string, root: string): boolean {
  const p = unify(path)
  const r = unify(root)
  return p === r || p.startsWith(`${r}/`)
}
