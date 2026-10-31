import { describe, expect, it } from 'vitest'
import { imageExtFromMime, matchesImageSignature, normalizeImageExt } from '../../src/shared/images'

const bytes = (...b: number[]): Uint8Array => new Uint8Array(b)
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

describe('normalizeImageExt', () => {
  it('lower-cases, drops a leading dot and canonicalizes jpeg', () => {
    expect(normalizeImageExt('PNG')).toBe('png')
    expect(normalizeImageExt('.webp')).toBe('webp')
    expect(normalizeImageExt('jpeg')).toBe('jpg')
  })
  it.each(['exe', 'svg', '../x', 'png/../x', '', 'pn g', 'png\0'])('rejects %j', (e) => {
    expect(normalizeImageExt(e)).toBeNull()
  })
})

describe('imageExtFromMime', () => {
  it('maps supported image types', () => {
    expect(imageExtFromMime('image/png')).toBe('png')
    expect(imageExtFromMime('image/jpeg')).toBe('jpg')
    expect(imageExtFromMime('image/gif')).toBe('gif')
    expect(imageExtFromMime('image/webp')).toBe('webp')
  })
  it('rejects everything else (including svg, which can carry script)', () => {
    expect(imageExtFromMime('image/svg+xml')).toBeNull()
    expect(imageExtFromMime('text/html')).toBeNull()
    expect(imageExtFromMime('')).toBeNull()
  })
})

describe('matchesImageSignature', () => {
  it('accepts real file headers', () => {
    expect(matchesImageSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), 'png')).toBe(true)
    expect(matchesImageSignature(bytes(0xff, 0xd8, 0xff, 0xe0, 0), 'jpg')).toBe(true)
    expect(matchesImageSignature(bytes(...ascii('GIF89a'), 0), 'gif')).toBe(true)
    expect(matchesImageSignature(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')), 'webp')).toBe(true)
  })
  it('rejects content that does not match the claimed type', () => {
    expect(matchesImageSignature(bytes(...ascii('<script>alert(1)</script>')), 'png')).toBe(false)
    expect(matchesImageSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'jpg')).toBe(false)
    expect(matchesImageSignature(bytes(), 'png')).toBe(false)
    expect(matchesImageSignature(bytes(1, 2, 3), 'webp')).toBe(false)
  })
})
