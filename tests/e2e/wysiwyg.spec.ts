import { expect, test } from '@playwright/test'
import { focusEditorAtEnd } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__DONOTEXT_SEED__ = { '/w/a.md': '# 제목\n\n본문\n' }
  })
  await page.goto('/')
  await page.evaluate(() => window.__mock!.queueOpen(['/w/a.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click()
})

const editor = (page: import('@playwright/test').Page) => page.locator('.ProseMirror')

test('renders the opened markdown as formatted content and is not dirty', async ({ page }) => {
  await expect(editor(page).locator('h1')).toHaveText('제목')
  await expect(page.getByTestId('tab-dirty')).toHaveCount(0)
})

test('typing marks the document modified and updates the store text', async ({ page }) => {
  await focusEditorAtEnd(page)
  await page.keyboard.type(' 추가')
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
  const text = await page.evaluate(() => Object.values(window.__stores!.documents.getState().docs)[0].text)
  expect(text).toContain('본문 추가')
})

test('"# " at the start of a paragraph becomes a heading', async ({ page }) => {
  await focusEditorAtEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('# 새 제목')
  await expect(editor(page).locator('h1')).toHaveCount(2)
})

test('Ctrl/Cmd+B makes text bold and Ctrl/Cmd+Z undoes it', async ({ page }) => {
  await focusEditorAtEnd(page)
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('굵게')
  await expect(editor(page).locator('strong')).toHaveText('굵게')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page).locator('strong')).toHaveCount(0)
})

test('an edit made right before reading the store is flushed by the registry', async ({ page }) => {
  await focusEditorAtEnd(page)
  await page.keyboard.type('x')
  const text = await page.evaluate(() => {
    window.__stores!.flushEditors()
    return Object.values(window.__stores!.documents.getState().docs)[0].text
  })
  expect(text).toContain('본문x')
})
