// Pixel helpers for scanned pages: whatever form the PDF stores a picture in becomes 8-bit gray, upright,
// and no larger than the OCR needs.

/** pdfjs image kinds: 1 = 1 bit per pixel (packed, 1 = white), 2 = RGB, 3 = RGBA. */
export type BitmapKind = 1 | 2 | 3

export interface Gray {
  width: number
  height: number
  data: Uint8Array
}

export function toGray(width: number, height: number, kind: BitmapKind, src: ArrayLike<number>, whiteIsOne = true): Gray {
  const out = new Uint8Array(width * height)
  if (kind === 1) {
    const rowBytes = Math.ceil(width / 8)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (src[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1
        out[y * width + x] = (bit === 1) === whiteIsOne ? 255 : 0
      }
    }
  } else {
    const step = kind === 2 ? 3 : 4
    for (let i = 0, p = 0; i < out.length; i++, p += step) {
      out[i] = (src[p]! * 299 + src[p + 1]! * 587 + src[p + 2]! * 114) / 1000
    }
  }
  return { width, height, data: out }
}

/** Shrinks by an integer factor (box average) so the longer side is at most `maxSide`. */
export function downscale(img: Gray, maxSide: number): Gray {
  const f = Math.ceil(Math.max(img.width, img.height) / maxSide)
  if (f <= 1) return img
  const w = Math.floor(img.width / f)
  const h = Math.floor(img.height / f)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += img.data[(y * f + dy) * img.width + x * f + dx]!
      out[y * w + x] = sum / (f * f)
    }
  }
  return { width: w, height: h, data: out }
}

/** Rotates clockwise by 0, 90, 180 or 270 degrees. */
export function rotate(img: Gray, degrees: number): Gray {
  const d = ((Math.round(degrees / 90) % 4) + 4) % 4
  if (d === 0) return img
  const { width: w, height: h } = img
  const out = new Uint8Array(w * h)
  const outW = d === 2 ? w : h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = img.data[y * w + x]!
      if (d === 1) out[x * outW + (h - 1 - y)] = v
      else if (d === 2) out[(h - 1 - y) * w + (w - 1 - x)] = v
      else out[(w - 1 - x) * outW + y] = v
    }
  }
  return { width: d === 2 ? w : h, height: d === 2 ? h : w, data: out }
}

/**
 * How many degrees clockwise a picture must be turned to read upright, from the matrix it was drawn with
 * (`[a b c d e f]`, PDF convention) and the page's own rotation. Only turns of 90 degrees are handled.
 */
export function uprightRotation(ctm: ArrayLike<number>, pageRotate: number): number {
  const [a, b] = [ctm[0]!, ctm[1]!]
  // direction of the picture's "right" edge in page space, in degrees counter-clockwise from +x
  const ccw = (Math.atan2(b, a) * 180) / Math.PI
  const shown = ccw - pageRotate // counter-clockwise turn of what the viewer sees
  return ((Math.round(-shown / 90) * 90) % 360 + 360) % 360
}
