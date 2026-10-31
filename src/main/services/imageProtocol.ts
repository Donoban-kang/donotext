import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import { IMAGE_MIME, IMAGE_SCHEME, normalizeImageExt } from '../../shared/images'
import type { FsService } from './fsService'

/**
 * Validates a `donotext-file://local/<encoded absolute path>` request. Only image files inside
 * locations the user has opened are served; everything else yields null (answered with 404).
 */
export function resolveImageRequest(url: string, fs: FsService): { path: string; mime: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${IMAGE_SCHEME}:` || u.hostname !== 'local') return null
  let decoded: string
  try {
    decoded = decodeURIComponent(u.pathname.slice(1))
  } catch {
    return null
  }
  if (!isAbsolute(decoded)) return null
  const ext = normalizeImageExt(extname(decoded))
  if (!ext) return null
  const path = resolve(decoded)
  return fs.isAllowed(path) ? { path, mime: IMAGE_MIME[ext] } : null
}

export async function handleImageRequest(request: Request, fs: FsService): Promise<Response> {
  const hit = resolveImageRequest(request.url, fs)
  if (!hit) return new Response('Not found', { status: 404 })
  try {
    const body = await readFile(hit.path)
    return new Response(new Uint8Array(body), { headers: { 'content-type': hit.mime, 'cache-control': 'no-store' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
