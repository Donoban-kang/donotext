import { Extension } from '@tiptap/core'
import { FORMAT_KEYS, type FormatId } from './format'

/** Bold, italic and underline already have TipTap shortcuts with the same keys. */
const NATIVE = new Set<FormatId>(['bold', 'italic', 'underline'])

/**
 * The editor's format shortcuts (strike-through, highlight, code, math, link, image, clear). It also
 * swallows TipTap's own strike-through chord, Mod-Shift-s, which belongs to "save as".
 */
export const FormatKeys = Extension.create<{ onRun: (id: FormatId) => void }>({
  name: 'formatKeys',
  priority: 1000,
  addOptions() {
    return { onRun: () => undefined }
  },
  addKeyboardShortcuts() {
    const keys: Record<string, () => boolean> = { 'Mod-Shift-s': () => true }
    for (const { key, id } of FORMAT_KEYS) {
      if (NATIVE.has(id)) continue
      keys[key] = () => {
        this.options.onRun(id)
        return true
      }
    }
    return keys
  }
})
