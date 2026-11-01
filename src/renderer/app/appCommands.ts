import { buildExportHtml } from '../editor/exportHtml'
import { useDocuments } from '../store/documents'
import { useLayout } from '../store/layoutStore'
import { useWorkspace } from '../store/workspace'
import { useDialogs, useToasts } from '../store/ui'
import { t } from './i18n'
import { createCommands, type Commands } from './commands'

let instance: Commands | undefined

/** Application-wide commands wired to the real stores and dialogs. Created lazily so `window.api` exists. */
export function getCommands(): Commands {
  instance ??= createCommands({
    api: window.api,
    documents: useDocuments,
    layout: useLayout,
    confirmUnsaved: (name) => useDialogs.getState().ask(name),
    confirmForkClose: (name, canReplace) => useDialogs.getState().askForkClose(name, canReplace),
    confirmOverwrite: (name) =>
      useDialogs.getState().askConfirm({ title: t('forkOverwriteTitle', { name }), body: t('forkOverwriteBody'), okLabel: t('forkOverwriteOk') }),
    notify: (toast) => useToasts.getState().push(toast),
    onFileOpened: (path) => useWorkspace.getState().addRecent(path),
    openFolder: (root) => useWorkspace.getState().setRoot(root),
    buildExport: buildExportHtml
  })
  return instance
}
