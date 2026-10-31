import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExportService } from '../../src/main/services/exportService'
import { FsService } from '../../src/main/services/fsService'
import { ImageService } from '../../src/main/services/imageService'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
let dir: string
let fsvc: FsService
let target: string | null
const showSaveDialog = vi.fn(async (_o: { defaultName: string; ext: 'html' | 'pdf' }) => target)
const renderPdf = vi.fn(async (_html: string) => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))
let svc: ExportService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-export-'))
  fsvc = new FsService()
  fsvc.grant(dir)
  svc = new ExportService(fsvc, new ImageService(fsvc), { showSaveDialog, renderPdf })
  target = join(dir, 'out.html')
  showSaveDialog.mockClear()
  renderPdf.mockClear()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('exportHtml', () => {
  it('asks for a file name based on the document and writes the html', async () => {
    const path = await svc.exportHtml('<p>hi</p>', '메모', join(dir, '메모.md'))
    expect(showSaveDialog).toHaveBeenCalledWith({ defaultName: '메모.html', ext: 'html' })
    expect(path).toBe(target)
    expect(await readFile(target!, 'utf8')).toBe('<p>hi</p>')
  })
  it('returns null and writes nothing when the dialog is cancelled', async () => {
    target = null
    expect(await svc.exportHtml('<p>x</p>', 'a', null)).toBeNull()
    await expect(stat(join(dir, 'out.html'))).rejects.toThrow()
  })
  it('adds the extension when the user typed a bare name', async () => {
    target = join(dir, 'plain')
    expect(await svc.exportHtml('<p>x</p>', 'a', null)).toBe(join(dir, 'plain.html'))
    expect((await stat(join(dir, 'plain.html'))).isFile()).toBe(true)
  })
  it('never overwrites the source document', async () => {
    const doc = join(dir, 'note.md')
    await writeFile(doc, '# keep me')
    target = doc
    await expect(svc.exportHtml('<p>x</p>', 'note', doc)).rejects.toThrow()
    expect(await readFile(doc, 'utf8')).toBe('# keep me')
  })
  it('sanitizes the suggested file name', async () => {
    await svc.exportHtml('<p>x</p>', '../../evil/a:b?.md', null)
    const arg = showSaveDialog.mock.calls[0][0]
    expect(arg.defaultName).not.toMatch(/[\\/:*?"<>|]/)
    expect(arg.defaultName.endsWith('.html')).toBe(true)
  })
  it('embeds local images next to the document as data URIs', async () => {
    await mkdir(join(dir, 'assets'))
    await writeFile(join(dir, 'assets', 'a.png'), PNG)
    await svc.exportHtml('<img src="assets/a.png">', 'd', join(dir, 'd.md'))
    expect(await readFile(target!, 'utf8')).toMatch(/<img src="data:image\/png;base64,/)
  })
  it('does not embed files outside the opened locations', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'donotext-outside-'))
    await writeFile(join(outsideDir, 'secret.png'), PNG)
    const html = `<img src="${join(outsideDir, 'secret.png')}">`
    await svc.exportHtml(html, 'd', join(dir, 'd.md'))
    expect(await readFile(target!, 'utf8')).toBe(html)
    await rm(outsideDir, { recursive: true, force: true })
  })
})

describe('exportPdf', () => {
  it('renders the html to PDF bytes and writes them', async () => {
    target = join(dir, 'out.pdf')
    const path = await svc.exportPdf('<p>x</p>', 'a', null)
    expect(showSaveDialog).toHaveBeenCalledWith({ defaultName: 'a.pdf', ext: 'pdf' })
    expect(renderPdf).toHaveBeenCalledWith('<p>x</p>')
    expect(path).toBe(target)
    expect(new Uint8Array(await readFile(target)).slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
  })
  it('does not render anything when the dialog is cancelled', async () => {
    target = null
    expect(await svc.exportPdf('<p>x</p>', 'a', null)).toBeNull()
    expect(renderPdf).not.toHaveBeenCalled()
  })
  it('does not overwrite the source document', async () => {
    const doc = join(dir, 'x.pdf')
    await writeFile(doc, 'orig')
    target = doc
    await expect(svc.exportPdf('<p>x</p>', 'x', doc)).rejects.toThrow()
    expect(await readFile(doc, 'utf8')).toBe('orig')
  })
})
