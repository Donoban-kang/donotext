// Runs a conversion job in a worker thread that can be stopped: when it shows no progress for too long, when
// it takes too long overall, on a crash, or when the worker runs out of memory. The worker is created by
// `makeWorker` so tests can supply their own.

import type { Worker } from 'node:worker_threads'
import { IMPORT_MAX_TOTAL_MS } from '../../shared/importTypes'
import { ImportJobError, ImportTimeoutError, type JobRunner } from '../services/importService'
import type { ImportJob } from './convert'
import type { WorkerMessage } from './worker'

export function hostWorker(makeWorker: (job: ImportJob) => Worker, maxTotalMs = IMPORT_MAX_TOTAL_MS): JobRunner {
  return (job, timeoutMs, onProgress) =>
    new Promise((resolve, reject) => {
      const worker = makeWorker(job)
      let settled = false
      let idle: ReturnType<typeof setTimeout>
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(idle)
        clearTimeout(overall)
        void worker.terminate()
        fn()
      }
      const stop = (): void => finish(() => reject(new ImportTimeoutError('timeout')))
      const arm = (): void => {
        clearTimeout(idle)
        idle = setTimeout(stop, timeoutMs)
      }
      const overall = setTimeout(stop, maxTotalMs)
      arm()
      worker.on('message', (m: WorkerMessage) => {
        if ('progress' in m) {
          arm() // a page was finished: the job is alive, give it more time
          onProgress?.(m.progress.done, m.progress.total)
        } else finish(() => (m.ok ? resolve(m.result) : reject(new ImportJobError(m.code))))
      })
      // out of memory (ERR_WORKER_OUT_OF_MEMORY) or a crash inside the worker
      worker.once('error', () => finish(() => reject(new ImportJobError('tooLarge'))))
      worker.once('exit', (code) => finish(() => reject(new ImportJobError(code === 0 ? 'unreadable' : 'tooLarge'))))
    })
}
