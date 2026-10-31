import type { DonotextApi } from '../../shared/ipc'
import type { SessionData, SessionDoc } from '../../shared/session'
import { allLeaves, parseLayout, remapDocIds } from '../layout/tree'
import type { createDocumentsStore } from '../store/documents'
import type { createLayoutStore } from '../store/layoutStore'
import type { createWorkspaceStore } from '../store/workspace'
import { createBackupWriter } from './backup'
import { t } from './i18n'
import type { Toast } from './commands'

export interface SessionStores {
  documents: ReturnType<typeof createDocumentsStore>
  layout: ReturnType<typeof createLayoutStore>
  workspace: ReturnType<typeof createWorkspaceStore>
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validates untrusted session JSON. Returns null when it cannot be used at all. */
export function parseSession(json: unknown): SessionData | null {
  if (!isObj(json) || json.version !== 1 || !Array.isArray(json.docs)) return null
  const docs: SessionDoc[] = []
  for (const d of json.docs) {
    if (!isObj(d) || typeof d.id !== 'string' || !(typeof d.path === 'string' || d.path === null)) return null
    docs.push({ id: d.id, path: d.path })
  }
  const recent = Array.isArray(json.recent) ? json.recent.filter((p): p is string => typeof p === 'string').slice(0, 10) : []
  return {
    version: 1,
    layout: parseLayout(json.layout),
    docs,
    folder: typeof json.folder === 'string' ? json.folder : null,
    activeLeafId: typeof json.activeLeafId === 'string' ? json.activeLeafId : '',
    recent
  }
}

export function captureSession({ documents, layout, workspace }: SessionStores): SessionData {
  return {
    version: 1,
    layout: layout.getState().root,
    docs: Object.values(documents.getState().docs).map((d) => ({ id: d.id, path: d.path })),
    folder: workspace.getState().root,
    activeLeafId: layout.getState().activeLeafId,
    recent: workspace.getState().recent
  }
}

export interface RestoreDeps extends SessionStores {
  api: DonotextApi
  notify(toast: Toast): void
}

/** Rebuilds the previous workspace. Returns false when there was nothing usable to restore. */
export async function restoreSession(deps: RestoreDeps): Promise<boolean> {
  const { api, documents, layout, workspace, notify } = deps
  let session: SessionData | null
  try {
    session = parseSession(await api.loadSession())
  } catch {
    return false
  }
  if (!session) return false

  let backups: Record<string, string> = {}
  try {
    backups = await api.loadBackups()
  } catch {
    // restore without recovery data
  }

  const idMap = new Map<string, string>()
  const consumed = new Set<string>() // backups whose content now lives in an open document
  let recovered = 0
  const missing: string[] = []

  for (const entry of session.docs) {
    const backup = backups[entry.id]
    let id: string | null = null
    if (entry.path) {
      try {
        id = documents.getState().open(await api.readFile(entry.path))
      } catch {
        // The file is gone (moved, renamed, unmounted drive). Unsaved edits must not be lost with it.
        if (backup !== undefined && backup !== '') {
          id = documents.getState().openUntitled()
          missing.push(entry.path)
        }
      }
    } else if (backup) {
      id = documents.getState().openUntitled() // an empty untitled document is not worth bringing back
    }
    if (id === null) continue
    idMap.set(entry.id, id)
    if (backup !== undefined) {
      consumed.add(entry.id)
      if (backup !== documents.getState().docs[id].text) {
        documents.getState().setText(id, backup, 'restore')
        recovered++
      }
    }
  }

  // Backups of documents that never made it into the saved session are recovered too.
  const known = new Set(session.docs.map((d) => d.id))
  const orphans: string[] = []
  for (const [oldId, text] of Object.entries(backups)) {
    if (known.has(oldId) || !text) continue
    const id = documents.getState().openUntitled()
    documents.getState().setText(id, text, 'restore')
    orphans.push(id)
    consumed.add(oldId)
    recovered++
  }

  layout.getState().setRoot(remapDocIds(session.layout, idMap))
  if (allLeaves(layout.getState().root).some((l) => l.id === session!.activeLeafId)) {
    layout.getState().focusLeaf(session.activeLeafId)
  }
  for (const id of orphans) layout.getState().openTabInActive({ kind: 'doc', docId: id, view: 'wysiwyg' })
  workspace.getState().setRoot(session.folder)
  workspace.getState().setRecent(session.recent)

  // Persist the recovered edits under their new ids first, only then drop the backups that were used.
  // Backups that could not be placed anywhere stay on disk for the next start.
  await createBackupWriter({ api, documents }).tick()
  await Promise.all([...consumed].map((id) => api.clearBackup(id).catch(() => undefined)))

  if (recovered > 0) notify({ kind: 'info', message: t('sessionRecovered', { count: String(recovered) }) })
  for (const path of missing) notify({ kind: 'warning', message: t('sessionFileMissing', { path }) })
  return true
}

/** Saves the session shortly after the workspace changes. Call only after restoreSession finished. */
export function startSessionPersistence(deps: SessionStores & { api: DonotextApi }, delayMs = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = (): void => {
    timer = undefined
    void deps.api.saveSession(captureSession(deps)).catch(() => undefined)
  }
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(save, delayMs)
  }
  const unsubs = [deps.documents.subscribe(schedule), deps.layout.subscribe(schedule), deps.workspace.subscribe(schedule)]
  const onHide = (): void => save()
  window.addEventListener('beforeunload', onHide)
  return () => {
    unsubs.forEach((u) => u())
    if (timer !== undefined) clearTimeout(timer)
    window.removeEventListener('beforeunload', onHide)
  }
}
