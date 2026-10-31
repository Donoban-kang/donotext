import { isAbsolute, resolve } from 'node:path'

const MAX_TOTAL_BYTES = 25 * 1024 * 1024

function safeDecode(s: string): string {
  try {
    return decodeURI(s)
  } catch {
    return s
  }
}

/**
 * Replaces local `<img src>` paths with data URIs so an exported file is self-contained.
 * Reading goes through `read`, which decides what the app may open; unreadable images stay as they are.
 */
export async function inlineLocalImages(
  html: string,
  docDir: string | null,
  read: (absPath: string) => Promise<{ bytes: Uint8Array; mime: string } | null>,
  maxTotalBytes = MAX_TOTAL_BYTES
): Promise<string> {
  const pattern = /(<img\b[^>]*?\bsrc=")([^"]+)(")/gi
  let used = 0
  let out = ''
  let last = 0
  for (const m of html.matchAll(pattern)) {
    const [whole, head, src, tail] = m
    out += html.slice(last, m.index)
    last = (m.index ?? 0) + whole.length
    let replacement = whole
    if (!/^(https?:|data:|#)/i.test(src)) {
      const decoded = safeDecode(src)
      const abs = isAbsolute(decoded) ? decoded : docDir ? resolve(docDir, decoded) : null
      const file = abs ? await read(abs) : null
      if (file && used + file.bytes.length <= maxTotalBytes) {
        used += file.bytes.length
        replacement = `${head}data:${file.mime};base64,${Buffer.from(file.bytes).toString('base64')}${tail}`
      }
    }
    out += replacement
  }
  return out + html.slice(last)
}
