import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WatchService } from '../../src/main/services/watchService'
import type { FileChange } from '../../src/shared/ipc'

let dir: string
let svc: WatchService
let events: FileChange[]

const waitFor = async (pred: () => boolean, ms = 4000): Promise<void> => {
  const end = Date.now() + ms
  while (!pred()) {
    if (Date.now() > end) throw new Error('timed out waiting for watcher event')
    await new Promise((r) => setTimeout(r, 25))
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-watch-'))
  events = []
  svc = new WatchService((e) => events.push(e), { stabilityMs: 50 })
})
afterEach(async () => {
  await svc.close()
  await rm(dir, { recursive: true, force: true })
})

describe('WatchService', () => {
  it('reports changes and deletions of a watched file', async () => {
    const f = join(dir, '한글 메모.md')
    await writeFile(f, 'one')
    svc.setPaths([f])
    await new Promise((r) => setTimeout(r, 300))
    await writeFile(f, 'two')
    await waitFor(() => events.some((e) => e.kind === 'change' && e.path === f))
    await unlink(f)
    await waitFor(() => events.some((e) => e.kind === 'unlink' && e.path === f))
  })
  it('reports files added inside a watched folder', async () => {
    svc.setPaths([dir])
    await new Promise((r) => setTimeout(r, 300))
    const f = join(dir, 'new.md')
    await writeFile(f, 'x')
    await waitFor(() => events.some((e) => e.kind === 'add' && e.path === f))
  })
  it('stops reporting paths that were removed from the watch list', async () => {
    const a = join(dir, 'a.md')
    const b = join(dir, 'b.md')
    await writeFile(a, '1')
    await writeFile(b, '1')
    svc.setPaths([a, b])
    await new Promise((r) => setTimeout(r, 300))
    svc.setPaths([b])
    await new Promise((r) => setTimeout(r, 300))
    await writeFile(a, '2')
    await writeFile(b, '2')
    await waitFor(() => events.some((e) => e.path === b))
    await new Promise((r) => setTimeout(r, 400))
    expect(events.some((e) => e.path === a)).toBe(false)
  })
})
