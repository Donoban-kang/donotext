import { describe, expect, it } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'

describe('createMockApi', () => {
  it('round-trips a written file through readFile', async () => {
    const { api } = createMockApi()
    await api.writeFile('/w/a.md', '# 제목\n', 'crlf', true)
    const r = await api.readFile('/w/a.md')
    expect(r.text).toBe('# 제목\n')
    expect(r.eol).toBe('crlf')
    expect(r.bom).toBe(true)
    expect(r.kind).toBe('markdown')
  })
  it('rejects reading a missing file', async () => {
    const { api } = createMockApi()
    await expect(api.readFile('/nope.md')).rejects.toThrow()
  })
  it('openExternal rejects non-http(s) URLs and accepts https', async () => {
    const { api } = createMockApi()
    await expect(api.openExternal('javascript:x')).rejects.toThrow()
    await expect(api.openExternal('file:///etc/passwd')).rejects.toThrow()
    await expect(api.openExternal('https://example.com')).resolves.toBeUndefined()
  })
  it('opens queued paths through openFileDialog', async () => {
    const { api, controller } = createMockApi({ '/w/a.md': 'hello' })
    controller.queueOpen(['/w/a.md'])
    const files = await api.openFileDialog()
    expect(files.map((f) => f.path)).toEqual(['/w/a.md'])
    expect(files[0].text).toBe('hello')
  })
  it('lists directory entries folders-first and supports create/rename/delete', async () => {
    const { api } = createMockApi({ '/w/b.md': '', '/w/sub/c.md': '' })
    const names = (await api.readDir('/w')).map((e) => e.name)
    expect(names).toEqual(['sub', 'b.md'])
    const p = await api.createEntry('/w', 'n.md', false)
    expect(p).toBe('/w/n.md')
    expect(await api.renameEntry(p, 'm.md')).toBe('/w/m.md')
    await api.deleteEntry('/w/m.md')
    await expect(api.readFile('/w/m.md')).rejects.toThrow()
  })
  it('saveImage rejects disallowed extensions and returns a relative assets path', async () => {
    const { api } = createMockApi()
    await expect(api.saveImage('/w/a.md', new Uint8Array([1]), 'exe')).rejects.toThrow()
    expect(await api.saveImage('/w/a.md', new Uint8Array([1]), 'png')).toMatch(/^assets\/img-.+\.png$/)
  })
  it('emits file change events to subscribers until unsubscribed', async () => {
    const { api, controller } = createMockApi()
    const seen: string[] = []
    const off = api.onFileChanged((e) => seen.push(`${e.kind}:${e.path}`))
    controller.emitChange({ path: '/w/a.md', kind: 'change' })
    off()
    controller.emitChange({ path: '/w/a.md', kind: 'unlink' })
    expect(seen).toEqual(['change:/w/a.md'])
  })
})
