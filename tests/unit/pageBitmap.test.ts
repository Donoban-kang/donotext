import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { encodeGrayPng } from '../../src/main/import/pngEncode'
import { downscale, rotate, toGray, uprightRotation } from '../../src/main/import/pageBitmap'

describe('toGray', () => {
  it('unpacks 1-bit rows (padded to whole bytes), 1 = white', () => {
    const g = toGray(3, 2, 1, [0b10100000, 0b01000000])
    expect(Array.from(g.data)).toEqual([255, 0, 255, 0, 255, 0])
  })
  it('can read 1-bit data where 1 = black', () => {
    expect(Array.from(toGray(2, 1, 1, [0b10000000], false).data)).toEqual([0, 255])
  })
  it('converts RGB and RGBA (alpha ignored) to luminance', () => {
    expect(Array.from(toGray(2, 1, 2, [255, 255, 255, 0, 0, 0]).data)).toEqual([255, 0])
    expect(Array.from(toGray(1, 1, 3, [255, 0, 0, 7]).data)).toEqual([76])
  })
})

describe('downscale / rotate', () => {
  it('averages blocks and leaves small images alone', () => {
    const img = { width: 4, height: 2, data: Uint8Array.from([0, 0, 100, 100, 0, 0, 100, 100]) }
    expect(downscale(img, 10)).toBe(img)
    const small = downscale(img, 2)
    expect(small).toMatchObject({ width: 2, height: 1 })
    expect(Array.from(small.data)).toEqual([0, 100])
  })
  it('rotates clockwise in 90 degree steps', () => {
    const img = { width: 3, height: 2, data: Uint8Array.from([1, 2, 3, 4, 5, 6]) } // 1 2 3 / 4 5 6
    expect(Array.from(rotate(img, 90).data)).toEqual([4, 1, 5, 2, 6, 3])
    expect(rotate(img, 90)).toMatchObject({ width: 2, height: 3 })
    expect(Array.from(rotate(img, 180).data)).toEqual([6, 5, 4, 3, 2, 1])
    expect(Array.from(rotate(img, 270).data)).toEqual([3, 6, 2, 5, 1, 4])
    expect(rotate(img, 0)).toBe(img)
    expect(rotate(img, 360)).toBe(img)
  })
})

describe('uprightRotation', () => {
  it('is 0 for a picture drawn normally, 180 for one drawn upside down', () => {
    expect(uprightRotation([595, 0, 0, 842, 0, 0], 0)).toBe(0)
    expect(uprightRotation([-595, 0, 0, -842, 595, 842], 0)).toBe(180)
  })
  it('follows the page rotation', () => {
    expect(uprightRotation([595, 0, 0, 842, 0, 0], 90)).toBe(90)
    expect(uprightRotation([595, 0, 0, 842, 0, 0], 270)).toBe(270)
  })
  it('handles a picture drawn turned a quarter', () => {
    expect(uprightRotation([0, 842, -595, 0, 595, 0], 0)).toBe(270)
    expect(uprightRotation([0, -842, 595, 0, 0, 842], 0)).toBe(90)
  })
})

describe('encodeGrayPng', () => {
  it('writes a valid PNG whose pixels round-trip', () => {
    const png = Buffer.from(encodeGrayPng(3, 2, Uint8Array.from([0, 50, 100, 150, 200, 255])))
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(png.readUInt32BE(16)).toBe(3)
    expect(png.readUInt32BE(20)).toBe(2)
    expect(png[24]).toBe(8)
    expect(png[25]).toBe(0)
    const idatLen = png.readUInt32BE(33)
    expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT')
    const raw = inflateSync(png.subarray(41, 41 + idatLen))
    expect(Array.from(raw)).toEqual([0, 0, 50, 100, 0, 150, 200, 255])
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND')
  })
  it('rejects a pixel buffer of the wrong size', () => {
    expect(() => encodeGrayPng(2, 2, new Uint8Array(3))).toThrow()
  })
})
