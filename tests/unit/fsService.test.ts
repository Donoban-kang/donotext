import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmod, lstat, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
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

describe('saving preserves the file as the user knows it', () => {
  it('writes through a symbolic link instead of replacing the link', async () => {
    fsvc.grant(dir)
    const real = join(dir, 'real.md')
    const link = join(dir, 'link.md')
    await writeFile(real, 'old')
    await symlink(real, link)
    await fsvc.writeFile(link, 'new', 'lf', false)
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    expect(await readFile(real, 'utf8')).toBe('new')
  })
  it('keeps the file permissions', async () => {
    fsvc.grant(dir)
    const p = join(dir, 'private.md')
    await writeFile(p, 'old')
    await chmod(p, 0o640)
    await fsvc.writeFile(p, 'new', 'lf', false)
    expect((await stat(p)).mode & 0o777).toBe(0o640)
    const bin = join(dir, 'doc.pdf')
    await writeFile(bin, 'old')
    await chmod(bin, 0o600)
    await fsvc.writeBinary(bin, new Uint8Array([1, 2, 3]))
    expect((await stat(bin)).mode & 0o777).toBe(0o600)
  })
  it('still creates new files', async () => {
    fsvc.grant(dir)
    await fsvc.writeFile(join(dir, 'fresh.md'), 'x', 'lf', false)
    expect(await readFile(join(dir, 'fresh.md'), 'utf8')).toBe('x')
  })
})

describe('very large files', () => {
  it('refuses to read a file above the hard cap instead of loading it', async () => {
    const small = new FsService({ hardMaxBytes: 20 })
    const p = join(dir, 'huge.log')
    await writeFile(p, 'x'.repeat(21))
    small.grant(p)
    await expect(small.readFile(p)).rejects.toThrow(/too large/i)
  })
  it('still opens files between the warning size and the hard cap as source-only', async () => {
    const svc = new FsService({ maxBytes: 10, hardMaxBytes: 100 })
    const p = join(dir, 'big.md')
    await writeFile(p, 'x'.repeat(50))
    svc.grant(p)
    const r = await svc.readFile(p)
    expect(r.warning).toBe('tooLarge')
    expect(r.kind).toBe('sourceOnly')
  })
})

