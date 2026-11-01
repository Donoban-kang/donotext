import { expect, test, type Page } from '@playwright/test'
import { openSettings } from './helpers'

const seed = {
  '/w/notes/a.md': '# 첫 제목\n',
  '/w/notes/b.txt': 'plain',
  '/w/notes/sub/d.md': '# 하위\n',
  '/w/other/a.md': '# 다른 폴더의 a\n',
  '/w/other/b.txt': 'other plain'
}

async function openFolder(page: Page, root = '/w/notes'): Promise<void> {
  await page.evaluate((r) => window.__mock!.queueFolder(r), root)
  await page.getByRole('button', { name: '폴더 열기' }).click()
}
async function start(page: Page): Promise<void> {
  await page.addInitScript((s) => {
    window.__DONOTEXT_SEED__ = s
  }, seed)
  await page.goto('/')
  await openFolder(page)
}

const tree = (page: Page) => page.getByRole('tree')
const item = (page: Page, name: string) => tree(page).getByRole('button', { name, exact: true })
const mockHas = (page: Page, path: string): Promise<boolean> => page.evaluate((p) => window.__mock!.files.has(p), path)

test('the icon next to a folder or file hides it from the list and never deletes anything', async ({ page }) => {
  await start(page)
  await expect(item(page, 'sub')).toBeVisible()
  await tree(page).getByRole('button', { name: '목록에서 숨기기 sub', exact: true }).click()
  await expect(item(page, 'sub')).toHaveCount(0)
  await tree(page).getByRole('button', { name: '목록에서 숨기기 b.txt', exact: true }).click()
  await expect(item(page, 'b.txt')).toHaveCount(0)
  await expect(item(page, 'a.md')).toBeVisible()
  // nothing was touched on disk, and no confirmation or trash was involved
  expect(await mockHas(page, '/w/notes/sub/d.md')).toBe(true)
  expect(await mockHas(page, '/w/notes/b.txt')).toBe(true)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('"숨긴 항목 N개 보기" shows them dimmed, and the eye icon brings one back', async ({ page }) => {
  await start(page)
  await expect(page.getByRole('button', { name: /숨긴 항목/ })).toHaveCount(0) // nothing hidden yet
  await tree(page).getByRole('button', { name: '목록에서 숨기기 sub', exact: true }).click()
  await tree(page).getByRole('button', { name: '목록에서 숨기기 b.txt', exact: true }).click()
  const toggle = page.getByRole('button', { name: '숨긴 항목 2개 보기' })
  await toggle.click()
  await expect(item(page, 'sub')).toBeVisible()
  await expect(item(page, 'b.txt')).toBeVisible()
  await expect(tree(page).locator('.dn-tree-hidden')).toHaveCount(2)
  await tree(page).getByRole('button', { name: '다시 보이기 sub', exact: true }).click()
  await expect(tree(page).locator('.dn-tree-hidden')).toHaveCount(1)
  await page.getByRole('button', { name: '숨긴 항목 감추기' }).click()
  await expect(item(page, 'sub')).toBeVisible()
  await expect(item(page, 'b.txt')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '숨긴 항목 1개 보기' })).toBeVisible()
})

test('hiding is remembered after a restart and applies to the same path whichever folder is open', async ({ page }) => {
  await start(page)
  await tree(page).getByRole('button', { name: '목록에서 숨기기 b.txt', exact: true }).click()
  await expect(item(page, 'b.txt')).toHaveCount(0)
  await page.reload()
  await openFolder(page, '/w/notes')
  await expect(item(page, 'a.md')).toBeVisible()
  await expect(item(page, 'b.txt')).toHaveCount(0)
  // a different folder with a file of the same name is not affected (the rule is per path)…
  await openFolder(page, '/w/other')
  await expect(item(page, 'b.txt')).toBeVisible()
  // …but the hidden path stays hidden when its folder is opened again, from anywhere
  await openFolder(page, '/w/notes')
  await expect(item(page, 'b.txt')).toHaveCount(0)
})

test('the right-click menu offers rename, hide and move to trash', async ({ page }) => {
  await start(page)
  await item(page, 'b.txt').click({ button: 'right' })
  const menu = page.getByTestId('tree-menu')
  await expect(menu.getByRole('menuitem')).toHaveText(['이름 바꾸기', '목록에서 숨기기', '휴지통으로 이동'])
  await menu.getByRole('menuitem', { name: '목록에서 숨기기' }).click()
  await expect(item(page, 'b.txt')).toHaveCount(0)
  await page.getByRole('button', { name: '숨긴 항목 1개 보기' }).click()
  await item(page, 'b.txt').click({ button: 'right' })
  await expect(page.getByTestId('tree-menu').getByRole('menuitem', { name: '다시 보이기' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tree-menu')).toHaveCount(0)
  expect(await mockHas(page, '/w/notes/b.txt')).toBe(true)
})

test('a hidden folder with open files does not close their tabs', async ({ page }) => {
  await start(page)
  await item(page, 'sub').click() // expand
  await item(page, 'd.md').click() // open a file inside
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await tree(page).getByRole('button', { name: '목록에서 숨기기 sub', exact: true }).click()
  await expect(item(page, 'sub')).toHaveCount(0)
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await expect(page.locator('.ProseMirror h1')).toHaveText('하위')
})

test('the 설정 window lists how many are hidden and can bring them all back', async ({ page }) => {
  await start(page)
  await tree(page).getByRole('button', { name: '목록에서 숨기기 sub', exact: true }).click()
  await tree(page).getByRole('button', { name: '목록에서 숨기기 b.txt', exact: true }).click()
  const dialog = await openSettings(page)
  await expect(dialog.getByTestId('hidden-count')).toHaveText('2개')
  await dialog.getByRole('button', { name: '모두 다시 보이게' }).click()
  await expect(dialog.getByTestId('hidden-count')).toHaveText('0개')
  await expect(dialog.getByRole('button', { name: '모두 다시 보이게' })).toBeDisabled()
  await dialog.getByRole('button', { name: '닫기' }).click()
  await expect(item(page, 'sub')).toBeVisible()
  await expect(item(page, 'b.txt')).toBeVisible()
})
