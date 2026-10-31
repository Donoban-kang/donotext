import { buildExportHtml } from '../editor/exportHtml'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { useWorkspace } from '../store/workspace'
import { useDialogs, useToasts } from '../store/ui'
import { createCommands, type Commands } from './commands'

let instance: Commands | undefined

/** Application-wide commands wired to the real stores and dialogs. Created lazily so `window.api` exists. */
export function getCommands(): Commands {
  instance ??= createCommands({
    api: window.api,
    documents: useDocuments,
    layout: useLayout,
    confirmUnsaved: (name) => useDialogs.getState().ask(name),
    notify: (toast) => useToasts.getState().push(toast),
    onFileOpened: (path) => useWorkspace.getState().addRecent(path),
    buildExport: buildExportHtml
  })
  return instance
}
