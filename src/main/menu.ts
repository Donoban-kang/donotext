import type { MenuItemConstructorOptions } from 'electron'

export interface MenuOptions {
  isMac: boolean
  isDev: boolean
  appName: string
}

/**
 * macOS needs an application menu for Cmd+C/V/X/A to reach the page; Windows and Linux do not
 * (Chromium handles those keys itself), so they get no native menu bar.
 *
 * The renderer owns open/save/new/close-tab/find/replace, so none of those accelerators appear here
 * and no `close` or `hide` role is used (Cmd+W and Cmd+H would shadow them). Undo/redo keep their
 * keys for the editors' own history.
 */
export function buildMenuTemplate({ isMac, isDev, appName }: MenuOptions): MenuItemConstructorOptions[] | null {
  if (!isMac) return null
  const view: MenuItemConstructorOptions[] = [
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  ]
  if (isDev) view.unshift({ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' })
  return [
    { label: appName, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', registerAccelerator: false },
        { role: 'redo', registerAccelerator: false },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    { label: 'View', submenu: view },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] }
  ]
}
