/** Image types the app writes and serves. SVG is deliberately excluded: it can carry script. */
export const ALLOWED_IMAGE_EXTS = ['png', 'jpg', 'gif', 'webp'] as const
export type ImageExt = (typeof ALLOWED_IMAGE_EXTS)[number]

export const IMAGE_MIME: Record<ImageExt, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export function normalizeImageExt(ext: string): ImageExt | null {
  if (!/^\.?[A-Za-z]{2,5}$/.test(ext)) return null
  const e = ext.replace(/^\./, '').toLowerCase()
  const canonical = e === 'jpeg' ? 'jpg' : e
  return (ALLOWED_IMAGE_EXTS as readonly string[]).includes(canonical) ? (canonical as ImageExt) : null
}

export function imageExtFromMime(mime: string): ImageExt | null {
  const entry = (Object.entries(IMAGE_MIME) as Array<[ImageExt, string]>).find(([, m]) => m === mime.toLowerCase())
  return entry ? entry[0] : null
}

const startsWith = (b: Uint8Array, sig: number[], at = 0): boolean => sig.every((v, i) => b[at + i] === v)

/** True when the first bytes really look like the claimed image type. */
export function matchesImageSignature(bytes: Uint8Array, ext: ImageExt): boolean {
  switch (ext) {
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'jpg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'gif':
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) // "GIF8"
    case 'webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // RIFF....WEBP
  }
}

export const IMAGE_SCHEME = 'donotext-file'

export function toImageUrl(absolutePath: string): string {
  return `${IMAGE_SCHEME}://local/${encodeURIComponent(absolutePath)}`
}

function normalizePath(p: string): string {
  const abs = p.startsWith('/')
  const drive = (s: string | undefined): boolean => s !== undefined && /^[A-Za-z]:$/.test(s)
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..' && !drive(out[out.length - 1])) out.pop()
      else if (!abs && !drive(out[0])) out.push('..')
    } else out.push(seg)
  }
  return (abs ? '/' : '') + out.join('/')
}

/**
 * Display-time URL for an image `src` found in a document. The markdown keeps the original (usually
 * relative) path; only what the editor shows is rewritten to the local-image scheme.
 */
export function resolveImageSrc(src: string, docDir: string | null): string {
  if (/^(https?:|data:image\/|donotext-file:)/i.test(src)) return src
  const isAbsolute = src.startsWith('/') || /^[A-Za-z]:[\\/]/.test(src)
  if (isAbsolute) return toImageUrl(normalizePath(src.replace(/\\/g, '/')))
  if (docDir === null) return src
  return toImageUrl(normalizePath(`${docDir.replace(/\\/g, '/')}/${src.replace(/\\/g, '/')}`))
}

/** Folder containing a document, or null for untitled documents. */
export function docDirOf(path: string | null): string | null {
  if (!path) return null
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i > 0 ? path.slice(0, i) : null
}
