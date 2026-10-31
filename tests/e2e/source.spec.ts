import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd } from './helpers'

async function openSeed(page: Page, seed: Record<string, string>, path: string): Promise<void> {
  await page.addInitScript((s) => {
    window.__DONOTEXT_SEED__ = s
  }, seed)
  await page.goto('/')
  await page.evaluate((p) => window.__mock!.queueOpen([p]), path)
  await page.getByRole('button', { name: '열기', exact: true }).click()
}

const storeText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    window.__stores!.flushEditors()
    return Object.values(window.__stores!.documents.getState().docs)[0].text
  })

test.describe('source mode', () => {
  test('shows the raw markdown and edits flow back to the WYSIWYG view', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, '/w/a.md')
    await page.getByRole('button', { name: '소스 모드' }).click()
    await expect(page.locator('.cm-content')).toContainText('# 제목')
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('추가 줄')
    await expect(page.getByTestId('tab-dirty')).toBeVisible()
    await page.getByRole('button', { name: 'WYSIWYG 모드' }).click()
    await expect(page.locator('.ProseMirror')).toContainText('추가 줄')
  })

  test('opens the CodeMirror search panel with Ctrl/Cmd+F', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, '/w/a.md')
    await page.getByRole('button', { name: '소스 모드' }).click()
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+f')
    await expect(page.locator('.cm-search')).toBeVisible()
  })

  test('WYSIWYG edits are visible in source mode as markdown', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, '/w/a.md')
    await focusEditorAtEnd(page)
    await page.keyboard.type(' 끝')
    await page.getByRole('button', { name: '소스 모드' }).click()
    await expect(page.locator('.cm-content')).toContainText('본문 끝')
  })
})

test.describe('WYSIWYG find and replace', () => {
  const seed = { '/w/f.md': '# 제목\n\n사과 사과 배\n' }

  test('Ctrl/Cmd+F opens the panel and counts matches', async ({ page }) => {
    await openSeed(page, seed, '/w/f.md')
    await focusEditorAtEnd(page)
    await page.keyboard.press('ControlOrMeta+f')
    await expect(page.getByTestId('find-panel')).toBeVisible()
    await page.getByLabel('찾기').fill('사과')
    await expect(page.getByTestId('find-count')).toHaveText('1/2')
    await page.getByRole('button', { name: '다음' }).click()
    await expect(page.getByTestId('find-count')).toHaveText('2/2')
    await expect(page.locator('.dn-search-match')).toHaveCount(2)
  })

  test('Ctrl/Cmd+H replaces all matches and updates the document text', async ({ page }) => {
    await openSeed(page, seed, '/w/f.md')
    await focusEditorAtEnd(page)
    await page.keyboard.press('ControlOrMeta+h')
    await page.getByLabel('찾기').fill('사과')
    await page.getByLabel('바꿀 내용').fill('귤')
    await page.getByRole('button', { name: '모두 바꾸기' }).click()
    await expect(page.locator('.ProseMirror')).toContainText('귤 귤 배')
    expect(await storeText(page)).toContain('귤 귤 배')
  })

  test('Escape closes the panel and clears highlights', async ({ page }) => {
    await openSeed(page, seed, '/w/f.md')
    await focusEditorAtEnd(page)
    await page.keyboard.press('ControlOrMeta+f')
    await page.getByLabel('찾기').fill('사과')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('find-panel')).toHaveCount(0)
    await expect(page.locator('.dn-search-match')).toHaveCount(0)
  })
})
