import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { IMAGE_MIME, MAX_IMAGE_BYTES, matchesImageSignature, normalizeImageExt } from '../../shared/images'
import type { FsService } from './fsService'

/** Saves pasted images into an `assets` folder next to the document. */
export class ImageService {
  constructor(private readonly fs: FsService) {}

  /** Returns the saved image's path relative to the document, using forward slashes. */
  async save(docPath: string | null, bytes: Uint8Array, ext: string): Promise<string> {
    if (!docPath) throw new Error('Save the document before pasting images')
    if (!this.fs.isAllowed(docPath)) throw new Error('Document is not in an opened location')
    const e = normalizeImageExt(ext)
    if (!e) throw new Error('Unsupported image type')
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new Error('Invalid image size')
    }
    if (!matchesImageSignature(bytes, e)) throw new Error('File content is not a valid image')

    const assets = join(dirname(resolve(docPath)), 'assets')
    await mkdir(assets, { recursive: true })
    this.fs.grant(assets) // so the editor may display what it just saved
    const name = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${e}`
    await writeFile(join(assets, name), bytes, { flag: 'wx' })
    return `assets/${name}`
  }

  /** Reads an image the user may access (inside an opened location, real image content), else null. */
  async read(absPath: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
    const ext = normalizeImageExt(extname(absPath))
    const path = resolve(absPath)
    if (!ext || !this.fs.isAllowed(path)) return null
    try {
      if ((await stat(path)).size > MAX_IMAGE_BYTES) return null
      const bytes = new Uint8Array(await readFile(path))
      return matchesImageSignature(bytes, ext) ? { bytes, mime: IMAGE_MIME[ext] } : null
    } catch {
      return null
    }
  }
}
