import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createMockApi } from './api/mockApi'
import { normalizeMarkdown } from './editor/markdown/codec'
import { flushAllEditors } from './editor/sync'
import { useDocuments } from './store/documents'
import { useLayout } from './store/layoutStore'

if (!window.api) {
  const mock = createMockApi(window.__DONOTEXT_SEED__)
  window.api = mock.api
  window.__mock = mock.controller
  window.__stores = { documents: useDocuments, layout: useLayout, flushEditors: flushAllEditors }
}

useDocuments.getState().setNormalizer(normalizeMarkdown)

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
