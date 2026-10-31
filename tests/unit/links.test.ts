import { describe, expect, it } from 'vitest'
import { isSafeLinkUrl } from '../../src/shared/links'

describe('isSafeLinkUrl', () => {
  it.each(['https://a.b', 'http://a.b', 'mailto:a@b.c', './rel.md', '#h', 'sub/dir.md'])(
    'allows %s',
    (u) => expect(isSafeLinkUrl(u)).toBe(true)
  )
  it.each(['javascript:alert(1)', 'JaVaScript:x', ' javascript:x', 'data:text/html,x', 'file:///etc/passwd', 'vbscript:x'])(
    'rejects %s',
    (u) => expect(isSafeLinkUrl(u)).toBe(false)
  )
})
