import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FsService } from '../../src/main/services/fsService'
import { resolveImageRequest } from '../../src/main/services/imageProtocol'
import { toImageUrl } from '../../src/shared/images'

let dir: string
let fsvc: FsService
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-proto-'))
  fsvc = new FsService()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('resolveImageRequest', () => {
  it('resolves an image inside an opened folder, including Korean and spaces', async () => {
    const sub = join(dir, '한글 폴더', 'assets')
    await mkdir(sub, { recursive: true })
    const file = join(sub, 'a b.png')
    await writeFile(file, 'x')
    fsvc.grant(dir)
    expect(resolveImageRequest(toImageUrl(file), fsvc)).toEqual({ path: file, mime: 'image/png' })
  })
  it('refuses files outside the opened folders', async () => {
    const file = join(dir, 'a.png')
    await writeFile(file, 'x')
    expect(resolveImageRequest(toImageUrl(file), fsvc)).toBeNull()
  })
  it('refuses non-image extensions even inside an opened folder', async () => {
    const secret = join(dir, 'secret.txt')
    await writeFile(secret, 'x')
    fsvc.grant(dir)
    expect(resolveImageRequest(toImageUrl(secret), fsvc)).toBeNull()
    expect(resolveImageRequest(toImageUrl(join(dir, 'x.svg')), fsvc)).toBeNull()
  })
  it('refuses ".." tricks that leave the opened folder', async () => {
    const inner = join(dir, 'opened')
    await mkdir(inner)
    await writeFile(join(dir, 'outside.png'), 'x')
    fsvc.grant(inner)
    expect(resolveImageRequest(`donotext-file://local/${encodeURIComponent(join(inner, '..', 'outside.png'))}`, fsvc)).toBeNull()
  })
  it('refuses other hosts, other schemes and garbage', () => {
    fsvc.grant(dir)
    expect(resolveImageRequest('donotext-file://evil/%2Ftmp%2Fa.png', fsvc)).toBeNull()
    expect(resolveImageRequest('https://example.com/a.png', fsvc)).toBeNull()
    expect(resolveImageRequest('not a url', fsvc)).toBeNull()
    expect(resolveImageRequest('donotext-file://local/%E0%A4%A', fsvc)).toBeNull()
  })
})
