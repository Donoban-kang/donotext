// Runs a conversion job in a worker thread that can be stopped: on time-out, on a crash, or when the
// worker runs out of memory. The worker is created by `makeWorker` so tests can supply their own.

import type { Worker } from 'node:worker_threads'
import { ImportJobError, ImportTimeoutError, type JobRunner } from '../services/importService'
import type { ImportJob } from './convert'
import type { WorkerMessage } from './worker'

export function hostWorker(makeWorker: (job: ImportJob) => Worker): JobRunner {
  return (job, timeoutMs) =>
    new Promise((resolve, reject) => {
      const worker = makeWorker(job)
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        void worker.terminate()
        fn()
      }
      const timer = setTimeout(() => finish(() => reject(new ImportTimeoutError('timeout'))), timeoutMs)
      worker.once('message', (m: WorkerMessage) => finish(() => (m.ok ? resolve(m.result) : reject(new ImportJobError(m.code)))))
      // out of memory (ERR_WORKER_OUT_OF_MEMORY) or a crash inside the worker
      worker.once('error', () => finish(() => reject(new ImportJobError('tooLarge'))))
      worker.once('exit', (code) => finish(() => reject(new ImportJobError(code === 0 ? 'unreadable' : 'tooLarge'))))
    })
}
