import { describe, expect, it } from 'vitest'
import { isSameOrInside } from '../../src/shared/paths'

describe('isSameOrInside', () => {
  it('matches the path itself and anything beneath it, with either separator', () => {
    expect(isSameOrInside('/w/dir', '/w/dir')).toBe(true)
    expect(isSameOrInside('/w/dir/a.md', '/w/dir')).toBe(true)
    expect(isSameOrInside('C:\\w\\dir\\sub\\a.md', 'C:\\w\\dir')).toBe(true)
    expect(isSameOrInside('C:\\w\\dir/a.md', 'C:/w/dir')).toBe(true)
  })
  it('does not match siblings that merely share a prefix', () => {
    expect(isSameOrInside('/w/dir2/a.md', '/w/dir')).toBe(false)
    expect(isSameOrInside('C:\\w\\dir2\\a.md', 'C:\\w\\dir')).toBe(false)
  })
  it('ignores a trailing separator on the root', () => {
    expect(isSameOrInside('/w/dir/a.md', '/w/dir/')).toBe(true)
  })
})
