export type FileKind = 'markdown' | 'sourceOnly'

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.txt'] as const

export function classifyPath(path: string): FileKind {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'sourceOnly'
  const ext = base.slice(dot).toLowerCase()
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(ext) ? 'markdown' : 'sourceOnly'
}
