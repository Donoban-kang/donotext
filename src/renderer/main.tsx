import type React from 'react'
import { createRoot } from 'react-dom/client'
import { createMockApi } from './api/mockApi'

if (!window.api) {
  const mock = createMockApi(window.__DONOTEXT_SEED__)
  window.api = mock.api
  window.__mock = mock.controller
}

function App(): React.ReactElement {
  return (
    <main data-testid="workspace">
      <h1>donotext</h1>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
