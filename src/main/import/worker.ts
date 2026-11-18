// Worker thread entry: converts the document it is given and posts the result back. Running here keeps the
// app responsive and lets the main thread stop a conversion that takes too long or uses too much memory.

import { parentPort, workerData } from 'node:worker_threads'
import { JobFailure, runConversion, type ImportJob, type JobFailureCode } from './convert'
import type { Converted } from './types'

export type WorkerMessage =
  | { ok: true; result: Converted }
  | { ok: false; code: JobFailureCode }
  | { progress: { done: number; total: number } }

async function main(): Promise<void> {
  let message: WorkerMessage
  try {
    const result = await runConversion(workerData as ImportJob, (done, total) => parentPort?.postMessage({ progress: { done, total } } satisfies WorkerMessage))
    message = { ok: true, result }
  } catch (e) {
    // set DONOTEXT_DEBUG=1 to see why a conversion failed (the user only sees a short message)
    if (process.env['DONOTEXT_DEBUG']) console.error('[import worker]', e)
    message = { ok: false, code: e instanceof JobFailure ? e.code : 'unreadable' }
  }
  parentPort?.postMessage(message)
}

void main()
