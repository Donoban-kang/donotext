import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDropped } from '../../src/main/services/dropService'
import { FsService } from '../../src/main/services/fsService'

let dir: string
let fs: FsService
let granted: string[]
const grant = async (p: string): Promise<void> => {
  granted.push(p)
  fs.grant(p)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-drop-'))
  fs = new FsService({ maxBytes: 1024, hardMaxBytes: 4096 })
  granted = []
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('openDropped', () => {
  it('opens a markdown file and a json file, granting only what was dropped', async () => {
    const md = join(dir, '메모.md')
    const json = join(dir, 'data.json')
    await writeFile(md, '# 제목\n')
    await writeFile(json, '{"a":1}\n')
    const out = await openDropped([md, json], fs, grant)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ kind: 'file', result: { path: md, text: '# 제목\n', kind: 'markdown' } })
    expect(out[1]).toMatchObject({ kind: 'file', result: { path: json, kind: 'sourceOnly' } })
    expect(granted).toEqual([md, json])
  })

  it('opens a dropped folder as a workspace root', async () => {
    const sub = join(dir, 'notes')
    await mkdir(sub)
    expect(await openDropped([sub], fs, grant)).toEqual([{ kind: 'folder', root: sub }])
    expect(granted).toEqual([sub])
  })

  it('refuses binary files without granting or reading them', async () => {
    const bin = join(dir, 'pic.png')
    await writeFile(bin, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01]))
    expect(await openDropped([bin], fs, grant)).toEqual([{ kind: 'rejected', name: 'pic.png', reason: 'binary' }])
    expect(granted).toEqual([])
  })

  it('refuses files above the hard size limit and reports a missing path as unreadable', async () => {
    const big = join(dir, 'big.txt')
    await writeFile(big, 'x'.repeat(5000))
    const out = await openDropped([big, join(dir, 'nope.txt')], fs, grant)
    expect(out[0]).toEqual({ kind: 'rejected', name: 'big.txt', reason: 'tooLarge' })
    expect(out[1]).toEqual({ kind: 'rejected', name: 'nope.txt', reason: 'unreadable' })
  })

  it('opens a file above the soft limit as source-only with a warning', async () => {
    const f = join(dir, 'long.md')
    await writeFile(f, 'y'.repeat(2000))
    const [r] = await openDropped([f], fs, grant)
    expect(r).toMatchObject({ kind: 'file', result: { kind: 'sourceOnly', warning: 'tooLarge' } })
  })

  it('ignores relative paths, non-strings and anything beyond 50 items; rejects a non-array', async () => {
    expect(await openDropped(['relative/a.md', 5, null, ''], fs, grant)).toEqual([])
    await expect(openDropped('nope', fs, grant)).rejects.toThrow()
    const many = Array.from({ length: 80 }, (_, i) => join(dir, `missing-${i}.txt`))
    expect(await openDropped(many, fs, grant)).toHaveLength(50)
  })

  it('accepts UTF-16 text and CP949 Korean text, which contain bytes that look binary', async () => {
    const u16 = join(dir, 'eula.txt')
    const kr = join(dir, 'korean.txt')
    await writeFile(u16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('License terms\r\n한글\r\n', 'utf16le')]))
    await writeFile(kr, Buffer.from([0xbe, 0xc8, 0xb3, 0xe7, 0x0d, 0x0a]))
    const out = await openDropped([u16, kr], fs, grant)
    expect(out[0]).toMatchObject({ kind: 'file', result: { text: 'License terms\n한글\n', encoding: 'utf-16le', readOnly: false } })
    expect(out[1]).toMatchObject({ kind: 'file', result: { text: '안녕\n', encoding: 'cp949', readOnly: false } })
  })

  it('an empty file is an ordinary text file', async () => {
    const f = join(dir, 'empty.txt')
    await writeFile(f, '')
    expect((await openDropped([f], fs, grant))[0]).toMatchObject({ kind: 'file', result: { text: '' } })
  })
})
