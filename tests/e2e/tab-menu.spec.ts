import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

const panes = (page: Page) => page.locator('.dn-pane')
const editorIn = (page: Page, n: number) => panes(page).nth(n).locator('.ProseMirror')
const fileText = (page: Page, path: string) => page.evaluate((p) => window.__mock!.files.get(p)?.text ?? null, path)
const menu = (page: Page) => page.getByTestId('tab-menu')

const LONG = '260930_클로드Sonnet55_게임만들기_강의자료_실습프롬프트_아주아주긴이름_한번더길게.txt'

test('a very long file name is shortened so the close button stays visible', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await openSeed(page, { [`/w/${LONG}`]: '내용' }, [`/w/${LONG}`])
  const tab = page.getByTestId('tab').first()
  const box = (await tab.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(285)
  const close = tab.getByRole('button', { name: '탭 닫기' })
  const cb = (await close.boundingBox())!
  expect(cb.x + cb.width).toBeLessThanOrEqual(box.x + box.width + 1)
  // the full name is still readable from the hover card
  await tab.hover()
  await expect(page.getByTestId('tab-stats')).toContainText(LONG)
})

test('right-clicking a tab opens a menu; Escape closes it', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await page.getByTestId('tab').first().click({ button: 'right' })
  await expect(menu(page)).toBeVisible()
  await expect(menu(page).getByRole('menuitem')).toHaveText(['다른 이름으로 저장', '닫기'])
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
  await page.getByTestId('tab').first().click({ button: 'right' })
  await page.mouse.click(600, 400) // click elsewhere
  await expect(menu(page)).toHaveCount(0)
})

test('menu "닫기" closes an unmodified tab, and asks first when the file was changed', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n', '/w/b.md': '다른\n' }, ['/w/a.md', '/w/b.md'])
  await page.getByTestId('tab').nth(1).click({ button: 'right' })
  await menu(page).getByRole('menuitem', { name: '닫기' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(1)

  await focusEditorAtEnd(page)
  await page.keyboard.type('abc')
  await page.getByTestId('tab').first().click({ button: 'right' })
  await menu(page).getByRole('menuitem', { name: '닫기' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('변경 내용을 저장할까요')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
})

test('menu "다른 이름으로 저장" saves that tab under a new name', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await focusEditorAtEnd(page)
  await page.keyboard.type('abc')
  await page.evaluate(() => window.__mock!.queueSaveAs('/w/new.md'))
  await page.getByTestId('tab').first().click({ button: 'right' })
  await menu(page).getByRole('menuitem', { name: '다른 이름으로 저장' }).click()
  await expect.poll(() => fileText(page, '/w/new.md')).toContain('본문abc')
  expect(await fileText(page, '/w/a.md')).toBe('본문\n')
})

test('on an edited copy the menu also offers "원본 교체", which asks again before overwriting and closes the copy', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc')
  const copyTab = page.getByTestId('tab').nth(1)
  await expect(copyTab).toContainText('수정본')
  await copyTab.click({ button: 'right' })
  await expect(menu(page).getByRole('menuitem')).toHaveText(['다른 이름으로 저장', '원본 교체', '닫기'])

  await menu(page).getByRole('menuitem', { name: '원본 교체' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('덮어쓸까요')
  await confirm.getByRole('button', { name: '취소' }).click()
  expect(await fileText(page, '/w/a.md')).toBe('본문\n')
  await expect(page.getByTestId('tab')).toHaveCount(2)

  await copyTab.click({ button: 'right' })
  await menu(page).getByRole('menuitem', { name: '원본 교체' }).click()
  await confirm.getByRole('button', { name: '덮어쓰기' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  expect(await fileText(page, '/w/a.md')).toContain('본문abc')
  await expect(editorIn(page, 0)).toContainText('본문abc')
})

test('the menu acts on the right-clicked tab even when another pane is active', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc') // right pane becomes the edited copy
  await focusEditorAtEnd(page, editorIn(page, 0)) // the left pane is active now
  await page.evaluate(() => window.__mock!.queueSaveAs('/w/copy.md'))
  await page.getByTestId('tab').nth(1).click({ button: 'right' }) // right-click the copy's tab
  await menu(page).getByRole('menuitem', { name: '다른 이름으로 저장' }).click()
  await expect.poll(() => fileText(page, '/w/copy.md')).toContain('본문abc')
  expect(await fileText(page, '/w/a.md')).toBe('본문\n')
})

test('the menu works with the keyboard', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n', '/w/b.md': 'b\n' }, ['/w/a.md', '/w/b.md'])
  await page.getByTestId('tab').nth(1).click({ button: 'right' })
  await expect(menu(page).getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('ArrowDown') // 닫기
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tab')).toHaveCount(1)
})
