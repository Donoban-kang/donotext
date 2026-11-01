import { describe, expect, it } from 'vitest'
import { FORMATS, FORMAT_KEYS, shortcutLabel } from '../../src/renderer/editor/format'
import { clearFormatting, imageEdit, linkEdit, toggleWrap, WRAPPERS } from '../../src/renderer/editor/sourceFormat'

const apply = (doc: string, e: { from: number; to: number; insert: string }): string => doc.slice(0, e.from) + e.insert + doc.slice(e.to)

describe('toggleWrap', () => {
  it('wraps a selection and keeps it selected', () => {
    const e = toggleWrap('a word b', 2, 6, '**', '**')
    expect(apply('a word b', e)).toBe('a **word** b')
    expect([e.anchor, e.head]).toEqual([4, 8])
  })
  it('puts the caret between the markers when nothing is selected', () => {
    const e = toggleWrap('ab', 1, 1, '<u>', '</u>')
    expect(apply('ab', e)).toBe('a<u></u>b')
    expect(e.anchor).toBe(4)
  })
  it('unwraps when the markers sit just outside the selection', () => {
    const e = toggleWrap('a **word** b', 4, 8, '**', '**')
    expect(apply('a **word** b', e)).toBe('a word b')
  })
  it('unwraps when the selection includes the markers', () => {
    const e = toggleWrap('a **word** b', 2, 10, '**', '**')
    expect(apply('a **word** b', e)).toBe('a word b')
  })
  it('works at the very start of the text', () => {
    expect(apply('word', toggleWrap('word', 0, 4, '==', '=='))).toBe('==word==')
    expect(apply('==word==', toggleWrap('==word==', 2, 6, '==', '=='))).toBe('word')
  })
  it('has markers for every inline format', () => {
    expect(Object.keys(WRAPPERS).sort()).toEqual(['bold', 'code', 'highlight', 'italic', 'math', 'strike', 'subscript', 'superscript', 'underline'])
  })
})

describe('link, image and clear', () => {
  it('builds a link from the selection, or from the address when nothing is selected', () => {
    expect(apply('see site', linkEdit('see site', 4, 8, 'https://x.io'))).toBe('see [site](https://x.io)')
    expect(apply('', linkEdit('', 0, 0, 'https://x.io'))).toBe('[https://x.io](https://x.io)')
  })
  it('an empty address removes the link around the selection', () => {
    expect(apply('[site](https://x.io)', linkEdit('[site](https://x.io)', 0, 20, ''))).toBe('site')
  })
  it('inserts an image with the selection as its alt text', () => {
    expect(apply('pic', imageEdit('pic', 0, 3, 'assets/a.png'))).toBe('![pic](assets/a.png)')
  })
  it('clears paired markers but leaves lone characters and words with underscores alone', () => {
    expect(clearFormatting('**b** *i* ~~s~~ ==h== `c` <u>u</u> x<sup>2</sup> [t](https://u)')).toBe('b i s h c u x2 t')
    expect(clearFormatting('snake_case_name and 2 * 3 * 4')).toBe('snake_case_name and 2 * 3 * 4')
  })
})

describe('format table', () => {
  it('has unique shortcuts and shows them as Ctrl+…', () => {
    const keys = FORMAT_KEYS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(shortcutLabel('Mod-Shift-h')).toBe('Ctrl+Shift+H')
    expect(shortcutLabel('Mod-`')).toBe('Ctrl+`')
  })
  it('never uses a chord the app already owns', () => {
    const owned = ['Mod-o', 'Mod-s', 'Mod-Shift-s', 'Mod-n', 'Mod-w', 'Mod-/', 'Mod-f', 'Mod-h']
    for (const f of FORMATS) if (f.shortcut) expect(owned).not.toContain(f.shortcut)
  })
})
