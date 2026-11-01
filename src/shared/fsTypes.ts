import type { FileKind } from './fileKind'
import type { Encoding, Eol } from './textFormat'

export type Warning = 'notUtf8' | 'tooLarge'

export interface ReadResult {
  path: string
  text: string
  eol: Eol
  bom: boolean
  /** Encoding the file was read in (UTF-8 when absent); saving writes it back the same way. */
  encoding?: Encoding
  kind: FileKind
  readOnly: boolean
  warning?: Warning
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

/** What happened to one item dropped onto the window from the file manager. */
export type DropEntry =
  | { kind: 'file'; result: ReadResult }
  | { kind: 'folder'; root: string }
  | { kind: 'rejected'; name: string; reason: 'binary' | 'tooLarge' | 'unreadable' }
