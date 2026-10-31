import { describe, expect, it } from 'vitest'
import { escapeLineStarts, markdownDestination } from '../../src/renderer/editor/markdown/markdownText'

const E = '' // stands in for the backslash the caller will substitute

describe('markdownDestination', () => {
  it('leaves ordinary targets alone', () => {
    expect(markdownDestination('https://example.com/a?b=c#d')).toBe('https://example.com/a?b=c#d')
    expect(markdownDestination('assets/한글.png')).toBe('assets/한글.png')
  })
  it('keeps balanced parentheses', () => {
    expect(markdownDestination('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe('https://en.wikipedia.org/wiki/Foo_(bar)')
  })
  it('wraps targets that would otherwise end early', () => {
    expect(markdownDestination('assets/a b.png')).toBe('<assets/a b.png>')
    expect(markdownDestination('a)b')).toBe('<a)b>')
    expect(markdownDestination('(a')).toBe('<(a>')
    expect(markdownDestination('')).toBe('<>')
  })
  it('encodes the characters that cannot appear inside angle brackets', () => {
    expect(markdownDestination('a <b> c')).toBe('<a %3Cb%3E c>')
    expect(markdownDestination('a\nb')).toBe('<a%0Ab>')
  })
})

describe('escapeLineStarts', () => {
  it('escapes the markers the serializer does not escape itself', () => {
    expect(escapeLineStarts('# not a heading', true, E)).toBe(`${E}# not a heading`)
    expect(escapeLineStarts('###### six', true, E)).toBe(`${E}###### six`)
    expect(escapeLineStarts('- item', true, E)).toBe(`${E}- item`)
    expect(escapeLineStarts('+ item', true, E)).toBe(`${E}+ item`)
    expect(escapeLineStarts('1. one', true, E)).toBe(`1${E}. one`)
    expect(escapeLineStarts('2024) year', true, E)).toBe(`2024${E}) year`)
    expect(escapeLineStarts('---', true, E)).toBe(`${E}---`)
    expect(escapeLineStarts('- - -', true, E)).toBe(`${E}- - -`)
    expect(escapeLineStarts('===', true, E)).toBe(`${E}===`)
  })
  it('does not double-escape what the serializer already handles (*, _, `, ~, >)', () => {
    for (const t of ['* item', '> quote', '```js', '~~~', '***', '___']) expect(escapeLineStarts(t, true, E)).toBe(t)
  })
  it('leaves text that cannot start a block alone', () => {
    for (const t of ['plain', '#hashtag', '#######seven', '-dash', '1.5 is a number', '2024년', 'a - b', '한글 문단', '']) {
      expect(escapeLineStarts(t, true, E)).toBe(t)
    }
  })
  it('only treats the first line as a block start when the text begins one', () => {
    expect(escapeLineStarts('- a\n- b', false, E)).toBe(`- a\n${E}- b`)
    expect(escapeLineStarts('x\n1. y\nz', false, E)).toBe(`x\n1${E}. y\nz`)
  })
  it('allows up to three leading spaces, as markdown does', () => {
    expect(escapeLineStarts('   # x', true, E)).toBe(`   ${E}# x`)
  })
})
