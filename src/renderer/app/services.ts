import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { useSettings } from '../store/settings'
import { useToasts } from '../store/ui'
import { useWorkspace } from '../store/workspace'
import { getCommands } from './appCommands'
import { createAutoSaver } from './autosave'
import { startBackups } from './backup'
import { startExternalWatcher } from './externalWatcher'
import { restoreSession, startSessionPersistence } from './session'

/** Restores the previous workspace, then starts persistence, backups, auto-save and file watching. */
export async function startAppServices(): Promise<void> {
  const api = window.api
  const stores = { documents: useDocuments, layout: useLayout, workspace: useWorkspace }

  try {
    await restoreSession({ api, ...stores, notify: (t) => useToasts.getState().push(t) })
  } catch {
    // A broken session must never keep the app from starting.
  }

  startSessionPersistence({ api, ...stores })
  startBackups({ api, documents: useDocuments })
  startExternalWatcher({ api, documents: useDocuments })

  const saver = createAutoSaver({
    documents: useDocuments,
    save: (id) => getCommands().saveDoc(id),
    enabled: () => useSettings.getState().autoSave
  })
  useSettings.subscribe((s, prev) => {
    if (s.autoSave !== prev.autoSave) saver.recheck()
  })

  let watched = ''
  const syncWatch = (): void => {
    const paths = new Set<string>()
    for (const d of Object.values(useDocuments.getState().docs)) if (d.path) paths.add(d.path)
    const root = useWorkspace.getState().root
    if (root) paths.add(root)
    const sorted = [...paths].sort()
    const key = JSON.stringify(sorted)
    if (key === watched) return
    watched = key
    api.watch(sorted)
  }
  useDocuments.subscribe(syncWatch)
  useWorkspace.subscribe(syncWatch)
  syncWatch()
}
