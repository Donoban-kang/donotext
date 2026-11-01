import { useEffect } from 'react'
import { useSettings, type FontFamily } from '../store/settings'

const SANS = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, "Segoe UI", sans-serif'
const SERIF = '"Noto Serif KR", "Nanum Myeongjo", AppleMyungjo, Batang, "Times New Roman", serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "D2Coding", "Noto Sans Mono CJK KR", monospace'

/** A font name typed by the user, made safe to put inside a CSS font-family list. */
export function cssFontName(name: string): string {
  return name.replace(/["'\;{}<>()\n\r]/g, '').trim()
}

export const FONT_STACKS: Record<Exclude<FontFamily, 'custom'>, string> = { default: SANS, serif: SERIF, mono: MONO }

/** The text font (WYSIWYG) and the source-mode font for the chosen family. */
export function resolveFonts(family: FontFamily, custom: string): { editor: string; source: string } {
  const name = cssFontName(custom)
  if (family === 'custom' && name) return { editor: `"${name}", ${SANS}`, source: `"${name}", ${MONO}` }
  if (family === 'custom') return { editor: SANS, source: MONO }
  return { editor: FONT_STACKS[family], source: MONO }
}

const WIDTHS = { narrow: '680px', wide: '820px', full: 'none' } as const

/** Writes the appearance settings onto <html> as CSS variables, so every editor follows them at once. */
export function SettingsController(): null {
  const fontFamily = useSettings((s) => s.fontFamily)
  const customFont = useSettings((s) => s.customFont)
  const fontSize = useSettings((s) => s.fontSize)
  const lineHeight = useSettings((s) => s.lineHeight)
  const editorWidth = useSettings((s) => s.editorWidth)
  const wordWrap = useSettings((s) => s.wordWrap)

  useEffect(() => {
    const root = document.documentElement
    const fonts = resolveFonts(fontFamily, customFont)
    root.style.setProperty('--dn-editor-font', fonts.editor)
    root.style.setProperty('--dn-source-font', fonts.source)
    root.style.setProperty('--dn-editor-size', `${fontSize}px`)
    root.style.setProperty('--dn-editor-line', String(lineHeight))
    root.style.setProperty('--dn-editor-width', WIDTHS[editorWidth])
    root.dataset.wrap = wordWrap ? 'on' : 'off'
  }, [fontFamily, customFont, fontSize, lineHeight, editorWidth, wordWrap])

  return null
}
