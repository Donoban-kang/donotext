import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FsService } from '../../src/main/services/fsService'
import { GrantStore } from '../../src/main/services/grantStore'
import { SessionService } from '../../src/main/services/sessionService'
import { SessionStore } from '../../src/main/services/sessionStore'
import type { SessionData } from '../../src/shared/session'

let dir: string
let data: string
let work: string

const leaf = { type: 'leaf' as const, id: 'leaf-1', tabs: [], active: 0 }
const session = (over: Partial<SessionData> = {}): SessionData => ({
  version: 1,
  layout: leaf,
  docs: [],
  folder: null,
  activeLeafId: 'leaf-1',
  recent: [],
  ...over
})
const make = () => {
  const fs = new FsService()
  const svc = new SessionService(new SessionStore(data), new GrantStore(data), fs)
  return { fs, svc }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-grants-'))
  data = join(dir, 'userData')
  work = join(dir, 'work')
  await mkdir(data)
  await mkdir(work)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GrantStore', () => {
  it('remembers recorded paths across instances, newest first without duplicates', async () => {
    const a = new GrantStore(data)
    await a.record('/a')
    await a.record('/b')
    await a.record('/a')
    expect(await new GrantStore(data).list()).toEqual(['/a', '/b'])
  })
  it('caps the list', async () => {
    const g = new GrantStore(data, 3)
    for (const p of ['/1', '/2', '/3', '/4']) await g.record(p)
    expect(await g.list()).toEqual(['/4', '/3', '/2'])
  })
  it('starts empty when the file is corrupt or holds the wrong types', async () => {
    await writeFile(join(data, 'grants.json'), '{ nope')
    expect(await new GrantStore(data).list()).toEqual([])
    await writeFile(join(data, 'grants.json'), JSON.stringify({ version: 1, paths: ['/ok', 5, null, {}] }))
    expect(await new GrantStore(data).list()).toEqual(['/ok'])
  })
})

describe('SessionService', () => {
  it('restores access to locations the user approved earlier', async () => {
    const first = make()
    await first.svc.grant(work)
    const second = make()
    expect(second.fs.isAllowed(join(work, 'a.md'))).toBe(false)
    await second.svc.load()
    expect(second.fs.isAllowed(join(work, 'a.md'))).toBe(true)
  })

  it('never grants paths that only appear in the session file (a renderer can write anything there)', async () => {
    const { fs, svc } = make()
    await svc.save(session({ folder: '/', docs: [{ id: 'd', path: '/etc/hosts' }], recent: ['/etc'] }))
    const loaded = await svc.load()
    expect(loaded?.folder).toBe('/') // the data is returned, the permission is not
    expect(fs.isAllowed('/etc/hosts')).toBe(false)
    expect(fs.isAllowed('/')).toBe(false)
    expect(fs.isAllowed('/etc/passwd')).toBe(false)
  })

  it('also lets a remembered document show images from its own assets folder', async () => {
    const doc = join(work, 'note.md')
    await writeFile(doc, '# x')
    const first = make()
    await first.svc.grant(doc)
    const second = make()
    await second.svc.load()
    expect(second.fs.isAllowed(doc)).toBe(true)
    expect(second.fs.isAllowed(join(work, 'assets', 'a.png'))).toBe(true)
    expect(second.fs.isAllowed(join(work, 'other.md'))).toBe(false)
  })

  it('does not widen access to a remembered folder\'s sibling assets', async () => {
    const folder = join(dir, 'opened')
    await mkdir(folder)
    const first = make()
    await first.svc.grant(folder)
    const second = make()
    await second.svc.load()
    expect(second.fs.isAllowed(join(dir, 'assets', 'a.png'))).toBe(false)
  })

  it('works with nothing remembered and with no session file', async () => {
    const { svc } = make()
    expect(await svc.load()).toBeNull()
  })
})
