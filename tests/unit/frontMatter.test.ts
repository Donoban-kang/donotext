import { describe, expect, it } from 'vitest'
import { splitFrontMatter } from '../../src/renderer/editor/markdown/frontMatter'

describe('splitFrontMatter', () => {
  it('separates a YAML block at the very start from the body', () => {
    expect(splitFrontMatter('---\na: 1\n---\n# t')).toEqual({ frontMatter: 'a: 1', body: '# t' })
  })
  it('returns an empty body when the document is only front matter', () => {
    expect(splitFrontMatter('---\ntitle: x\n---\n')).toEqual({ frontMatter: 'title: x', body: '' })
    expect(splitFrontMatter('---\ntitle: x\n---')).toEqual({ frontMatter: 'title: x', body: '' })
  })
  it('ignores an unclosed block', () => {
    const md = '---\na: 1\n# t'
    expect(splitFrontMatter(md)).toEqual({ frontMatter: null, body: md })
  })
  it('only recognizes front matter at the start of the document', () => {
    const md = '# t\n\n---\na: 1\n---\n'
    expect(splitFrontMatter(md)).toEqual({ frontMatter: null, body: md })
  })
  it('supports an empty block and multi-line YAML with Korean text', () => {
    expect(splitFrontMatter('---\n---\nbody')).toEqual({ frontMatter: '', body: 'body' })
    expect(splitFrontMatter('---\n제목: 안녕\n태그:\n  - a\n---\n\n본문')).toEqual({
      frontMatter: '제목: 안녕\n태그:\n  - a',
      body: '\n본문'
    })
  })
  it('treats a "---" line with trailing text as a normal document', () => {
    const md = '--- not yaml\nx\n---\n'
    expect(splitFrontMatter(md)).toEqual({ frontMatter: null, body: md })
  })
  it('accepts "..." as the closing delimiter', () => {
    expect(splitFrontMatter('---\na: 1\n...\nbody')).toEqual({ frontMatter: 'a: 1', body: 'body' })
  })
})
