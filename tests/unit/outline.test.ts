import { describe, expect, it } from 'vitest'
import { extractOutline } from '../../src/renderer/sidebar/outline'

describe('extractOutline', () => {
  it('lists ATX headings with level, text and line-start offset', () => {
    const md = '# A\n\ntext\n\n## B\n'
    expect(extractOutline(md)).toEqual([
      { level: 1, text: 'A', offset: 0 },
      { level: 2, text: 'B', offset: md.indexOf('## B') }
    ])
  })
  it('ignores # lines inside fenced code blocks (backtick and tilde)', () => {
    const md = '# Real\n\n```md\n# not a heading\n```\n\n~~~\n## nope\n~~~\n\n## Also real\n'
    expect(extractOutline(md).map((h) => h.text)).toEqual(['Real', 'Also real'])
  })
  it('keeps Korean titles', () => {
    expect(extractOutline('## 개요와 목적\n').map((h) => h.text)).toEqual(['개요와 목적'])
  })
  it('returns an empty list for an empty document or one without headings', () => {
    expect(extractOutline('')).toEqual([])
    expect(extractOutline('just text\n')).toEqual([])
  })
  it('requires a space after the hashes and at most six of them', () => {
    expect(extractOutline('#hashtag\n####### seven\n')).toEqual([])
  })
  it('strips optional closing hashes', () => {
    expect(extractOutline('## Title ##\n')[0].text).toBe('Title')
  })
  it('skips YAML front matter', () => {
    const md = '---\n# comment: x\ntitle: t\n---\n# Body\n'
    expect(extractOutline(md)).toEqual([{ level: 1, text: 'Body', offset: md.indexOf('# Body') }])
  })
  it('ignores indented code that looks like a heading', () => {
    expect(extractOutline('    # code\n')).toEqual([])
  })
  it('skips headings with no text', () => {
    expect(extractOutline('# \n## real\n').map((h) => h.text)).toEqual(['real'])
  })
})
