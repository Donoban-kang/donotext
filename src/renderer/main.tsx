import type React from 'react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createMockApi } from './api/mockApi'
import { WysiwygEditor } from './editor/WysiwygEditor'
import { normalizeMarkdown } from './editor/markdown/codec'
import { flushAllEditors } from './editor/sync'
import { useDocuments } from './store/documents'

if (!window.api) {
  const mock = createMockApi(window.__DONOTEXT_SEED__)
  window.api = mock.api
  window.__mock = mock.controller
  window.__stores = { documents: useDocuments, flushEditors: flushAllEditors }
}

useDocuments.getState().setNormalizer(normalizeMarkdown)

// Temporary single-editor harness; replaced by the real app shell in plan Task 10.
function App(): React.ReactElement {
  const [docId, setDocId] = useState<string | null>(null)
  const dirty = useDocuments((s) => (docId ? s.isDirty(docId) : false))
  const open = async (): Promise<void> => {
    const files = await window.api.openFileDialog()
    if (files[0]) setDocId(useDocuments.getState().open(files[0]))
  }
  return (
    <main data-testid="workspace">
      <h1>donotext</h1>
      <button onClick={() => void open()}>열기</button>
      <span data-testid="dirty">{dirty ? '수정됨' : ''}</span>
      {docId && <WysiwygEditor docId={docId} paneId="pane-1" />}
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
