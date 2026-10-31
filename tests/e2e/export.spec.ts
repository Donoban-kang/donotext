import { expect, test, type Page } from '@playwright/test'
import { openSeed } from './helpers'

const exported = (page: Page, path: string): Promise<string | undefined> =>
  page.evaluate((p) => window.__mock!.files.get(p)?.text, path)

test('exports the active document as a standalone HTML file and reports where it went', async ({ page }) => {
  await openSeed(page, { '/w/보고서.md': '# 제목\n\n본문 $a^2$\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n' }, ['/w/보고서.md'])
  await page.getByRole('button', { name: 'HTML 내보내기' }).click()
  await expect(page.getByTestId('toast')).toContainText('내보냈습니다')
  await expect(page.getByTestId('toast')).toContainText('/exports/보고서.html')
  const html = await exported(page, '/exports/보고서.html')
  expect(html).toContain('<!doctype html>')
  expect(html).toContain('<title>보고서</title>')
  expect(html).toContain('<h1')
  expect(html).toContain('<table')
  expect(html).toContain('<math')
  expect(html).not.toMatch(/<script/i)
})

test('hostile content in the document never reaches the exported file', async ({ page }) => {
  const md = '<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n본문\n'
  await openSeed(page, { '/w/h.md': md }, ['/w/h.md'])
  await page.getByRole('button', { name: 'HTML 내보내기' }).click()
  await expect(page.getByTestId('toast')).toContainText('내보냈습니다')
  const html = (await exported(page, '/exports/h.html'))!
  const body = html.slice(html.indexOf('<body'))
  expect(body).not.toMatch(/<script|onerror|javascript:/i)
  expect(body).toContain('본문')
})

test('PDF export goes through the PDF channel', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: 'PDF 내보내기' }).click()
  await expect(page.getByTestId('toast')).toContainText('/exports/a.pdf')
})

test('export buttons are disabled without a markdown document', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'HTML 내보내기' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'PDF 내보내기' })).toBeDisabled()
})

test('unsaved edits are included in the export', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
  await page.locator('.ProseMirror').click()
  await page.waitForTimeout(80)
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('저장 전 문장')
  await page.getByRole('button', { name: 'HTML 내보내기' }).click()
  await expect(page.getByTestId('toast')).toContainText('내보냈습니다')
  expect(await exported(page, '/exports/a.html')).toContain('저장 전 문장')
})
