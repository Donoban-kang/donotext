import { expect, test, type Page } from '@playwright/test'

const seed = {
  '/w/notes/a.md': '# 첫 제목\n\n본문\n',
  '/w/notes/b.txt': 'plain',
  '/w/notes/c.json': '{"k": 1}',
  '/w/notes/sub/d.md': '# 하위 문서\n'
}

async function openFolder(page: Page): Promise<void> {
  await page.addInitScript((s) => {
    window.__DONOTEXT_SEED__ = s
  }, seed)
  await page.goto('/')
  await page.evaluate(() => window.__mock!.queueFolder('/w/notes'))
  await page.getByRole('button', { name: '폴더 열기' }).click()
}

const tree = (page: Page) => page.getByRole('tree')
const mockHas = (page: Page, path: string): Promise<boolean> => page.evaluate((p) => window.__mock!.files.has(p), path)

test('shows folders first and only markdown/text files by default', async ({ page }) => {
  await openFolder(page)
  const names = await tree(page).locator('.dn-tree-name').allTextContents()
  expect(names.map((n) => n.replace(/^[▸▾] /, ''))).toEqual(['sub', 'a.md', 'b.txt'])
})

test('"모든 파일 표시" reveals other files, which open in source-only mode', async ({ page }) => {
  await openFolder(page)
  await page.getByLabel('모든 파일 표시').check()
  await tree(page).getByRole('button', { name: 'c.json', exact: true }).click()
  await expect(page.locator('.cm-content')).toContainText('"k": 1')
  await expect(page.getByRole('button', { name: 'WYSIWYG 모드' })).toBeDisabled()
})

test('clicking a file opens it and expanding a folder lazily lists its children', async ({ page }) => {
  await openFolder(page)
  await tree(page).getByRole('button', { name: 'a.md', exact: true }).click()
  await expect(page.getByTestId('tab')).toHaveText(/a\.md/)
  await tree(page).getByRole('button', { name: '▸ sub', exact: true }).click()
  await expect(tree(page).getByRole('button', { name: 'd.md', exact: true })).toBeVisible()
})

test('creates a file from the toolbar, validates names, and opens the new file', async ({ page }) => {
  await openFolder(page)
  await page.getByRole('button', { name: '새 파일', exact: true }).click()
  const input = page.getByRole('textbox', { name: '이름 바꾸기' })
  await input.fill('a/b.md')
  await input.press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  await input.fill('새 문서.md')
  await input.press('Enter')
  await expect(tree(page).getByRole('button', { name: '새 문서.md', exact: true })).toBeVisible()
  expect(await mockHas(page, '/w/notes/새 문서.md')).toBe(true)
  await expect(page.getByTestId('tab')).toHaveText(/새 문서\.md/)
})

test('renaming a file updates the tree and the open tab', async ({ page }) => {
  await openFolder(page)
  await tree(page).getByRole('button', { name: 'a.md', exact: true }).click()
  await tree(page).getByRole('button', { name: '이름 바꾸기 a.md', exact: true }).click()
  const input = page.getByRole('textbox', { name: '이름 바꾸기' })
  await input.fill('renamed.md')
  await input.press('Enter')
  await expect(tree(page).getByRole('button', { name: 'renamed.md', exact: true })).toBeVisible()
  await expect(page.getByTestId('tab')).toHaveText(/renamed\.md/)
  expect(await mockHas(page, '/w/notes/renamed.md')).toBe(true)
  expect(await mockHas(page, '/w/notes/a.md')).toBe(false)
})

test('deleting asks for confirmation first', async ({ page }) => {
  await openFolder(page)
  await tree(page).getByRole('button', { name: '삭제 b.txt', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('"b.txt"')
  await page.getByRole('button', { name: '취소' }).click()
  expect(await mockHas(page, '/w/notes/b.txt')).toBe(true)
  await tree(page).getByRole('button', { name: '삭제 b.txt', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제' }).click()
  await expect(tree(page).getByRole('button', { name: 'b.txt', exact: true })).toHaveCount(0)
  expect(await mockHas(page, '/w/notes/b.txt')).toBe(false)
})

test('outline lists the active document headings and jumps to them', async ({ page }) => {
  const long = Array.from({ length: 60 }, (_, i) => `단락 ${i}\n`).join('\n')
  await page.addInitScript((s) => {
    window.__DONOTEXT_SEED__ = s
  }, { '/w/long.md': `# 시작\n\n${long}\n## 마지막 장\n\n끝\n` })
  await page.goto('/')
  await page.evaluate(() => window.__mock!.queueOpen(['/w/long.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click()
  await page.getByRole('tab', { name: '개요' }).click()
  const items = page.getByTestId('outline').getByRole('button')
  await expect(items).toHaveText(['시작', '마지막 장'])
  await items.nth(1).click()
  await expect(page.locator('.ProseMirror h2')).toBeInViewport()
})

test('outline shows an empty message without headings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '개요' }).click()
  await expect(page.getByText('제목이 없습니다.')).toBeVisible()
})

test('opening a folder keeps watching the files that are already open', async ({ page }) => {
  await page.addInitScript((s) => {
    window.__DONOTEXT_SEED__ = s
  }, { '/elsewhere/solo.md': '# 따로\n', '/w/notes/a.md': 'a' })
  await page.goto('/')
  await page.evaluate(() => window.__mock!.queueOpen(['/elsewhere/solo.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click()
  await page.evaluate(() => window.__mock!.queueFolder('/w/notes'))
  await page.getByRole('button', { name: '폴더 열기' }).click()
  await expect(page.getByRole('tree')).toBeVisible()
  const last = await page.evaluate(() => window.__mock!.watchCalls.at(-1))
  expect(last).toEqual(['/elsewhere/solo.md', '/w/notes'])
})
