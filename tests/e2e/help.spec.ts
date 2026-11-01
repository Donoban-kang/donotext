import { expect, test } from '@playwright/test'
import { openSeed } from './helpers'

test('help button at the bottom of the sidebar shows version, author and a link to the project', async ({ page }) => {
  await openSeed(page, {})
  const sidebar = page.getByTestId('sidebar')
  const help = sidebar.getByRole('button', { name: '도움말' })
  await expect(help).toBeVisible()
  const sidebarBox = (await sidebar.boundingBox())!
  const helpBox = (await help.boundingBox())!
  expect(helpBox.y + helpBox.height).toBeGreaterThan(sidebarBox.y + sidebarBox.height - 60)

  await help.click()
  const dialog = page.getByRole('dialog', { name: '도움말' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('help-version')).toHaveText('v0.0.0-dev')
  await expect(dialog.getByText('Donoban-kang', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'GitHub에서 보기' }).click()
  expect(await page.evaluate(() => window.__mock!.externalUrls)).toEqual(['https://github.com/Donoban-kang/donotext'])

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('update check reports up to date, a new version with a download link, and failures', async ({ page }) => {
  await openSeed(page, {})
  await page.getByRole('button', { name: '도움말' }).click()
  const dialog = page.getByRole('dialog', { name: '도움말' })
  const result = dialog.getByTestId('update-result')

  await dialog.getByRole('button', { name: '업데이트 확인' }).click()
  await expect(result).toContainText('최신 버전입니다')

  await page.evaluate(() =>
    window.__mock!.setUpdateResult({ status: 'available', current: '0.1.2', latest: '0.1.3', url: 'https://github.com/Donoban-kang/donotext/releases' })
  )
  await dialog.getByRole('button', { name: '업데이트 확인' }).click()
  await expect(result).toContainText('새 버전 v0.1.3')
  await dialog.getByRole('button', { name: '내려받기' }).click()
  expect(await page.evaluate(() => window.__mock!.externalUrls)).toContain('https://github.com/Donoban-kang/donotext/releases')

  await page.evaluate(() => window.__mock!.setUpdateResult({ status: 'error', current: '0.1.2', reason: 'network' }))
  await dialog.getByRole('button', { name: '업데이트 확인' }).click()
  await expect(result).toContainText('인터넷에 연결되지 않아')
  await expect(dialog.getByRole('button', { name: '내려받기' })).toHaveCount(0)

  await page.evaluate(() => window.__mock!.setUpdateResult({ status: 'error', current: '0.1.2', reason: 'notFound' }))
  await dialog.getByRole('button', { name: '업데이트 확인' }).click()
  await expect(result).toContainText('비공개')
  await dialog.getByRole('button', { name: '릴리스 페이지 열기' }).click()
  expect(await page.evaluate(() => window.__mock!.externalUrls)).toContain('https://github.com/Donoban-kang/donotext/releases')
})

test('help dialog fits in dark theme and lists the shortcuts', async ({ page }) => {
  await openSeed(page, {})
  await page.getByLabel('테마').selectOption('dark')
  await page.getByRole('button', { name: '도움말' }).click()
  const dialog = page.getByRole('dialog', { name: '도움말' })
  await expect(dialog.getByText('Ctrl+Shift+S')).toBeVisible()
  await page.screenshot({ path: '/tmp/claude-0/shots/help-dark.png' })
})
