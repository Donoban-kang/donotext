import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd } from './helpers'

async function start(page: Page, seed: Record<string, string>, open: string): Promise<void> {
  await page.addInitScript((s) => {
    window.__DONOTEXT_SEED__ = s
  }, seed)
  await page.goto('/')
  await page.evaluate((p) => window.__mock!.queueOpen([p]), open)
  await page.getByRole('button', { name: '열기', exact: true }).click()
}

const mockText = (page: Page, path: string): Promise<string | undefined> =>
  page.evaluate((p) => window.__mock!.files.get(p)?.text, path)

test('opening a file shows a named tab with its content and no dirty mark', async ({ page }) => {
  await start(page, { '/w/a.md': '# 제목\n\n본문\n' }, '/w/a.md')
  await expect(page.getByTestId('tab')).toHaveText(/a\.md/)
  await expect(page.locator('.ProseMirror h1')).toHaveText('제목')
  await expect(page.getByTestId('tab-dirty')).toHaveCount(0)
})

test('editing shows the dirty mark and Ctrl/Cmd+S writes the file and clears it', async ({ page }) => {
  await start(page, { '/w/a.md': '# 제목\n\n본문\n' }, '/w/a.md')
  await focusEditorAtEnd(page)
  await page.keyboard.type(' 추가')
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('tab-dirty')).toHaveCount(0)
  expect(await mockText(page, '/w/a.md')).toContain('본문 추가')
})

test('Save As accepts a .txt target and renames the tab', async ({ page }) => {
  await start(page, { '/w/a.md': '# 제목\n' }, '/w/a.md')
  await page.evaluate(() => window.__mock!.queueSaveAs('/w/note.txt'))
  await page.getByRole('button', { name: '다른 이름으로 저장' }).click()
  await expect(page.getByTestId('tab')).toHaveText(/note\.txt/)
  expect(await mockText(page, '/w/note.txt')).toContain('# 제목')
})

test.describe('closing a modified tab', () => {
  async function dirtyDoc(page: Page): Promise<void> {
    await start(page, { '/w/a.md': '# 제목\n\n본문\n' }, '/w/a.md')
    await focusEditorAtEnd(page)
    await page.keyboard.type(' 변경')
    await expect(page.getByTestId('tab-dirty')).toBeVisible()
    await page.getByRole('button', { name: '탭 닫기' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }

  test('cancel keeps the tab', async ({ page }) => {
    await dirtyDoc(page)
    await page.getByRole('button', { name: '취소' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('tab')).toHaveCount(1)
  })

  test('discard closes the tab without writing', async ({ page }) => {
    await dirtyDoc(page)
    await page.getByRole('button', { name: '저장 안 함' }).click()
    await expect(page.getByTestId('tab')).toHaveCount(0)
    await expect(page.getByText('파일을 열거나 새 문서를 만들어 시작하세요.')).toBeVisible()
    expect(await mockText(page, '/w/a.md')).not.toContain('변경')
  })

  test('save writes the file and closes the tab', async ({ page }) => {
    await dirtyDoc(page)
    await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByTestId('tab')).toHaveCount(0)
    expect(await mockText(page, '/w/a.md')).toContain('본문 변경')
  })
})

test('a new untitled document stays modified when the Save As dialog is cancelled', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '새 문서' }).click()
  await expect(page.getByTestId('tab')).toHaveText(/제목 없음 1/)
  await focusEditorAtEnd(page)
  await page.keyboard.type('안녕')
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
})

test('non-markdown files open in source mode and cannot switch to WYSIWYG', async ({ page }) => {
  await start(page, { '/w/data.json': '{"a": 1}' }, '/w/data.json')
  await expect(page.locator('.cm-content')).toContainText('"a": 1')
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'WYSIWYG 모드' })).toBeDisabled()
})
