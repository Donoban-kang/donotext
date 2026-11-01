import { expect, test } from '@playwright/test'
import { openSeed } from './helpers'

test('typing in the editor does not draw an input-style box around the page', async ({ page }) => {
  await openSeed(page, {})
  await page.getByRole('button', { name: '새 문서' }).click()
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.type('abc')
  const outline = await editor.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('none')
})

test('source editor shows no focus box either', async ({ page }) => {
  await openSeed(page, {})
  await page.getByRole('button', { name: '새 문서' }).click()
  await page.getByRole('button', { name: '소스 모드' }).click()
  const content = page.locator('.cm-content').first()
  await content.click()
  const outline = await content.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('none')
})
