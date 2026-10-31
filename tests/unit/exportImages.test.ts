import { describe, expect, it } from 'vitest'
import { inlineLocalImages } from '../../src/main/services/exportImages'

const png = (n = 4): { bytes: Uint8Array; mime: string } => ({ bytes: new Uint8Array(n).fill(1), mime: 'image/png' })

describe('inlineLocalImages', () => {
  it('replaces a relative image with a data URI read through the callback', async () => {
    const asked: string[] = []
    const out = await inlineLocalImages('<p><img src="assets/a.png" alt="x"></p>', '/w/doc', async (p) => {
      asked.push(p)
      return png()
    })
    expect(asked).toEqual(['/w/doc/assets/a.png'])
    expect(out).toBe('<p><img src="data:image/png;base64,AQEBAQ==" alt="x"></p>')
  })
  it('handles Korean and percent-encoded names', async () => {
    const asked: string[] = []
    await inlineLocalImages('<img src="assets/%ED%95%9C%EA%B8%80%20a.png"><img src="assets/한글 b.png">', '/w/doc', async (p) => {
      asked.push(p)
      return png()
    })
    expect(asked).toEqual(['/w/doc/assets/한글 a.png', '/w/doc/assets/한글 b.png'])
  })
  it('leaves remote, inline and unreadable images untouched', async () => {
    const html = '<img src="https://e.com/a.png"><img src="data:image/png;base64,AAAA"><img src="gone.png">'
    expect(await inlineLocalImages(html, '/w', async () => null)).toBe(html)
  })
  it('does not resolve relative images when the document has no folder', async () => {
    const html = '<img src="a.png">'
    let called = false
    expect(await inlineLocalImages(html, null, async () => ((called = true), png()))).toBe(html)
    expect(called).toBe(false)
  })
  it('does not touch text that merely looks like an image tag', async () => {
    const html = '<p>use &lt;img src="a.png"&gt; here</p>'
    expect(await inlineLocalImages(html, '/w', async () => png())).toBe(html)
  })
  it('stops inlining once the size budget is spent and keeps the rest as links', async () => {
    const html = '<img src="a.png"><img src="b.png"><img src="c.png">'
    const out = await inlineLocalImages(html, '/w', async () => png(10), 25)
    expect((out.match(/data:image\/png/g) ?? []).length).toBe(2)
    expect(out).toContain('src="c.png"')
  })
  it('resolves ".." segments but passes the final absolute path to the reader (which enforces access)', async () => {
    const asked: string[] = []
    await inlineLocalImages('<img src="../other/a.png">', '/w/doc', async (p) => (asked.push(p), null))
    expect(asked).toEqual(['/w/other/a.png'])
  })
})
