import { describe, expect, it } from 'vitest'
import { decodeText, encodeText } from '../../src/shared/textFormat'

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
