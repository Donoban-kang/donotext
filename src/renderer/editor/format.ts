import type { MessageKey } from '../app/i18n'
import { useLayout } from '../store/layoutStore'

export type FormatId =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'superscript'
  | 'subscript'
  | 'highlight'
  | 'code'
  | 'math'
  | 'strike'
  | 'link'
  | 'image'
  | 'clear'

export interface FormatDef {
  id: FormatId
  label: MessageKey
  /** Shown in the menu. "Mod" is Ctrl on Windows/Linux and Cmd on macOS. */
  shortcut?: string
  /** Items with the same group number sit together; a divider separates groups. */
  group: number
}

export const FORMATS: FormatDef[] = [
  { id: 'bold', label: 'fmtBold', shortcut: 'Mod-b', group: 0 },
  { id: 'italic', label: 'fmtItalic', shortcut: 'Mod-i', group: 0 },
  { id: 'underline', label: 'fmtUnderline', shortcut: 'Mod-u', group: 0 },
  { id: 'superscript', label: 'fmtSuperscript', group: 1 },
  { id: 'subscript', label: 'fmtSubscript', group: 1 },
  { id: 'highlight', label: 'fmtHighlight', shortcut: 'Mod-Shift-h', group: 1 },
  { id: 'code', label: 'fmtCode', shortcut: 'Mod-`', group: 2 },
  { id: 'math', label: 'fmtMath', shortcut: 'Mod-Shift-m', group: 2 },
  { id: 'strike', label: 'fmtStrike', shortcut: 'Mod-d', group: 3 },
  { id: 'link', label: 'fmtLink', shortcut: 'Mod-l', group: 3 },
  { id: 'image', label: 'fmtImage', shortcut: 'Mod-Shift-i', group: 3 },
  { id: 'clear', label: 'fmtClear', shortcut: 'Mod-Shift-r', group: 4 }
]

/** Keys bound inside the editors (WYSIWYG and source), one per format that has a shortcut. */
export const FORMAT_KEYS: Array<{ key: string; id: FormatId }> = FORMATS.filter((f) => f.shortcut).map((f) => ({ key: f.shortcut as string, id: f.id }))

/** "Mod-Shift-h" -> "Ctrl+Shift+H" for display. */
export function shortcutLabel(shortcut: string): string {
  return shortcut
    .split('-')
    .map((p) => (p === 'Mod' ? 'Ctrl' : p.length === 1 ? p.toUpperCase() : p))
    .join('+')
}

export interface EditorHandle {
  run(id: FormatId): void
}

const handles = new Map<string, EditorHandle>()

/** Each open editor registers itself under its pane id so menu commands reach the focused pane. */
export function registerEditor(paneId: string, handle: EditorHandle): () => void {
  handles.set(paneId, handle)
  return () => {
    if (handles.get(paneId) === handle) handles.delete(paneId)
  }
}

/** Applies a format in the active pane's editor. Returns false when there is none (e.g. a comparison tab). */
export function runFormat(id: FormatId): boolean {
  const handle = handles.get(useLayout.getState().activeLeafId)
  if (!handle) return false
  handle.run(id)
  return true
}
