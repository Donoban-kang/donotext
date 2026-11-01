import { describe, expect, it } from 'vitest'
import { decodeText, encodeText, encodedLength, looksLikeText } from '../../src/shared/textFormat'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('decodeText / encodeText', () => {
  it('detects BOM and CRLF and normalizes text to LF', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('a\r\nb\r\n')])
    const r = decodeText(bytes)
    expect(r.bom).toBe(true)
    expect(r.eol).toBe('crlf')
    expect(r.text).toBe('a\nb\n')
    expect(r.validUtf8).toBe(true)
  })
  it('round-trips BOM+CRLF bytes exactly', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('a\r\nb\r\n')])
    const r = decodeText(bytes)
    expect(Array.from(encodeText(r.text, r.eol, r.bom))).toEqual(Array.from(bytes))
  })
  it('handles an empty buffer', () => {
    const r = decodeText(new Uint8Array())
    expect(r.text).toBe('')
    expect(r.eol).toBe('lf')
    expect(r.bom).toBe(false)
  })
  it('round-trips Korean text with spaces', () => {
    const bytes = enc('# 안녕 세계\n\n본문 입니다\n')
    const r = decodeText(bytes)
    expect(Array.from(encodeText(r.text, r.eol, r.bom))).toEqual(Array.from(bytes))
  })
  it('flags invalid UTF-8', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41])).validUtf8).toBe(false)
  })
})

const utf16 = (s: string, be = false, bom = true): Uint8Array => {
  const out: number[] = bom ? (be ? [0xfe, 0xff] : [0xff, 0xfe]) : []
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i)
    out.push(...(be ? [u >> 8, u & 0xff] : [u & 0xff, u >> 8]))
  }
  return Uint8Array.from(out)
}
// "안녕하세요. 한글 텍스트 파일입니다." saved by Windows Notepad as ANSI (CP949)
const CP949_BYTES = Uint8Array.from([0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4, 0x2e, 0x0d, 0x0a, 0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9])

describe('other encodings', () => {
  it('reads UTF-16 LE and BE with a byte order mark, and keeps the mark', () => {
    const text = 'You have received it.\r\n한글도 있어요 가나다\r\n'
    for (const be of [false, true]) {
      const r = decodeText(utf16(text, be))
      expect(r.encoding).toBe(be ? 'utf-16be' : 'utf-16le')
      expect(r.bom).toBe(true)
      expect(r.eol).toBe('crlf')
      expect(r.text).toBe('You have received it.\n한글도 있어요 가나다\n')
      expect(r.validUtf8).toBe(true)
    }
  })
  it('writes UTF-16 back byte for byte', () => {
    for (const be of [false, true]) {
      const bytes = utf16('abc\r\n한글\r\n', be)
      const r = decodeText(bytes)
      expect(Array.from(encodeText(r.text, r.eol, r.bom, r.encoding))).toEqual(Array.from(bytes))
    }
  })
  it('recognises UTF-16 without a byte order mark when it is mostly ASCII', () => {
    const r = decodeText(utf16('Hello, this is plain text.\n', false, false))
    expect(r.encoding).toBe('utf-16le')
    expect(r.bom).toBe(false)
    expect(r.text).toBe('Hello, this is plain text.\n')
    expect(decodeText(utf16('Hello, this is plain text.\n', true, false)).encoding).toBe('utf-16be')
  })
  it('reads Korean text saved as CP949 and writes the same bytes back', () => {
    const r = decodeText(CP949_BYTES)
    expect(r.encoding).toBe('cp949')
    expect(r.text).toBe('안녕하세요.\n가나다')
    expect(r.validUtf8).toBe(true)
    expect(Array.from(encodeText(r.text, r.eol, r.bom, r.encoding))).toEqual(Array.from(CP949_BYTES))
  })
  it('refuses to save a character CP949 cannot hold instead of writing something else', () => {
    expect(() => encodeText('안녕 😀', 'lf', false, 'cp949')).toThrow(/CP949/)
    expect(Array.from(encodeText('A안', 'lf', false, 'cp949'))).toEqual([0x41, 0xbe, 0xc8])
  })
  it('does not mistake Western single-byte text for Korean, and leaves it read-only', () => {
    // "café olé" in Windows-1252: not UTF-8, and not Korean either
    const r = decodeText(Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x6f, 0x6c, 0xe9, 0x74, 0x65]))
    expect(r.encoding).toBe('utf-8')
    expect(r.validUtf8).toBe(false)
  })
  it('plain UTF-8 stays UTF-8, including Korean', () => {
    const r = decodeText(enc('안녕하세요 UTF-8\n'))
    expect(r.encoding).toBe('utf-8')
    expect(r.validUtf8).toBe(true)
  })
  it('looksLikeText accepts text of every supported encoding and refuses binary data', () => {
    expect(looksLikeText(enc('hello'))).toBe(true)
    expect(looksLikeText(utf16('hello'))).toBe(true)
    expect(looksLikeText(utf16('hello world, long enough', false, false))).toBe(true)
    expect(looksLikeText(CP949_BYTES)).toBe(true)
    expect(looksLikeText(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]))).toBe(false)
  })
  it('encodedLength matches the real encoded size for every encoding', () => {
    const sample = 'A안녕\n😀 b'
    for (const e of ['utf-8', 'utf-16le', 'utf-16be'] as const) {
      for (const eol of ['lf', 'crlf'] as const) {
        for (const bom of [false, true]) {
          expect(encodedLength(sample, eol, bom, e)).toBe(encodeText(sample, eol, bom, e).length)
        }
      }
    }
    expect(encodedLength('A안녕\n', 'crlf', false, 'cp949')).toBe(encodeText('A안녕\n', 'crlf', false, 'cp949').length)
  })
})
