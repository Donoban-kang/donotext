import type { DonotextApi } from '../shared/ipc'
import type { MockController } from './api/mockApi'

declare global {
  interface Window {
    api: DonotextApi
    /** Present only in browser mode (mock API). */
    __mock?: MockController
    __DONOTEXT_SEED__?: Record<string, string>
  }
}

export {}
