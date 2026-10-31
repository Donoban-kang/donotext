import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionStore } from '../../src/main/services/sessionStore'
import type { SessionData } from '../../src/shared/session'

let dir: string
let store: SessionStore
const session: SessionData = {
  version: 1,
  layout: { type: 'leaf', id: 'leaf-1', tabs: [{ kind: 'doc', docId: 'doc-1', view: 'wysiwyg' }], active: 0 },
  docs: [{ id: 'doc-1', path: '/w/한글 문서.md' }],
  folder: '/w',
  activeLeafId: 'leaf-1',
  recent: ['/w/한글 문서.md']
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-session-'))
  store = new SessionStore(dir)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('session.json', () => {
  it('returns null when no session was saved yet', async () => {
    expect(await store.load()).toBeNull()
  })
  it('round-trips a saved session', async () => {
    await store.save(session)
    expect(await store.load()).toEqual(session)
  })
  it('returns null (fresh start) when the file is corrupt JSON', async () => {
    await writeFile(join(dir, 'session.json'), '{ not json')
    expect(await store.load()).toBeNull()
  })
  it('returns null for an unknown schema version or a non-object', async () => {
    await writeFile(join(dir, 'session.json'), JSON.stringify({ version: 2 }))
    expect(await store.load()).toBeNull()
    await writeFile(join(dir, 'session.json'), '[1,2]')
    expect(await store.load()).toBeNull()
  })
  it('overwrites atomically, leaving no temp files behind', async () => {
    await store.save(session)
    await store.save({ ...session, recent: [] })
    expect((await store.load())?.recent).toEqual([])
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})

describe('backups', () => {
  it('writes, reads and clears backups by document id', async () => {
    await store.writeBackup('doc-1', '미저장 내용')
    await store.writeBackup('doc-2', 'two')
    expect(await store.readBackups()).toEqual({ 'doc-1': '미저장 내용', 'doc-2': 'two' })
    await store.clearBackup('doc-1')
    expect(await store.readBackups()).toEqual({ 'doc-2': 'two' })
  })
  it('clearing a missing backup is not an error', async () => {
    await expect(store.clearBackup('doc-9')).resolves.toBeUndefined()
  })
  it('rejects document ids that could escape the backup folder', async () => {
    for (const bad of ['../evil', 'a/b', '', '..', 'x'.repeat(65), 'a\0b']) {
      await expect(store.writeBackup(bad, 'x')).rejects.toThrow()
      await expect(store.clearBackup(bad)).rejects.toThrow()
    }
    await mkdir(join(dir, 'backup'), { recursive: true })
    await expect(readFile(join(dir, 'evil'))).rejects.toThrow()
  })
  it('ignores unrelated files in the backup folder', async () => {
    await store.writeBackup('doc-1', 'x')
    await writeFile(join(dir, 'backup', 'notes.txt'), 'stray')
    expect(Object.keys(await store.readBackups())).toEqual(['doc-1'])
  })
})
