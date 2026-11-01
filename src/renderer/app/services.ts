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
    await restoreSession({ api, ...stores, notify: (t) => useToasts.getState().push(t), reopen: useSettings.getState().restoreOnStart })
  } catch {
    // A broken session must never keep the app from starting.
  }

  // Files handed to us by the OS (double-click, command line, second launch).
  const openFromOs = (paths: string[]): void => paths.forEach((p) => void getCommands().openPath(p))
  try {
    openFromOs(await api.takeOpenPaths())
  } catch {
    // not fatal
  }
  api.onOpenPaths(openFromOs)

  // Closing the window: offer to save modified documents first.
  let asking = false
  api.onCloseRequested(() => {
    if (asking) return
    asking = true
    void getCommands()
      .confirmQuit()
      .then((ok) => api.respondToClose(ok))
      .catch(() => api.respondToClose(false))
      .finally(() => {
        asking = false
      })
  })

  startSessionPersistence({ api, ...stores })
  startBackups({ api, documents: useDocuments })
  startExternalWatcher({ api, documents: useDocuments })

  const saver = createAutoSaver({
    documents: useDocuments,
    save: (id) => getCommands().saveDoc(id),
    enabled: () => useSettings.getState().autoSave,
    delayMs: () => useSettings.getState().autoSaveDelay * 1000
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
