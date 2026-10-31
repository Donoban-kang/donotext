const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto'])

/** True for http(s)/mailto URLs and scheme-less relative or anchor links. */
export function isSafeLinkUrl(url: string): boolean {
  // Browsers ignore control characters and whitespace inside the scheme ("java\tscript:").
  const s = url.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(s)
  if (!m) return true
  return ALLOWED_SCHEMES.has(m[1].toLowerCase())
}
