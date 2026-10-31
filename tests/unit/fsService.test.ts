import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FsService } from '../../src/main/services/fsService'

let dir: string
let fsvc: FsService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-fs-'))
  fsvc = new FsService()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('access control', () => {
  it('rejects writes to paths that were never granted', async () => {
    await expect(fsvc.writeFile(join(dir, 'a.md'), 'x', 'lf', false)).rejects.toThrow()
  })
  it('rejects ".." escapes out of a granted folder', async () => {
    const granted = join(dir, 'granted')
    await mkdir(granted)
    fsvc.grant(granted)
    await expect(fsvc.writeFile(join(granted, '..', 'outside.md'), 'x', 'lf', false)).rejects.toThrow()
    await expect(stat(join(dir, 'outside.md'))).rejects.toThrow()
  })
  it('allows files inside a granted folder, including Korean/space names', async () => {
    const sub = join(dir, '한글 폴더')
    await mkdir(sub)
    fsvc.grant(dir)
    const p = join(sub, '메모 1.md')
    await fsvc.writeFile(p, '# 안녕\n', 'lf', false)
    const r = await fsvc.readFile(p)
    expect(r.text).toBe('# 안녕\n')
    expect(r.kind).toBe('markdown')
  })
  it('does not treat a sibling with the same prefix as inside a granted folder', async () => {
    const granted = join(dir, 'notes')
    await mkdir(granted)
    fsvc.grant(granted)
    expect(fsvc.isAllowed(join(dir, 'notes-evil', 'a.md'))).toBe(false)
  })
})

describe('readFile / writeFile', () => {
  it('reads an empty file as markdown with empty text', async () => {
    const p = join(dir, 'empty.md')
    await writeFile(p, '')
    fsvc.grant(p)
    const r = await fsvc.readFile(p)
    expect(r.text).toBe('')
    expect(r.kind).toBe('markdown')
    expect(r.readOnly).toBe(false)
  })
  it('writes back CRLF+BOM files byte-identically', async () => {
    const p = join(dir, 'crlf.md')
    const original = Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('a\r\nb\r\n')])
    await writeFile(p, original)
    fsvc.grant(p)
    const r = await fsvc.readFile(p)
    expect(r.eol).toBe('crlf')
    expect(r.bom).toBe(true)
    await fsvc.writeFile(p, r.text, r.eol, r.bom)
    expect((await readFile(p)).equals(original)).toBe(true)
  })
  it('flags files over maxBytes as tooLarge and sourceOnly', async () => {
    const small = new FsService({ maxBytes: 10 })
    const p = join(dir, 'big.md')
    await writeFile(p, 'x'.repeat(11))
    small.grant(p)
    const r = await small.readFile(p)
    expect(r.warning).toBe('tooLarge')
    expect(r.kind).toBe('sourceOnly')
  })
  it('flags invalid UTF-8 as notUtf8 and readOnly', async () => {
    const p = join(dir, 'bad.md')
    await writeFile(p, Buffer.from([0xff, 0xfe, 0x41]))
    fsvc.grant(p)
    const r = await fsvc.readFile(p)
    expect(r.warning).toBe('notUtf8')
    expect(r.readOnly).toBe(true)
  })
  it('classifies non-markdown extensions as sourceOnly', async () => {
    const p = join(dir, 'data.json')
    await writeFile(p, '{}')
    fsvc.grant(p)
    expect((await fsvc.readFile(p)).kind).toBe('sourceOnly')
  })
})

describe('directory operations', () => {
  it('lists folders first, then names', async () => {
    await mkdir(join(dir, 'zdir'))
    await writeFile(join(dir, 'b.md'), '')
    await writeFile(join(dir, 'a.md'), '')
    await writeFile(join(dir, 'c.json'), '{}')
    fsvc.grant(dir)
    const names = (await fsvc.readDir(dir)).map((e) => e.name)
    expect(names).toEqual(['zdir', 'a.md', 'b.md', 'c.json'])
  })
  it('creates, renames and deletes entries', async () => {
    fsvc.grant(dir)
    const created = await fsvc.createEntry(dir, '새 파일.md', false)
    expect((await stat(created)).isFile()).toBe(true)
    const renamed = await fsvc.renameEntry(created, 'renamed.md')
    expect(renamed).toBe(join(dir, 'renamed.md'))
    await fsvc.deleteEntry(renamed)
    await expect(stat(renamed)).rejects.toThrow()
  })
  it('rejects entry names containing separators or "..", and existing targets', async () => {
    fsvc.grant(dir)
    await expect(fsvc.createEntry(dir, '../x.md', false)).rejects.toThrow()
    await expect(fsvc.createEntry(dir, 'a/b.md', false)).rejects.toThrow()
    await expect(fsvc.createEntry(dir, '..', true)).rejects.toThrow()
    await fsvc.createEntry(dir, 'dup.md', false)
    await expect(fsvc.createEntry(dir, 'dup.md', false)).rejects.toThrow()
  })
  it('uses the injected trash function when provided', async () => {
    const trash = vi.fn(async () => {})
    const svc = new FsService({ trash })
    svc.grant(dir)
    const p = join(dir, 'x.md')
    await writeFile(p, '')
    await svc.deleteEntry(p)
    expect(trash).toHaveBeenCalledWith(p)
  })
})
