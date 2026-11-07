import type { ImportStats, ImportWarning } from '../../shared/importTypes'

export interface Converted {
  markdown: string
  warnings: ImportWarning[]
  stats: ImportStats
}
