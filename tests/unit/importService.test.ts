import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportJobError, ImportService, ImportTimeoutError, type JobRunner } from '../../src/main/services/importService'
import { IMPORT_MAX_BYTES } from '../../src/shared/importTypes'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'donotext-import-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const labels = { slide: 'Slide', notes: 'Notes' }
const converted = { markdown: '# 안녕\n', warnings: [], stats: { chars: 5, headings: 1, tables: 0, listItems: 0 } }

function service(run: JobRunner, allowed: (p: string) => boolean = () => true) {
  return new ImportService({ run, pdfjsDir: '/pdfjs', isAllowed: allowed, timeoutMs: 1234 })
}

describe('ImportService.importFile', () => {
  it('reads the file, runs the job with its bytes, labels and time limit, and names the result after the file', async () => {
    const file = join(dir, '공문 1.pdf')
    await writeFile(file, Buffer.from([37, 80, 68, 70]))
    const run = vi.fn<JobRunner>().mockResolvedValue(converted)
    const out = await service(run).importFile(file, labels)
    expect(out).toMatchObject({ ok: true, format: 'pdf', baseName: '공문 1', markdown: '# 안녕\n' })
    expect(run).toHaveBeenCalledOnce()
    const [job, timeout] = run.mock.calls[0]!
    expect(Array.from(job.bytes)).toEqual([37, 80, 68, 70])
    expect(job).toMatchObject({ format: 'pdf', labels, pdfjsDir: '/pdfjs' })
    expect(timeout).toBe(1234)
  })

  it('refuses a path the user did not choose or drop, without reading it', async () => {
    const file = join(dir, 'a.pdf')
    await writeFile(file, 'x')
    const run = vi.fn<JobRunner>()
    expect(await service(run, () => false).importFile(file, labels)).toEqual({ ok: false, code: 'notAllowed', name: 'a.pdf' })
    expect(run).not.toHaveBeenCalled()
  })

  it('refuses other formats, missing files and folders', async () => {
    const run = vi.fn<JobRunner>().mockResolvedValue(converted)
    await writeFile(join(dir, 'a.exe'), 'x')
    expect(await service(run).importFile(join(dir, 'a.exe'), labels)).toMatchObject({ ok: false, code: 'unsupported' })
    expect(await service(run).importFile(join(dir, 'none.pdf'), labels)).toMatchObject({ ok: false, code: 'unreadable' })
    expect(await service(run).importFile(dir, labels)).toMatchObject({ ok: false, code: 'unsupported' })
    expect(run).not.toHaveBeenCalled()
  })

  it('refuses a file above the size limit without reading it', async () => {
    const file = join(dir, 'big.docx')
    await writeFile(file, 'x')
    await truncate(file, IMPORT_MAX_BYTES + 1) // sparse: costs no disk space
    const run = vi.fn<JobRunner>()
    expect(await service(run).importFile(file, labels)).toMatchObject({ ok: false, code: 'tooLarge' })
    expect(run).not.toHaveBeenCalled()
  })

  it('maps a stopped, failed or crashed job to a failure outcome and never throws', async () => {
    const file = join(dir, 'a.docx')
    await writeFile(file, 'x')
    expect(await service(() => Promise.reject(new ImportTimeoutError('t'))).importFile(file, labels)).toMatchObject({ ok: false, code: 'timeout' })
    expect(await service(() => Promise.reject(new ImportJobError('encrypted'))).importFile(file, labels)).toMatchObject({ ok: false, code: 'encrypted' })
    expect(await service(() => Promise.reject(new Error('boom'))).importFile(file, labels)).toMatchObject({ ok: false, code: 'failed', name: 'a.docx' })
  })
})
