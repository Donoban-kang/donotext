/// <reference types="vite/client" />
import type { DonotextApi } from '../shared/ipc'
import type { MockController } from './api/mockApi'

declare global {
  interface Window {
    api: DonotextApi
    /** Present only in browser mode (mock API). */
    __mock?: MockController
    __DONOTEXT_SEED__?: Record<string, string>
    /** Present only in browser mode; lets e2e tests inspect state. */
    __stores?: { documents: typeof import('./store/documents').useDocuments; flushEditors: () => void }
  }
}

export {}
