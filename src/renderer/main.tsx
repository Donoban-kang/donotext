import type React from 'react'
import { createRoot } from 'react-dom/client'

function App(): React.ReactElement {
  return (
    <main data-testid="workspace">
      <h1>donotext</h1>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
