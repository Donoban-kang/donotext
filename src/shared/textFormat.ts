export type Eol = 'lf' | 'crlf'

export interface DecodedText {
  text: string
  eol: Eol
  bom: boolean
  validUtf8: boolean
}

const BOM = [0xef, 0xbb, 0xbf]

export function decodeText(buf: Uint8Array): DecodedText {
  const bom = buf.length >= 3 && BOM.every((b, i) => buf[i] === b)
  const body = bom ? buf.subarray(3) : buf
  let raw: string
  let validUtf8 = true
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    raw = new TextDecoder('utf-8', { fatal: false }).decode(body)
    validUtf8 = false
  }
  const firstLf = raw.indexOf('\n')
  const eol: Eol = firstLf > 0 && raw[firstLf - 1] === '\r' ? 'crlf' : 'lf'
  return { text: raw.replace(/\r\n/g, '\n'), eol, bom, validUtf8 }
}

export function encodeText(text: string, eol: Eol, bom: boolean): Uint8Array {
  const out = eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text
  const body = new TextEncoder().encode(out)
  if (!bom) return body
  const withBom = new Uint8Array(body.length + 3)
  withBom.set(BOM, 0)
  withBom.set(body, 3)
  return withBom
}
