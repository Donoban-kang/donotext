import { describe, expect, it } from 'vitest'
import { docDirOf, resolveImageSrc, toImageUrl } from '../../src/shared/images'

describe('toImageUrl', () => {
  it('encodes the absolute path into the donotext-file scheme', () => {
    expect(toImageUrl('/w/한글 폴더/a b.png')).toBe(`donotext-file://local/${encodeURIComponent('/w/한글 폴더/a b.png')}`)
  })
})

describe('resolveImageSrc', () => {
  it('turns a relative path into a protocol url based on the document folder', () => {
    expect(resolveImageSrc('assets/a.png', '/w/notes')).toBe(toImageUrl('/w/notes/assets/a.png'))
    expect(resolveImageSrc('./a.png', '/w/notes')).toBe(toImageUrl('/w/notes/a.png'))
  })
  it('normalizes ".." segments', () => {
    expect(resolveImageSrc('../img/a.png', '/w/notes')).toBe(toImageUrl('/w/img/a.png'))
  })
  it('handles Windows style folders', () => {
    expect(resolveImageSrc('assets/a.png', 'C:\\Users\\me\\notes')).toBe(toImageUrl('C:/Users/me/notes/assets/a.png'))
  })
  it('leaves remote and inline images alone', () => {
    expect(resolveImageSrc('https://example.com/a.png', '/w')).toBe('https://example.com/a.png')
    expect(resolveImageSrc('data:image/png;base64,AAAA', '/w')).toBe('data:image/png;base64,AAAA')
  })
  it('does not resolve relative paths without a document folder (untitled)', () => {
    expect(resolveImageSrc('assets/a.png', null)).toBe('assets/a.png')
  })
  it('leaves already-resolved protocol urls and absolute paths untouched or resolved', () => {
    const url = toImageUrl('/w/a.png')
    expect(resolveImageSrc(url, '/w')).toBe(url)
    expect(resolveImageSrc('/abs/a.png', '/w')).toBe(toImageUrl('/abs/a.png'))
  })
})

describe('docDirOf', () => {
  it('returns the folder of a document path', () => {
    expect(docDirOf('/w/notes/a.md')).toBe('/w/notes')
    expect(docDirOf('C:\\Users\\me\\a.md')).toBe('C:\\Users\\me')
  })
  it('returns null for untitled documents and bare names', () => {
    expect(docDirOf(null)).toBeNull()
    expect(docDirOf('a.md')).toBeNull()
  })
})
