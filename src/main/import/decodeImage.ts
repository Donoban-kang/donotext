// Decodes a PNG or JPEG picture to 8-bit gray with pure-JS decoders, so the OCR can turn it (a photo of a
// document is often sideways) and the engine never has to open files itself.

import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { downscale, type Gray } from './pageBitmap'

export class ImageDecodeError extends Error {}

/** Refuse pictures with more pixels than this (a decoded 100 megapixel picture needs 400 MB). */
const MAX_PIXELS = 100_000_000
/** Same longest side as the pages of a scanned PDF (about 300 dpi for A4). */
export const OCR_MAX_SIDE = 3600

function rgbaToGray(width: number, height: number, rgba: ArrayLike<number>): Gray {
  const out = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const lum = (rgba[p]! * 299 + rgba[p + 1]! * 587 + rgba[p + 2]! * 114) / 1000
    const a = rgba[p + 3]! / 255
    out[i] = lum * a + 255 * (1 - a) // transparent areas are paper-white
  }
  return { width, height, data: out }
}

export function decodeToGray(bytes: Uint8Array): Gray {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let raw: Gray
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      if (buf.readUInt32BE(16) * buf.readUInt32BE(20) > MAX_PIXELS) throw new ImageDecodeError('too many pixels')
      const png = PNG.sync.read(buf)
      raw = rgbaToGray(png.width, png.height, png.data)
    } else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_PIXELS / 1_000_000, maxMemoryUsageInMB: 768 })
      raw = rgbaToGray(img.width, img.height, img.data)
    } else throw new ImageDecodeError('unsupported picture format')
  } catch (e) {
    if (e instanceof ImageDecodeError) throw e
    throw new ImageDecodeError(e instanceof Error ? e.message : 'unreadable picture')
  }
  return downscale(raw, OCR_MAX_SIDE)
}
