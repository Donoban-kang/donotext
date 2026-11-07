// Starts the real conversion worker. Kept apart from workerHost so unit tests can use their own workers
// (the `?nodeWorker` import below only exists in the electron-vite build).

import ImportWorker from './worker?nodeWorker'
import { hostWorker } from './workerHost'

const MEMORY_LIMIT_MB = 1536

export const runInWorker = hostWorker((job) => ImportWorker({ workerData: job, resourceLimits: { maxOldGenerationSizeMb: MEMORY_LIMIT_MB } }))
