import { classifyPath } from '../../shared/fileKind'
import type { DirEntry } from '../../shared/fsTypes'

/** Folders always; files only when markdown/text unless `showAll` is on. */
export function filterEntries(entries: DirEntry[], showAll: boolean): DirEntry[] {
  return showAll ? entries : entries.filter((e) => e.isDir || (!e.name.startsWith('.') && classifyPath(e.name) === 'markdown'))
}

/** Returns an error message key-less reason string, or null when the name is usable. */
export function validateEntryName(name: string): string | null {
  const n = name.trim()
  if (!n || n === '.' || n === '..') return '이름을 입력하세요.'
  if (/[\\/\0]/.test(n)) return '이름에 / \\ 문자를 사용할 수 없습니다.'
  return null
}
