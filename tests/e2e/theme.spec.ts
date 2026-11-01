import { expect, test, type Page } from '@playwright/test'
import { changeSettings, openSettings } from './helpers'

const theme = (page: Page): Promise<string | undefined> => page.evaluate(() => document.documentElement.dataset.theme)
const bgLuminance = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  })

test('follows the system colour scheme by default', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect.poll(() => theme(page)).toBe('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => theme(page)).toBe('dark')
})

test('an explicit choice overrides the system and changes the actual colours', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  expect(await bgLuminance(page)).toBeGreaterThan(0.9)
  await changeSettings(page, (d) => d.getByLabel('테마').selectOption('dark'))
  await expect.poll(() => theme(page)).toBe('dark')
  expect(await bgLuminance(page)).toBeLessThan(0.3)
  await changeSettings(page, (d) => d.getByLabel('테마').selectOption('light'))
  await expect.poll(() => theme(page)).toBe('light')
  expect(await bgLuminance(page)).toBeGreaterThan(0.9)
})

test('the choice survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await changeSettings(page, (d) => d.getByLabel('테마').selectOption('dark'))
  await page.reload()
  await expect.poll(() => theme(page)).toBe('dark')
  await expect((await openSettings(page)).getByLabel('테마')).toHaveValue('dark')
})

test('other settings survive a reload too', async ({ page }) => {
  await page.goto('/')
  await changeSettings(page, async (d) => {
    await d.getByLabel('자동 저장').check()
    await d.getByLabel('집중 모드').check()
  })
  await page.reload()
  const dialog = await openSettings(page)
  await expect(dialog.getByLabel('자동 저장')).toBeChecked()
  await expect(dialog.getByLabel('집중 모드')).toBeChecked()
})

test('editor surfaces follow the theme (source editor is dark in dark mode)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__DONOTEXT_SEED__ = { '/w/a.md': '# 제목\n' }
  })
  await page.goto('/')
  await changeSettings(page, (d) => d.getByLabel('테마').selectOption('dark'))
  await page.evaluate(() => window.__mock!.queueOpen(['/w/a.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click()
  await page.getByRole('button', { name: '소스 모드' }).click()
  const lum = await page.locator('.cm-editor').evaluate((el) => {
    const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g)!.map(Number)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  })
  expect(lum).toBeLessThan(0.3)
})
