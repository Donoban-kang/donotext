import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'
import type { ImportJob } from '../../src/main/import/convert'
import { hostWorker } from '../../src/main/import/workerHost'
import { ImportJobError, ImportTimeoutError } from '../../src/main/services/importService'

const job: ImportJob = { format: 'docx', bytes: new Uint8Array([1]), labels: { slide: 's', notes: 'n' }, pdfjsDir: '/x' }
const run = (code: string, limits?: ConstructorParameters<typeof Worker>[1]) =>
  hostWorker((j) => new Worker(code, { eval: true, workerData: j, ...limits }))

describe('hostWorker (real worker threads)', () => {
  it('returns what the worker posts', async () => {
    const result = { markdown: 'ok\n', warnings: [], stats: { chars: 3, headings: 0, tables: 0, listItems: 0 } }
    const runner = run(`require('node:worker_threads').parentPort.postMessage({ ok: true, result: ${JSON.stringify(result)} })`)
    await expect(runner(job, 5000)).resolves.toEqual(result)
  })

  it('maps a failure code posted by the worker', async () => {
    const runner = run(`require('node:worker_threads').parentPort.postMessage({ ok: false, code: 'encrypted' })`)
    await expect(runner(job, 5000)).rejects.toMatchObject({ code: 'encrypted' })
  })

  it('stops a worker that never finishes once the time is up', async () => {
    const started = Date.now()
    await expect(run(`while (true) {}`)(job, 300)).rejects.toBeInstanceOf(ImportTimeoutError)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('reports a worker that runs out of memory as too large, without taking the process down', async () => {
    const runner = run(`const keep = []; while (true) keep.push(new Array(1e6).fill(Math.random()))`, { resourceLimits: { maxOldGenerationSizeMb: 64 } })
    await expect(runner(job, 20_000)).rejects.toMatchObject({ code: 'tooLarge' })
  }, 30_000)

  it('reports a crash and a worker that ends without an answer', async () => {
    await expect(run(`throw new Error('boom')`)(job, 5000)).rejects.toBeInstanceOf(ImportJobError)
    await expect(run(`/* does nothing, then exits */`)(job, 5000)).rejects.toMatchObject({ code: 'unreadable' })
  })
})
