import { describe, expect, it } from 'vitest'
import { buildMenuTemplate } from '../../src/main/menu'

type Item = { label?: string; role?: string; accelerator?: string; registerAccelerator?: boolean; submenu?: Item[]; type?: string }
const flat = (items: Item[]): Item[] => items.flatMap((i) => [i, ...(i.submenu ? flat(i.submenu) : [])])

describe('buildMenuTemplate', () => {
  it('has no native menu on Windows/Linux (the app owns its toolbar and shortcuts)', () => {
    expect(buildMenuTemplate({ isMac: false, isDev: false, appName: 'donotext' })).toBeNull()
  })

  it('gives macOS an Edit menu so copy, cut, paste and select-all work', () => {
    const roles = flat(buildMenuTemplate({ isMac: true, isDev: false, appName: 'donotext' }) as Item[]).map((i) => i.role)
    for (const r of ['cut', 'copy', 'paste', 'selectAll', 'quit']) expect(roles).toContain(r)
  })

  it('leaves undo/redo to the editors by not registering their accelerators', () => {
    const items = flat(buildMenuTemplate({ isMac: true, isDev: false, appName: 'donotext' }) as Item[])
    for (const role of ['undo', 'redo']) {
      expect(items.find((i) => i.role === role)?.registerAccelerator).toBe(false)
    }
  })

  it('does not claim shortcuts the renderer owns (open, save, new, close tab, find)', () => {
    const accelerators = flat(buildMenuTemplate({ isMac: true, isDev: true, appName: 'donotext' }) as Item[])
      .map((i) => i.accelerator)
      .filter(Boolean)
    for (const a of ['CmdOrCtrl+W', 'CmdOrCtrl+N', 'CmdOrCtrl+O', 'CmdOrCtrl+S', 'CmdOrCtrl+F', 'CmdOrCtrl+H']) {
      expect(accelerators).not.toContain(a)
    }
    // no role may smuggle one of those in either: closing a window would swallow "close tab"
    const roles = flat(buildMenuTemplate({ isMac: true, isDev: true, appName: 'donotext' }) as Item[]).map((i) => i.role)
    expect(roles).not.toContain('close')
    expect(roles).not.toContain('hide') // Cmd+H is "replace" in the editor
  })

  it('offers developer tools only in development', () => {
    const prod = flat(buildMenuTemplate({ isMac: true, isDev: false, appName: 'donotext' }) as Item[]).map((i) => i.role)
    const dev = flat(buildMenuTemplate({ isMac: true, isDev: true, appName: 'donotext' }) as Item[]).map((i) => i.role)
    expect(prod).not.toContain('toggleDevTools')
    expect(prod).not.toContain('reload')
    expect(dev).toContain('toggleDevTools')
  })
})
