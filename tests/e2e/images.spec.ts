import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

// 1x1 transparent PNG
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function pasteImage(page: Page, mime = 'image/png', b64 = PNG_BASE64): Promise<void> {
  await page.locator('.ProseMirror').evaluate(
    (el, [type, data]) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'clip', { type }))
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    [mime, b64]
  )
}

const storeText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    window.__stores!.flushEditors()
    return Object.values(window.__stores!.documents.getState().docs)[0].text
  })

test('pasting an image saves it next to the document and inserts a relative link', async ({ page }) => {
  await openSeed(page, { '/w/note.md': '# 제목\n\n본문\n' }, ['/w/note.md'])
  await focusEditorAtEnd(page)
  await pasteImage(page)
  await expect(page.locator('.ProseMirror img')).toHaveCount(1)
  const text = await storeText(page)
  expect(text).toMatch(/!\[\]\(assets\/img-[^)]+\.png\)/)
  // The editor shows the image through the scoped scheme while the markdown keeps the relative path.
  const shown = await page.locator('.ProseMirror img').getAttribute('src')
  expect(shown).toMatch(/^donotext-file:\/\/local\/%2Fw%2Fassets%2Fimg-/)
})

test('pasting an image into an untitled document asks to save first and inserts nothing', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '새 문서' }).click()
  await focusEditorAtEnd(page)
  await pasteImage(page)
  await expect(page.getByTestId('toast')).toContainText('먼저 문서를 저장')
  await expect(page.locator('.ProseMirror img')).toHaveCount(0)
})

test('pasting an unsupported image type (svg) is not turned into a file', async ({ page }) => {
  await openSeed(page, { '/w/note.md': '본문\n' }, ['/w/note.md'])
  await focusEditorAtEnd(page)
  await pasteImage(page, 'image/svg+xml', btoa_('<svg xmlns="http://www.w3.org/2000/svg"/>'))
  await page.waitForTimeout(200)
  await expect(page.locator('.ProseMirror img')).toHaveCount(0)
  expect(await page.evaluate(() => [...window.__mock!.files.keys()].some((k) => k.includes('assets')))).toBe(false)
})

test('an existing relative image in a document is displayed through the scoped scheme', async ({ page }) => {
  await openSeed(page, { '/w/dir/note.md': '![그림](assets/a.png)\n' }, ['/w/dir/note.md'])
  const img = page.locator('.ProseMirror img')
  await expect(img).toHaveAttribute('src', /^donotext-file:\/\/local\/%2Fw%2Fdir%2Fassets%2Fa\.png$/)
  await expect(img).toHaveAttribute('alt', '그림')
})

test('hostile image sources in markdown are never rendered', async ({ page }) => {
  await openSeed(
    page,
    { '/w/n.md': '![x](javascript:alert(1))\n\n![y](file:///etc/passwd)\n\n![z](https://example.com/ok.png)\n' },
    ['/w/n.md']
  )
  const srcs = await page.locator('.ProseMirror img').evaluateAll((els) => els.map((e) => e.getAttribute('src')))
  expect(srcs).toEqual(['https://example.com/ok.png'])
})

function btoa_(s: string): string {
  return Buffer.from(s).toString('base64')
}
