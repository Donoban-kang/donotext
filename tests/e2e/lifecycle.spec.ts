import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

const responses = (page: Page): Promise<boolean[]> => page.evaluate(() => window.__mock!.closeResponses)
const fileText = (page: Page, path: string): Promise<string | undefined> => page.evaluate((p) => window.__mock!.files.get(p)?.text, path)

async function dirtyDocument(page: Page): Promise<void> {
  await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, ['/w/a.md'])
  await focusEditorAtEnd(page)
  await page.keyboard.type(' 마지막 입력')
}

test('closing with nothing unsaved is allowed straight away', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
  await page.evaluate(() => window.__mock!.requestClose())
  await expect.poll(() => responses(page)).toEqual([true])
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the last keystrokes count: closing right after typing still asks to save', async ({ page }) => {
  await dirtyDocument(page) // no waiting for the editor debounce on purpose
  await page.evaluate(() => window.__mock!.requestClose())
  await expect(page.getByRole('dialog')).toContainText('a.md')
})

test('cancel keeps the window open and the text untouched', async ({ page }) => {
  await dirtyDocument(page)
  await page.evaluate(() => window.__mock!.requestClose())
  await page.getByRole('button', { name: '취소' }).click()
  await expect.poll(() => responses(page)).toEqual([false])
  await expect(page.locator('.ProseMirror')).toContainText('마지막 입력')
})

test('save writes the file, then allows closing', async ({ page }) => {
  await dirtyDocument(page)
  await page.evaluate(() => window.__mock!.requestClose())
  await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click()
  await expect.poll(() => responses(page)).toEqual([true])
  expect(await fileText(page, '/w/a.md')).toContain('본문 마지막 입력')
})

test('discard leaves the file alone, allows closing and does not leave a backup behind', async ({ page }) => {
  await dirtyDocument(page)
  await page.evaluate(() => window.__mock!.requestClose())
  await page.getByRole('button', { name: '저장 안 함' }).click()
  await expect.poll(() => responses(page)).toEqual([true])
  expect(await fileText(page, '/w/a.md')).toBe('# 제목\n\n본문\n')
  await expect(page.getByTestId('tab-dirty')).toHaveCount(0)
  await page.waitForTimeout(2600) // longer than the after-edit backup delay
  expect(await page.evaluate(() => window.__mock!.files.size)).toBe(1)
})

test('asking twice does not stack prompts', async ({ page }) => {
  await dirtyDocument(page)
  await page.evaluate(() => {
    window.__mock!.requestClose()
    window.__mock!.requestClose()
  })
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.getByRole('button', { name: '취소' }).click()
  await expect.poll(() => responses(page)).toEqual([false])
})

test('files handed over by the OS open in tabs, at startup and later', async ({ page }) => {
  await page.addInitScript(() => {
    window.__DONOTEXT_SEED__ = { '/w/first.md': '# 첫째\n', '/w/한글 폴더/둘째 문서.md': '# 둘째\n' }
    window.__DONOTEXT_OPEN_PATHS__ = ['/w/first.md']
  })
  await page.goto('/')
  await expect(page.getByTestId('tab')).toHaveText([/first\.md/])
  await page.evaluate(() => window.__mock!.pushOpenPaths(['/w/한글 폴더/둘째 문서.md']))
  await expect(page.getByTestId('tab')).toHaveText([/first\.md/, /둘째 문서\.md/])
})
