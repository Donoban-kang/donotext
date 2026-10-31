import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { startAppServices } from './app/services'
import { createMockApi } from './api/mockApi'
import { normalizeMarkdown } from './editor/markdown/codec'
import { flushAllEditors } from './editor/sync'
import { useDocuments } from './store/documents'
import { useLayout } from './store/layoutStore'
import { useSettings } from './store/settings'
import { useWorkspace } from './store/workspace'

async function boot(): Promise<void> {
  if (!window.api) {
    const mock = createMockApi(window.__DONOTEXT_SEED__, {
      session: window.__DONOTEXT_SESSION__,
      backups: window.__DONOTEXT_BACKUPS__
    })
    window.api = mock.api
    window.__mock = mock.controller
    window.__stores = {
      documents: useDocuments,
      layout: useLayout,
      workspace: useWorkspace,
      settings: useSettings,
      flushEditors: flushAllEditors
    }
  }
  useDocuments.getState().setNormalizer(normalizeMarkdown)
  await startAppServices()
  createRoot(document.getElementById('root') as HTMLElement).render(<App />)
}

void boot()
