import { describe, expect, it } from 'vitest'
import { classifyPath, MARKDOWN_EXTENSIONS } from '../../src/shared/fileKind'

describe('classifyPath', () => {
  it('treats markdown extensions case-insensitively as markdown', () => {
    expect(classifyPath('a.MD')).toBe('markdown')
    expect(classifyPath('/x/y.markdown')).toBe('markdown')
    expect(classifyPath('n.mdown')).toBe('markdown')
  })
  it('treats .txt as markdown', () => {
    expect(classifyPath('x.txt')).toBe('markdown')
  })
  it('treats other or missing extensions as sourceOnly', () => {
    expect(classifyPath('x.json')).toBe('sourceOnly')
    expect(classifyPath('x')).toBe('sourceOnly')
    expect(classifyPath('.md')).toBe('sourceOnly')
  })
  it('exposes the default extension list', () => {
    expect([...MARKDOWN_EXTENSIONS]).toEqual(['.md', '.markdown', '.mdown', '.txt'])
  })
})
