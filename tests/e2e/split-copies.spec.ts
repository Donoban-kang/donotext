import { expect, test, type Page } from '@playwright/test'
import { changeSettings, focusEditorAtEnd, openSeed } from './helpers'

const panes = (page: Page) => page.locator('.dn-pane')
const editorIn = (page: Page, n: number) => panes(page).nth(n).locator('.ProseMirror')
const fileText = (page: Page, path: string) => page.evaluate((p) => window.__mock!.files.get(p)?.text ?? null, path)

async function splitSameFile(page: Page): Promise<void> {
  await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await expect(panes(page)).toHaveCount(2)
}

test('editing one of two panes makes only that pane an edited copy', async ({ page }) => {
  await splitSameFile(page)
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc')
  await page.keyboard.type('def') // typing must continue in the same editor after the switch to a copy
  await expect(editorIn(page, 1)).toContainText('본문abcdef')
  await expect(editorIn(page, 0)).toContainText('본문')
  await expect(editorIn(page, 0)).not.toContainText('abc')

  const tabs = page.getByTestId('tab')
  await expect(tabs.nth(1)).toContainText('수정본')
  await expect(tabs.nth(1)).toHaveClass(/modified/)
  await expect(tabs.nth(0)).toContainText('원본')
  await expect(tabs.nth(0)).not.toHaveClass(/modified/)
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')
})

test('the edited copy shows its own colour for the title', async ({ page }) => {
  await splitSameFile(page)
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('x')
  await expect(page.getByTestId('tab').nth(1)).toHaveClass(/modified/)
  const name = page.getByTestId('tab').nth(1).locator('.dn-tab-name')
  const copyColor = await name.evaluate((el) => getComputedStyle(el).color)
  const originalColor = await page.getByTestId('tab').nth(0).locator('.dn-tab-name').evaluate((el) => getComputedStyle(el).color)
  expect(copyColor).not.toBe(originalColor)
})

test('editing the other pane too gives a second copy, and the original is never touched', async ({ page }) => {
  await splitSameFile(page)
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('R')
  await focusEditorAtEnd(page, editorIn(page, 0))
  await page.keyboard.type('L')
  await expect(editorIn(page, 0)).toContainText('본문L')
  await expect(editorIn(page, 1)).toContainText('본문R')
  await expect(page.getByTestId('tab').nth(0)).toContainText('수정본')
  await expect(page.getByTestId('tab').nth(1)).toContainText('수정본')
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')
})

test('closing a copy asks what to do; "저장 안 함" keeps the original as it was', async ({ page }) => {
  await splitSameFile(page)
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc')
  await page.getByRole('button', { name: '탭 닫기' }).nth(1).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('수정본')
  for (const name of ['다른 이름으로 저장', '원본 교체', '저장 안 함', '취소']) {
    await expect(dialog.getByRole('button', { name })).toBeVisible()
  }
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(2)

  await page.getByRole('button', { name: '탭 닫기' }).nth(1).click()
  await dialog.getByRole('button', { name: '저장 안 함' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')
  await expect(page.getByTestId('tab').first()).not.toContainText('원본') // no copies left
})

test('"다른 이름으로 저장" writes the copy to a new file and leaves the original alone', async ({ page }) => {
  await splitSameFile(page)
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc')
  await page.evaluate(() => window.__mock!.queueSaveAs('/w/b.md'))
  await page.getByRole('button', { name: '탭 닫기' }).nth(1).click()
  await page.getByRole('dialog').getByRole('button', { name: '다른 이름으로 저장' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  expect(await fileText(page, '/w/b.md')).toContain('본문abc')
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')
})

test('"원본 교체" overwrites the original only after a second confirmation', async ({ page }) => {
  await splitSameFile(page)
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc')
  await page.getByRole('button', { name: '탭 닫기' }).nth(1).click()
  await page.getByRole('dialog').getByRole('button', { name: '원본 교체' }).click()
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(confirm).toContainText('덮어쓸까요')
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n') // nothing written yet
  await confirm.getByRole('button', { name: '취소' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(2)
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')

  await page.getByRole('button', { name: '탭 닫기' }).nth(1).click()
  await page.getByRole('dialog').getByRole('button', { name: '원본 교체' }).click()
  await confirm.getByRole('button', { name: '덮어쓰기' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  expect(await fileText(page, '/w/a.md')).toContain('본문abc')
  await expect(editorIn(page, 0)).toContainText('본문abc') // the open original shows the new content
})

test('Ctrl+S on a copy asks for a new name and never overwrites the original', async ({ page }) => {
  await splitSameFile(page)
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc')
  await page.evaluate(() => window.__mock!.queueSaveAs(null)) // the user cancels the dialog
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('toast').first()).toBeVisible()
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')
  await expect(page.getByTestId('tab').nth(1)).toContainText('수정본')
})

test('auto-save never writes a copy over the original', async ({ page }) => {
  await splitSameFile(page)
  await changeSettings(page, (d) => d.getByLabel('자동 저장').check())
  await focusEditorAtEnd(page, editorIn(page, 1))
  await page.keyboard.type('abc')
  await page.waitForTimeout(2500)
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')
})

test('the source editor also splits off a copy and keeps typing', async ({ page }) => {
  await splitSameFile(page)
  await page.getByRole('button', { name: '소스 모드' }).click() // the second pane
  const cm = panes(page).nth(1).locator('.cm-content')
  await cm.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('abc')
  await page.keyboard.type('def')
  await expect(cm).toContainText('abcdef')
  await expect(editorIn(page, 0)).not.toContainText('abc')
  await expect(page.getByTestId('tab').nth(1)).toContainText('수정본')
})

test('a single pane edits the file directly, with no copy', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await focusEditorAtEnd(page)
  await page.keyboard.type('abc')
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
  await expect(page.getByTestId('tab')).not.toContainText('수정본')
})
