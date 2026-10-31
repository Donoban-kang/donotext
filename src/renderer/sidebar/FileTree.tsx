import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DirEntry } from '../../shared/fsTypes'
import { getCommands } from '../app/appCommands'
import { t } from '../app/i18n'
import { useDocuments } from '../store/documents'
import { useSettings } from '../store/settings'
import { useWorkspace } from '../store/workspace'
import { useDialogs, useToasts } from '../store/ui'
import { filterEntries, validateEntryName } from './treeUtils'

type Editing = { mode: 'create'; parent: string; isDir: boolean } | { mode: 'rename'; path: string; name: string }

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const fail = (e: unknown): void => useToasts.getState().push({ kind: 'error', message: t('fsFailed', { reason: errMsg(e) }) })
const parentOf = (p: string): string => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')))

interface NameInputProps {
  initial: string
  error: string | null
  onCommit(value: string): void
  onCancel(): void
}

/** Module-level so React keeps the same element (and focus) across FileTree re-renders. */
function NameInput({ initial, error, onCommit, onCancel }: NameInputProps): React.ReactElement {
  return (
    <span className="dn-tree-edit">
      <input
        autoFocus
        aria-label={t('rename')}
        defaultValue={initial}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(e.currentTarget.value)
          else if (e.key === 'Escape') onCancel()
        }}
        onBlur={onCancel}
      />
      {error && (
        <span role="alert" className="dn-tree-error">
          {error}
        </span>
      )}
    </span>
  )
}

export function FileTree(): React.ReactElement {
  const showAll = useSettings((s) => s.showAllFiles)
  const setShowAll = useSettings((s) => s.setShowAllFiles)
  const root = useWorkspace((s) => s.root)
  const setRoot = useWorkspace((s) => s.setRoot)
  const [children, setChildren] = useState<Record<string, DirEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Editing | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const load = useCallback(async (dir: string): Promise<void> => {
    try {
      const entries = await window.api.readDir(dir)
      setChildren((c) => ({ ...c, [dir]: entries }))
    } catch (e) {
      fail(e)
    }
  }, [])

  const childrenRef = useRef(children)
  childrenRef.current = children

  // A folder restored from the previous session has no cached listing yet.
  useEffect(() => {
    if (root && !childrenRef.current[root]) {
      void load(root)
      setExpanded(new Set([root]))
    }
  }, [root, load])

  // Files created, deleted or moved outside the app: refresh the folders we have listed.
  useEffect(
    () =>
      window.api.onFileChanged((ev) => {
        if (ev.kind === 'change') return
        const parent = parentOf(ev.path)
        if (childrenRef.current[parent]) void load(parent)
      }),
    [load]
  )

  const openFolder = async (): Promise<void> => {
    try {
      const res = await window.api.openFolderDialog()
      if (!res) return
      setRoot(res.root)
      setChildren({ [res.root]: res.entries })
      setExpanded(new Set([res.root]))
      window.api.watch([res.root])
    } catch (e) {
      fail(e)
    }
  }

  const toggle = async (dir: string): Promise<void> => {
    const next = new Set(expanded)
    if (next.has(dir)) next.delete(dir)
    else {
      next.add(dir)
      if (!children[dir]) await load(dir)
    }
    setExpanded(next)
  }

  const startCreate = (isDir: boolean, parent = root): void => {
    if (!parent) return
    setNameError(null)
    setEditing({ mode: 'create', parent, isDir })
    if (!expanded.has(parent)) setExpanded(new Set(expanded).add(parent))
  }

  const commit = async (value: string): Promise<void> => {
    if (!editing) return
    const problem = validateEntryName(value)
    if (problem) {
      setNameError(t(problem))
      return
    }
    const name = value.trim()
    try {
      if (editing.mode === 'create') {
        const path = await window.api.createEntry(editing.parent, name, editing.isDir)
        await load(editing.parent)
        if (!editing.isDir) void getCommands().openPath(path)
      } else if (name !== editing.name) {
        const next = await window.api.renameEntry(editing.path, name)
        useDocuments.getState().renamePath(editing.path, next)
        await load(parentOf(editing.path))
      }
      setEditing(null)
      setNameError(null)
    } catch (e) {
      fail(e)
    }
  }

  const remove = async (entry: DirEntry): Promise<void> => {
    const ok = await useDialogs.getState().askConfirm({
      title: t('confirmDeleteTitle', { name: entry.name }),
      body: t('confirmDeleteBody'),
      okLabel: t('delete')
    })
    if (!ok) return
    try {
      await window.api.deleteEntry(entry.path)
      for (const d of Object.values(useDocuments.getState().docs)) {
        if (d.path === entry.path || d.path?.startsWith(`${entry.path}/`)) useDocuments.getState().setExternal(d.id, 'deleted')
      }
      await load(parentOf(entry.path))
    } catch (e) {
      fail(e)
    }
  }

  const nameInput = (initial: string): React.ReactElement => (
    <NameInput
      initial={initial}
      error={nameError}
      onCommit={(v) => void commit(v)}
      onCancel={() => {
        setEditing(null)
        setNameError(null)
      }}
    />
  )

  const renderDir = (dir: string, depth: number): React.ReactNode => {
    const entries = filterEntries(children[dir] ?? [], showAll)
    return (
      <>
        {editing?.mode === 'create' && editing.parent === dir && (
          <li className="dn-tree-row" style={{ paddingLeft: 8 + depth * 14 }}>
            {nameInput('')}
          </li>
        )}
        {entries.map((entry) => {
          const isOpen = expanded.has(entry.path)
          const renaming = editing?.mode === 'rename' && editing.path === entry.path
          return (
            <li key={entry.path} role="treeitem" aria-expanded={entry.isDir ? isOpen : undefined}>
              <div className="dn-tree-row" style={{ paddingLeft: 8 + depth * 14 }}>
                {renaming ? (
                  nameInput(entry.name)
                ) : (
                  <button
                    className="dn-tree-name"
                    onClick={() => (entry.isDir ? void toggle(entry.path) : void getCommands().openPath(entry.path))}
                  >
                    {entry.isDir ? (isOpen ? '▾ ' : '▸ ') : ''}
                    {entry.name}
                  </button>
                )}
                {!renaming && (
                  <span className="dn-tree-actions">
                    {entry.isDir && (
                      <button aria-label={`${t('newFile')} ${entry.name}`} onClick={() => startCreate(false, entry.path)}>
                        ＋
                      </button>
                    )}
                    <button
                      aria-label={`${t('rename')} ${entry.name}`}
                      onClick={() => {
                        setNameError(null)
                        setEditing({ mode: 'rename', path: entry.path, name: entry.name })
                      }}
                    >
                      ✎
                    </button>
                    <button aria-label={`${t('delete')} ${entry.name}`} onClick={() => void remove(entry)}>
                      🗑
                    </button>
                  </span>
                )}
              </div>
              {entry.isDir && isOpen && <ul role="group">{renderDir(entry.path, depth + 1)}</ul>}
            </li>
          )
        })}
      </>
    )
  }

  return (
    <div className="dn-filetree">
      <div className="dn-tree-toolbar">
        <button onClick={() => void openFolder()}>{t('openFolder')}</button>
        <button disabled={!root} onClick={() => startCreate(false)}>
          {t('newFile')}
        </button>
        <button disabled={!root} onClick={() => startCreate(true)}>
          {t('newFolder')}
        </button>
      </div>
      <label className="dn-tree-showall">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {t('showAllFiles')}
      </label>
      {root ? (
        <ul role="tree" className="dn-tree">
          {renderDir(root, 0)}
        </ul>
      ) : (
        <p className="dn-sidebar-empty">{t('noFolder')}</p>
      )}
    </div>
  )
}
