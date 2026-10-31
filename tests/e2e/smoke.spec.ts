import { expect, test } from '@playwright/test'

test('app boots in browser mode with a mocked api', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('donotext')
  await expect(page.getByTestId('workspace')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'donotext' })).toBeVisible()
  expect(await page.evaluate(() => typeof window.api.readFile)).toBe('function')
})
