import { classifyPath } from '../../shared/fileKind'
import type { DirEntry } from '../../shared/fsTypes'
import type { MessageKey } from '../app/i18n'

/** Folders always; files only when markdown/text unless `showAll` is on. */
export function filterEntries(entries: DirEntry[], showAll: boolean): DirEntry[] {
  return showAll ? entries : entries.filter((e) => e.isDir || (!e.name.startsWith('.') && classifyPath(e.name) === 'markdown'))
}

/** Returns the translation key of the problem with a file name, or null when the name is usable. */
export function validateEntryName(name: string): MessageKey | null {
  const n = name.trim()
  if (!n || n === '.' || n === '..') return 'nameRequired'
  if (/[\\/\0]/.test(n)) return 'nameInvalidChars'
  return null
}
