// Worker thread entry: converts the document it is given and posts the result back. Running here keeps the
// app responsive and lets the main thread stop a conversion that takes too long or uses too much memory.

import { parentPort, workerData } from 'node:worker_threads'
import { JobFailure, runConversion, type ImportJob, type JobFailureCode } from './convert'
import type { Converted } from './types'

export type WorkerMessage = { ok: true; result: Converted } | { ok: false; code: JobFailureCode }

async function main(): Promise<void> {
  let message: WorkerMessage
  try {
    message = { ok: true, result: await runConversion(workerData as ImportJob) }
  } catch (e) {
    message = { ok: false, code: e instanceof JobFailure ? e.code : 'unreadable' }
  }
  parentPort?.postMessage(message)
}

void main()
