import { describe, expect, it, vi } from 'vitest'
import { createMockApi } from '../../src/renderer/api/mockApi'
import { createCommands } from '../../src/renderer/app/commands'
import { allLeaves } from '../../src/renderer/layout/tree'
import { createDocumentsStore } from '../../src/renderer/store/documents'
import { createLayoutStore } from '../../src/renderer/store/layoutStore'
import type { ImportOutcome } from '../../src/shared/importTypes'

function setup() {
  const { api, controller } = createMockApi({})
  const documents = createDocumentsStore()
  const layout = createLayoutStore()
  const notify = vi.fn()
  const setBusy = vi.fn()
  const commands = createCommands({ api, documents, layout, confirmUnsaved: async () => 'cancel', notify, setBusy, flush: () => undefined })
  return { api, controller, documents, layout, commands, notify, setBusy }
}

const good = (over: Partial<Extract<ImportOutcome, { ok: true }>> = {}): ImportOutcome => ({
  ok: true,
  format: 'docx',
  baseName: '보고서',
  markdown: '# 제목\n\n본문\n',
  warnings: [],
  stats: { chars: 1234, headings: 1, tables: 2, listItems: 0 },
  ...over
})

const docsOf = (c: ReturnType<typeof setup>) => Object.values(c.documents.getState().docs)
const tabCount = (c: ReturnType<typeof setup>): number => allLeaves(c.layout.getState().root).flatMap((l) => l.tabs).length

describe('importDocument (toolbar button)', () => {
  it('opens the converted text as a new unsaved document named after the source file', async () => {
    const c = setup()
    c.controller.queueImport(good())
    await c.commands.importDocument()
    const [doc] = docsOf(c)
    expect(doc).toMatchObject({ name: '보고서.md', path: null, text: '# 제목\n\n본문\n' })
    expect(c.documents.getState().isDirty(doc!.id)).toBe(true) // closing asks whether to save: nothing is written for the user
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info', message: expect.stringMatching(/보고서.*제목 1 · 표 2 · 1,234자/) }))
  })

  it('does nothing when the dialog is cancelled', async () => {
    const c = setup()
    await c.commands.importDocument()
    expect(docsOf(c)).toHaveLength(0)
    expect(c.notify).not.toHaveBeenCalled()
  })

  it('shows each warning as its own notice, with counts', async () => {
    const c = setup()
    c.controller.queueImport(good({ warnings: [{ code: 'imagesSkipped', count: 3 }, { code: 'rowsTruncated', count: 25 }, { code: 'garbled', count: 9 }] }))
    await c.commands.importDocument()
    const messages = c.notify.mock.calls.map(([t]) => t.message as string)
    expect(messages.some((m) => m.includes('그림 3개'))).toBe(true)
    expect(messages.some((m) => m.includes('25행'))).toBe(true)
    expect(messages.some((m) => m.includes('깨져'))).toBe(true)
  })

  it('adds the "compare with the original" reminder for PDFs only', async () => {
    const pdf = setup()
    pdf.controller.queueImport(good({ format: 'pdf' }))
    await pdf.commands.importDocument()
    expect(pdf.notify.mock.calls.some(([t]) => (t.message as string).includes('원본과 한 번 비교'))).toBe(true)
    const word = setup()
    word.controller.queueImport(good())
    await word.commands.importDocument()
    expect(word.notify.mock.calls.some(([t]) => (t.message as string).includes('원본과 한 번 비교'))).toBe(false)
  })

  it('explains a scanned PDF and opens nothing', async () => {
    const c = setup()
    c.controller.queueImport(good({ markdown: '', warnings: [{ code: 'noText' }], baseName: '스캔본' }))
    await c.commands.importDocument()
    expect(docsOf(c)).toHaveLength(0)
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('글자를 찾지 못했어요') }))
  })

  it('names the file in each failure message', async () => {
    const c = setup()
    c.controller.queueImport({ ok: false, code: 'encrypted', name: '비밀.pdf' })
    await c.commands.importDocument()
    expect(docsOf(c)).toHaveLength(0)
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('"비밀.pdf"') }))
  })
})

describe('dropping a document on the window', () => {
  it('converts a dropped PDF and replaces an untouched empty document', async () => {
    const c = setup()
    c.commands.newUntitled()
    c.controller.queueDrop(['/w/공문.pdf'])
    c.controller.queueImport(good({ format: 'pdf', baseName: '공문' }))
    await c.commands.openDropped()
    expect(c.controller.importCalls).toEqual(['/w/공문.pdf'])
    expect(tabCount(c)).toBe(1)
    expect(docsOf(c).map((d) => d.name)).toEqual(['공문.md'])
  })

  it('opens text files and converted documents from one drop', async () => {
    const { api, controller } = createMockApi({ '/w/a.md': 'a\n' })
    const documents = createDocumentsStore()
    const layout = createLayoutStore()
    const commands = createCommands({ api, documents, layout, confirmUnsaved: async () => 'cancel', notify: vi.fn(), flush: () => undefined })
    controller.queueDrop(['/w/a.md', '/w/표.xlsx'])
    controller.queueImport(good({ format: 'xlsx', baseName: '표' }))
    await commands.openDropped()
    expect(Object.values(documents.getState().docs).map((d) => d.name).sort()).toEqual(['a.md', '표.md'])
  })

  it('reports a failed conversion and still opens the other files', async () => {
    const c = setup()
    c.controller.queueDrop(['/w/깨짐.docx'])
    c.controller.queueImport({ ok: false, code: 'unreadable', name: '깨짐.docx' })
    await c.commands.openDropped()
    expect(docsOf(c)).toHaveLength(0)
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('깨짐.docx') }))
  })
})

describe('several files and scanned pages', () => {
  it('opens one new document per file chosen in the dialog', async () => {
    const c = setup()
    c.controller.queueImport([good({ baseName: '하나' }), good({ baseName: '둘', format: 'pdf' }), { ok: false, code: 'unreadable', name: '셋.pdf' }])
    await c.commands.importDocument()
    expect(docsOf(c).map((d) => d.name).sort()).toEqual(['둘.md', '하나.md'])
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('셋.pdf') }))
  })

  it('shows the page being read while converting, and removes the card when done', async () => {
    const c = setup()
    const real = c.api.importFile
    c.api.importFile = async (path, labels) => {
      c.controller.emitImportProgress({ name: '스캔.pdf', done: 2, total: 5 })
      return real(path, labels)
    }
    c.controller.queueDrop(['/w/스캔.pdf'])
    c.controller.queueImport(good({ format: 'pdf', baseName: '스캔' }))
    await c.commands.openDropped()
    expect(c.setBusy).toHaveBeenCalledWith('"스캔.pdf" 글자 인식 중… 2/5쪽')
    expect(c.setBusy).toHaveBeenLastCalledWith(null)
  })

  it('ignores progress that arrives when nothing is being converted', () => {
    const c = setup()
    c.controller.emitImportProgress({ name: 'x.pdf', done: 1, total: 2 })
    expect(c.setBusy).not.toHaveBeenCalled()
  })

  it('explains text recognition in the notices: pages read, doubtful lines highlighted', async () => {
    const c = setup()
    c.controller.queueImport(good({ format: 'pdf', warnings: [{ code: 'ocrUsed', count: 3 }, { code: 'ocrUncertain', count: 12 }, { code: 'ocrFailed', count: 1 }] }))
    await c.commands.importDocument()
    const messages = c.notify.mock.calls.map(([t]) => t.message as string)
    expect(messages.some((m) => m.includes('3쪽') && m.includes('글자 인식'))).toBe(true)
    expect(messages.some((m) => m.includes('12개') && m.includes('형광펜'))).toBe(true)
    expect(messages.some((m) => m.includes('1쪽') && m.includes('읽지 못해'))).toBe(true)
  })

  it('says so when text recognition is not available', async () => {
    const c = setup()
    c.controller.queueImport({ ok: false, code: 'ocrUnavailable', name: '사진.png' })
    await c.commands.importDocument()
    expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', message: expect.stringContaining('글자 인식(OCR)을 쓸 수 없어서') }))
  })
})
