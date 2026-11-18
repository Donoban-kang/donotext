// Minimal 8-bit grayscale PNG encoder (OCR input). No dependencies beyond node:zlib.

import { crc32, deflateSync } from 'node:zlib'

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + data.length + 4 - 4 + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length)
  return out
}

export function encodeGrayPng(width: number, height: number, gray: Uint8Array): Uint8Array {
  if (gray.length !== width * height) throw new Error('Invalid pixel buffer')
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 0 // grayscale
  // rows are prefixed with filter type 0 (none): fast, and the image is only read by the OCR engine
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0
    raw.set(gray.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}
