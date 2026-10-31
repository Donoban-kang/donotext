import { describe, expect, it } from 'vitest'
import { filterEntries, validateEntryName } from '../../src/renderer/sidebar/treeUtils'
import type { DirEntry } from '../../src/shared/fsTypes'

const e = (name: string, isDir = false): DirEntry => ({ name, path: `/w/${name}`, isDir })

describe('filterEntries', () => {
  const entries = [e('sub', true), e('a.md'), e('b.TXT'), e('c.json'), e('.hidden.md'), e('noext')]
  it('keeps folders and markdown/text files by default', () => {
    expect(filterEntries(entries, false).map((x) => x.name)).toEqual(['sub', 'a.md', 'b.TXT'])
  })
  it('shows everything when showAll is on', () => {
    expect(filterEntries(entries, true)).toHaveLength(entries.length)
  })
})

describe('validateEntryName', () => {
  it('accepts normal and Korean names', () => {
    expect(validateEntryName('메모 1.md')).toBeNull()
  })
  it.each(['', '  ', '.', '..', 'a/b', 'a\\b', 'x\0y'])('rejects %j', (n) => {
    expect(validateEntryName(n)).not.toBeNull()
  })
})
