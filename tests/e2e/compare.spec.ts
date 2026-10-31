import { expect, test, type Page } from '@playwright/test'
import { openSeed } from './helpers'

const A = '첫째 줄\n둘째 줄\n셋째 줄\n'
const B = '첫째 줄\n둘째 줄 수정\n셋째 줄\n넷째 줄\n'

async function startCompare(page: Page, seed: Record<string, string>): Promise<void> {
  await openSeed(page, seed, ['/w/a.md', '/w/b.md'])
  await page.getByRole('button', { name: '비교…' }).click()
  await page.getByLabel('왼쪽 문서').selectOption({ label: 'a.md' })
  await page.getByLabel('오른쪽 문서').selectOption({ label: 'b.md' })
  await page.getByRole('button', { name: '비교', exact: true }).click()
  await expect(page.getByTestId('compare-view')).toBeVisible()
}

const docText = (page: Page, name: string): Promise<string | undefined> =>
  page.evaluate((n) => {
    window.__stores!.flushEditors()
    return Object.values(window.__stores!.documents.getState().docs).find((d) => d.name === n)?.text
  }, name)

test('the compare button needs two open documents', async ({ page }) => {
  await openSeed(page, { '/w/a.md': A }, ['/w/a.md'])
  await expect(page.getByRole('button', { name: '비교…' })).toBeDisabled()
})

test('opens a compare tab that highlights changed lines on both sides and counts differences', async ({ page }) => {
  await startCompare(page, { '/w/a.md': A, '/w/b.md': B })
  await expect(page.getByTestId('tab').filter({ hasText: 'a.md ↔ b.md' })).toBeVisible()
  await expect(page.getByTestId('compare-left-name')).toHaveText('a.md')
  await expect(page.getByTestId('compare-right-name')).toHaveText('b.md')
  await expect(page.getByTestId('diff-count')).toHaveText('차이 2개')
  await expect(page.locator('.cm-merge-a .cm-changedLine, .cm-merge-a .cm-deletedLine').first()).toBeVisible()
  await expect(page.locator('.cm-merge-b .cm-changedLine').first()).toBeVisible()
  await expect(page.locator('.cm-merge-b .cm-changedText').first()).toContainText('수정') // word-level highlight
})

test('next/previous difference walks the changes and wraps around', async ({ page }) => {
  await startCompare(page, { '/w/a.md': A, '/w/b.md': B })
  const count = page.getByTestId('diff-count')
  await page.getByRole('button', { name: '다음 차이' }).click()
  await expect(count).toHaveText('차이 2개 · 1/2')
  await page.getByRole('button', { name: '다음 차이' }).click()
  await expect(count).toHaveText('차이 2개 · 2/2')
  await page.getByRole('button', { name: '다음 차이' }).click()
  await expect(count).toHaveText('차이 2개 · 1/2')
  await page.getByRole('button', { name: '이전 차이' }).click()
  await expect(count).toHaveText('차이 2개 · 2/2')
})

test('identical documents report no differences', async ({ page }) => {
  await startCompare(page, { '/w/a.md': A, '/w/b.md': A })
  await expect(page.getByTestId('diff-count')).toHaveText('차이 없음')
  await expect(page.getByRole('button', { name: '다음 차이' })).toBeDisabled()
})

test('comparing a document with itself is not possible', async ({ page }) => {
  await openSeed(page, { '/w/a.md': A, '/w/b.md': B }, ['/w/a.md', '/w/b.md'])
  await page.getByRole('button', { name: '비교…' }).click()
  await page.getByLabel('왼쪽 문서').selectOption({ label: 'a.md' })
  await page.getByLabel('오른쪽 문서').selectOption({ label: 'a.md' })
  await expect(page.getByRole('button', { name: '비교', exact: true })).toBeDisabled()
  await expect(page.getByRole('note')).toContainText('서로 다른')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('editing the right side updates its document, marks it modified and refreshes the diff', async ({ page }) => {
  await startCompare(page, { '/w/a.md': A, '/w/b.md': B })
  const right = page.locator('.cm-merge-b .cm-content')
  await right.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('다섯째 줄')
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
  expect(await docText(page, 'b.md')).toContain('다섯째 줄')
  expect(await docText(page, 'a.md')).toBe(A)
})

test('a merge control copies a change from the left into the right document', async ({ page }) => {
  await startCompare(page, { '/w/a.md': A, '/w/b.md': B })
  await expect(page.getByTestId('diff-count')).toHaveText('차이 2개')
  await page.locator('.cm-merge-revert button').first().click()
  await expect(page.getByTestId('diff-count')).toHaveText('차이 1개')
  const b = await docText(page, 'b.md')
  expect(b).toContain('둘째 줄\n')
  expect(b).not.toContain('수정')
  expect(await docText(page, 'a.md')).toBe(A)
})

test('the merge direction can be reversed to copy from right to left', async ({ page }) => {
  await startCompare(page, { '/w/a.md': A, '/w/b.md': B })
  await page.getByLabel('병합 방향').selectOption('b-to-a')
  await page.locator('.cm-merge-revert button').first().click()
  await expect(page.getByTestId('diff-count')).toHaveText('차이 1개')
  expect(await docText(page, 'a.md')).toContain('둘째 줄 수정')
  expect(await docText(page, 'b.md')).toBe(B)
})

test('closing the compare tab keeps the documents open in their own tabs', async ({ page }) => {
  await startCompare(page, { '/w/a.md': A, '/w/b.md': B })
  await expect(page.getByTestId('tab')).toHaveCount(3)
  await page.getByTestId('tab').filter({ hasText: '↔' }).getByRole('button', { name: '탭 닫기' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
