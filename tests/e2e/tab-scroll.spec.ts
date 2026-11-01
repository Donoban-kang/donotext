import { expect, test, type Page } from '@playwright/test'
import { openSeed } from './helpers'

const NAMES = Array.from({ length: 12 }, (_, i) => `문서-${String(i + 1).padStart(2, '0')}-제법-긴-이름.md`)
const seed = Object.fromEntries(NAMES.map((n) => [`/w/${n}`, `# ${n}\n`]))

const bar = (page: Page) => page.locator('.dn-tabbar').first()
const left = (page: Page) => page.getByRole('button', { name: '왼쪽 탭 보기' })
const right = (page: Page) => page.getByRole('button', { name: '오른쪽 탭 보기' })
const scrollLeft = (page: Page) => bar(page).evaluate((el) => el.scrollLeft)
/** True when the tab is fully inside the visible part of the tab row. */
const visible = (page: Page, name: string) =>
  page.evaluate((n) => {
    const row = document.querySelector('.dn-tabbar')!.getBoundingClientRect()
    const tab = [...document.querySelectorAll('[data-testid=tab]')].find((t) => t.textContent!.includes(n))!.getBoundingClientRect()
    return tab.left >= row.left - 1 && tab.right <= row.right + 1
  }, name)

async function openAll(page: Page): Promise<void> {
  await page.setViewportSize({ width: 800, height: 600 })
  await openSeed(page, seed, NAMES.map((n) => `/w/${n}`))
  await expect(page.getByTestId('tab')).toHaveCount(12)
}

test('the arrows only appear when the tabs do not all fit', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 })
  await openSeed(page, seed, [`/w/${NAMES[0]}`, `/w/${NAMES[1]}`])
  await expect(left(page)).toHaveCount(0)
  await expect(right(page)).toHaveCount(0)
  await page.setViewportSize({ width: 800, height: 600 })
  await openAll(page)
  await expect(left(page)).toBeVisible()
  await expect(right(page)).toBeVisible()
})

test('the tab you just opened is scrolled into view, and the arrows reach every tab', async ({ page }) => {
  await openAll(page)
  expect(await visible(page, NAMES[11])).toBe(true) // the newest tab is the active one, so it is shown
  await expect(right(page)).toBeDisabled() // already at the right end
  await expect(left(page)).toBeEnabled()

  expect(await visible(page, NAMES[0])).toBe(false)
  for (let i = 0; i < 20 && (await left(page).isEnabled()); i++) {
    await left(page).click()
    await page.waitForTimeout(250)
  }
  await expect(left(page)).toBeDisabled()
  expect(await scrollLeft(page)).toBe(0)
  expect(await visible(page, NAMES[0])).toBe(true)

  await right(page).click()
  await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0)
  for (let i = 0; i < 20 && (await right(page).isEnabled()); i++) {
    await right(page).click()
    await page.waitForTimeout(250)
  }
  await expect(right(page)).toBeDisabled()
  expect(await visible(page, NAMES[11])).toBe(true)
})

test('a tab reached with the arrows can be selected and closed', async ({ page }) => {
  await openAll(page)
  for (let i = 0; i < 20 && (await left(page).isEnabled()); i++) {
    await left(page).click()
    await page.waitForTimeout(250)
  }
  await page.getByTestId('tab').filter({ hasText: NAMES[0] }).click()
  await expect(page.locator('.ProseMirror h1')).toHaveText(NAMES[0].replace('.md', '') + '.md')
  await page.getByTestId('tab').filter({ hasText: NAMES[0] }).getByRole('button', { name: '탭 닫기' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(11)
})

test('selecting a tab by keyboard or opening a file always scrolls it into view', async ({ page }) => {
  await openAll(page)
  for (let i = 0; i < 20 && (await left(page).isEnabled()); i++) {
    await left(page).click()
    await page.waitForTimeout(250)
  }
  expect(await visible(page, NAMES[11])).toBe(false)
  await page.getByTestId('tab').filter({ hasText: NAMES[0] }).click() // the first tab is active now
  await page.evaluate(() => window.__mock!.queueOpen(['/w/문서-12-제법-긴-이름.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click() // opening the last file again makes its tab active
  await expect.poll(() => visible(page, NAMES[11])).toBe(true)
})

test('the mouse wheel moves the tab row sideways', async ({ page }) => {
  await openAll(page)
  const before = await scrollLeft(page)
  await bar(page).hover()
  await page.mouse.wheel(0, -300)
  await expect.poll(() => scrollLeft(page)).toBeLessThan(before)
})

test('closing tabs removes the arrows once everything fits again', async ({ page }) => {
  await openAll(page)
  for (let i = 0; i < 11; i++) {
    await page.getByTestId('tab').last().getByRole('button', { name: '탭 닫기' }).click()
  }
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await expect(left(page)).toHaveCount(0)
  await expect(right(page)).toHaveCount(0)
})

test('new empty documents opened one after another keep the newest tab in view', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 })
  await openSeed(page, {})
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: '새 문서' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(12)
  const last = page.getByTestId('tab').last()
  await expect(last).toHaveAttribute('aria-selected', 'true')
  expect(await visible(page, '12')).toBe(true)
  await expect(right(page)).toBeDisabled()
  await expect(left(page)).toBeEnabled()
})
