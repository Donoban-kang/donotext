// Small helpers over fast-xml-parser's "preserveOrder" output, for reading Office Open XML parts.

import { XMLParser } from 'fast-xml-parser'

export type XNode = { [tag: string]: XNode[] | string } & { ':@'?: Record<string, string> }

// Writers such as openpyxl store non-ASCII text as numeric character references (&#54637;), which the
// parser leaves as they are.
function decodeNumericRefs(value: string): string {
  if (!value.includes('&#')) return value
  return value.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (m, hex: string | undefined, dec: string | undefined) => {
    const code = hex ? Number.parseInt(hex, 16) : Number(dec)
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
  })
}

const parser = new XMLParser({
  tagValueProcessor: (_name, value) => (typeof value === 'string' ? decodeNumericRefs(value) : value),
  attributeValueProcessor: (_name, value) => decodeNumericRefs(value),
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  removeNSPrefix: false
})

export function parseXml(xml: string): XNode[] {
  return parser.parse(xml) as XNode[]
}

export function tagOf(n: XNode): string {
  for (const k of Object.keys(n)) if (k !== ':@') return k
  return ''
}

export function kids(n: XNode): XNode[] {
  const v = n[tagOf(n)]
  return Array.isArray(v) ? v : []
}

export function attr(n: XNode, name: string): string | undefined {
  return n[':@']?.[name]
}

export function child(n: XNode, name: string): XNode | undefined {
  return kids(n).find((k) => tagOf(k) === name)
}

export function childrenNamed(n: XNode, name: string): XNode[] {
  return kids(n).filter((k) => tagOf(k) === name)
}

/** First descendant (depth first) with this tag. */
export function descend(nodes: XNode[], name: string): XNode | undefined {
  for (const n of nodes) {
    if (tagOf(n) === name) return n
    const hit = descend(kids(n), name)
    if (hit) return hit
  }
  return undefined
}

/** All descendants with this tag, in document order. */
export function descendAll(nodes: XNode[], name: string, out: XNode[] = []): XNode[] {
  for (const n of nodes) {
    if (tagOf(n) === name) out.push(n)
    descendAll(kids(n), name, out)
  }
  return out
}

/** Concatenated text of all #text descendants. */
export function textOf(nodes: XNode[]): string {
  let out = ''
  for (const n of nodes) {
    const t = tagOf(n)
    if (t === '#text') out += String(n['#text'] ?? '')
    else out += textOf(kids(n))
  }
  return out
}
