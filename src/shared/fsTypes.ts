import type { FileKind } from './fileKind'
import type { Eol } from './textFormat'

export type Warning = 'notUtf8' | 'tooLarge'

export interface ReadResult {
  path: string
  text: string
  eol: Eol
  bom: boolean
  kind: FileKind
  readOnly: boolean
  warning?: Warning
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}
