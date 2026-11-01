export type Eol = 'lf' | 'crlf'

/**
 * Text encodings the editor reads and writes. A file is saved back in the encoding it was opened in, so
 * opening and saving never silently converts it.
 */
export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'cp949'

export interface DecodedText {
  text: string
  eol: Eol
  /** A byte order mark was present (UTF-8 BOM, or the FF FE / FE FF mark of UTF-16). */
  bom: boolean
  /** False when the bytes could not be read losslessly in any supported encoding (read-only then). */
  validUtf8: boolean
  encoding: Encoding
}

const BOM_UTF8 = [0xef, 0xbb, 0xbf]
const SNIFF_BYTES = 4096

const startsWith = (buf: Uint8Array, bytes: number[]): boolean => buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b)

/** Counts NUL bytes at even and odd offsets of the first `SNIFF_BYTES`; UTF-16 text shows NULs at one parity only. */
function nulParity(buf: Uint8Array): { even: number; odd: number; pairs: number } {
  const n = Math.min(buf.length, SNIFF_BYTES) & ~1
  let even = 0
  let odd = 0
  for (let i = 0; i < n; i += 2) {
    if (buf[i] === 0) even++
    if (buf[i + 1] === 0) odd++
  }
  return { even, odd, pairs: n / 2 }
}

/** UTF-16 without a byte order mark: mostly-ASCII text has a NUL in every other byte. */
function bomlessUtf16(buf: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const { even, odd, pairs } = nulParity(buf)
  if (pairs < 4) return null
  if (odd >= pairs * 0.3 && even === 0) return 'utf-16le'
  if (even >= pairs * 0.3 && odd === 0) return 'utf-16be'
  return null
}

function tryDecode(label: string, bytes: Uint8Array): string | null {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

const isHangul = (cp: number): boolean => (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x3131 && cp <= 0x318e) || (cp >= 0x1100 && cp <= 0x11ff)

/**
 * Non-UTF-8 bytes may be Korean text saved by Windows (CP949 / EUC-KR). Western single-byte text often
 * decodes as "valid" CP949 too, so it only counts when most of the non-ASCII letters come out as Hangul.
 */
function looksLikeKorean(text: string): boolean {
  let nonAscii = 0
  let hangul = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number
    if (cp < 0x80) continue
    nonAscii++
    if (isHangul(cp)) hangul++
  }
  return nonAscii > 0 && hangul / nonAscii >= 0.6
}

/** True when the start of a file can be read as text: no NUL bytes, unless they are UTF-16's. */
export function looksLikeText(head: Uint8Array): boolean {
  if (startsWith(head, [0xff, 0xfe]) || startsWith(head, [0xfe, 0xff])) return true
  if (!head.includes(0)) return true
  return bomlessUtf16(head) !== null
}

export function decodeText(buf: Uint8Array): DecodedText {
  let encoding: Encoding = 'utf-8'
  let bom = false
  let body = buf
  let raw: string | null = null
  let lossless = true

  if (startsWith(buf, BOM_UTF8)) {
    bom = true
    body = buf.subarray(3)
  } else if (startsWith(buf, [0xff, 0xfe])) {
    encoding = 'utf-16le'
    bom = true
    body = buf.subarray(2)
  } else if (startsWith(buf, [0xfe, 0xff])) {
    encoding = 'utf-16be'
    bom = true
    body = buf.subarray(2)
  } else {
    const guess = bomlessUtf16(buf)
    if (guess) encoding = guess
  }

  if (encoding === 'utf-8') {
    raw = tryDecode('utf-8', body)
    if (raw === null) {
      const korean = tryDecode('euc-kr', body)
      if (korean !== null && looksLikeKorean(korean)) {
        encoding = 'cp949'
        raw = korean
      } else {
        raw = new TextDecoder('utf-8', { fatal: false }).decode(body)
        lossless = false
      }
    }
  } else {
    raw = tryDecode(encoding, body)
    if (raw === null) {
      raw = new TextDecoder(encoding, { fatal: false }).decode(body)
      lossless = false
    }
  }

  const firstLf = raw.indexOf('\n')
  const eol: Eol = firstLf > 0 && raw[firstLf - 1] === '\r' ? 'crlf' : 'lf'
  return { text: raw.replace(/\r\n/g, '\n'), eol, bom, validUtf8: lossless, encoding }
}

let cp949Table: Map<number, number> | null = null

/** Character -> two-byte CP949 code, built once from the platform's own decoder so no table has to ship. */
function cp949Codes(): Map<number, number> {
  if (cp949Table) return cp949Table
  const decoder = new TextDecoder('euc-kr', { fatal: true })
  const map = new Map<number, number>()
  const pair = new Uint8Array(2)
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      pair[0] = lead
      pair[1] = trail
      try {
        const ch = decoder.decode(pair)
        if (ch.length === 1 && ch !== '�' && !map.has(ch.charCodeAt(0))) map.set(ch.charCodeAt(0), (lead << 8) | trail)
      } catch {
        // not a valid pair
      }
    }
  }
  cp949Table = map
  return map
}

function encodeCp949(text: string): Uint8Array {
  const table = cp949Codes()
  const out: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number
    if (cp < 0x80) {
      out.push(cp)
      continue
    }
    const code = cp <= 0xffff ? table.get(cp) : undefined
    if (code === undefined) throw new Error(`Cannot save ${JSON.stringify(ch)} (U+${cp.toString(16).toUpperCase()}) in the CP949 encoding`)
    out.push(code >> 8, code & 0xff)
  }
  return Uint8Array.from(out)
}

function encodeUtf16(text: string, bigEndian: boolean, bom: boolean): Uint8Array {
  const out = new Uint8Array((text.length + (bom ? 1 : 0)) * 2)
  let o = 0
  const put = (unit: number): void => {
    out[o++] = bigEndian ? unit >> 8 : unit & 0xff
    out[o++] = bigEndian ? unit & 0xff : unit >> 8
  }
  if (bom) put(0xfeff)
  for (let i = 0; i < text.length; i++) put(text.charCodeAt(i))
  return out
}

export function encodeText(text: string, eol: Eol, bom: boolean, encoding: Encoding = 'utf-8'): Uint8Array {
  const out = eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text
  if (encoding === 'utf-16le' || encoding === 'utf-16be') return encodeUtf16(out, encoding === 'utf-16be', bom)
  if (encoding === 'cp949') return encodeCp949(out)
  const body = new TextEncoder().encode(out)
  if (!bom) return body
  const withBom = new Uint8Array(body.length + 3)
  withBom.set(BOM_UTF8, 0)
  withBom.set(body, 3)
  return withBom
}

/** Size of the saved file in bytes, without building the encoded buffer (CP949 would need its table). */
export function encodedLength(text: string, eol: Eol, bom: boolean, encoding: Encoding = 'utf-8'): number {
  const out = eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text
  if (encoding === 'utf-16le' || encoding === 'utf-16be') return (out.length + (bom ? 1 : 0)) * 2
  if (encoding === 'cp949') {
    let n = 0
    for (const ch of out) n += (ch.codePointAt(0) as number) < 0x80 ? 1 : 2
    return n
  }
  return new TextEncoder().encode(out).length + (bom ? 3 : 0)
}
