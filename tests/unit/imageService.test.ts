import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FsService } from '../../src/main/services/fsService'
import { ImageService } from '../../src/main/services/imageService'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
let dir: string
let fsvc: FsService
let images: ImageService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-img-'))
  fsvc = new FsService()
  images = new ImageService(fsvc)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('ImageService.save', () => {
  it('writes into an assets folder next to the document and returns a relative path', async () => {
    fsvc.grant(dir)
    const rel = await images.save(join(dir, 'note.md'), PNG, 'png')
    expect(rel).toMatch(/^assets\/img-[a-z0-9-]+\.png$/)
    expect(new Uint8Array(await readFile(join(dir, rel)))).toEqual(PNG)
  })
  it('works in folders with Korean names and spaces', async () => {
    const sub = join(dir, '한글 폴더')
    await mkdir(sub)
    fsvc.grant(dir)
    const rel = await images.save(join(sub, '메모.md'), PNG, 'PNG')
    expect((await stat(join(sub, rel))).isFile()).toBe(true)
  })
  it('creates a new file name for every paste', async () => {
    fsvc.grant(dir)
    const a = await images.save(join(dir, 'n.md'), PNG, 'png')
    const b = await images.save(join(dir, 'n.md'), PNG, 'png')
    expect(a).not.toBe(b)
  })
  it('refuses an untitled document (no folder to save next to)', async () => {
    await expect(images.save(null, PNG, 'png')).rejects.toThrow()
  })
  it('refuses a document outside the folders the user has opened', async () => {
    await expect(images.save(join(dir, 'n.md'), PNG, 'png')).rejects.toThrow()
    await expect(stat(join(dir, 'assets'))).rejects.toThrow()
  })
  it.each(['exe', 'svg', '../x', ''])('refuses extension %j', async (ext) => {
    fsvc.grant(dir)
    await expect(images.save(join(dir, 'n.md'), PNG, ext)).rejects.toThrow()
  })
  it('refuses data that is not really the claimed image type', async () => {
    fsvc.grant(dir)
    await expect(images.save(join(dir, 'n.md'), new TextEncoder().encode('<script>x</script>'), 'png')).rejects.toThrow()
    await expect(images.save(join(dir, 'n.md'), new Uint8Array(), 'png')).rejects.toThrow()
  })
  it('refuses oversized images', async () => {
    fsvc.grant(dir)
    const big = new Uint8Array(21 * 1024 * 1024)
    big.set(PNG)
    await expect(images.save(join(dir, 'n.md'), big, 'png')).rejects.toThrow()
  })
})
