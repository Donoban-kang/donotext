import { describe, expect, it } from 'vitest'
import { filePathsFromArgv } from '../../src/main/launchArgs'

describe('filePathsFromArgv', () => {
  it('takes the file arguments of a packaged app (everything after the executable)', () => {
    expect(filePathsFromArgv(['/opt/donotext', '/w/a.md', '/w/b.md'], true, '/cwd')).toEqual(['/w/a.md', '/w/b.md'])
  })
  it('skips the app path in development (electron . file.md)', () => {
    expect(filePathsFromArgv(['/x/electron', '/proj', '/w/a.md'], false, '/cwd')).toEqual(['/w/a.md'])
  })
  it('ignores flags, empty strings and Chromium switches', () => {
    expect(filePathsFromArgv(['/opt/donotext', '--no-sandbox', '', '--user-data-dir=/x', '/w/a.md'], true, '/cwd')).toEqual(['/w/a.md'])
  })
  it('resolves relative paths against the directory the second instance was started from', () => {
    expect(filePathsFromArgv(['/opt/donotext', 'notes/a.md', './b.md'], true, '/home/me')).toEqual(['/home/me/notes/a.md', '/home/me/b.md'])
  })
  it('keeps Korean and spaced names intact and removes duplicates', () => {
    expect(filePathsFromArgv(['/opt/donotext', '/w/한글 폴더/메모 1.md', '/w/한글 폴더/메모 1.md'], true, '/cwd')).toEqual(['/w/한글 폴더/메모 1.md'])
  })
  it('returns nothing when there are no file arguments', () => {
    expect(filePathsFromArgv(['/opt/donotext'], true, '/cwd')).toEqual([])
    expect(filePathsFromArgv(['/x/electron', '/proj'], false, '/cwd')).toEqual([])
  })
})
