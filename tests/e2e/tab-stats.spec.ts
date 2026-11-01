import { expect, test } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

const DOC = '# 제목\n\n오늘은 맑음 sunny day\n\n- 항목\n'

test('hovering a document tab shows words, characters, paragraphs and size', async ({ page }) => {
  await openSeed(page, { '/w/a.md': DOC }, ['/w/a.md'])
  const tab = page.getByTestId('tab').first()
  await tab.hover()
  const card = page.getByTestId('tab-stats')
  await expect(card).toBeVisible()
  const row = (label: string) => card.locator('div', { hasText: label }).locator('dd')
  await expect(row('단어 수')).toHaveText('6')
  await expect(row('글자 수 (공백 제외)')).toHaveText('19')
  await expect(row('글자 수 (공백 포함)')).toHaveText('29')
  await expect(row('단락 수')).toHaveText('3')
  await expect(row('파일 크기')).toHaveText('47 Byte')

  await page.mouse.move(600, 500)
  await expect(card).toHaveCount(0)
})

test('the hover card follows edits while it is open', async ({ page }) => {
  await openSeed(page, { '/w/a.md': 'one two' }, ['/w/a.md'])
  await focusEditorAtEnd(page)
  await page.keyboard.type(' three')
  await page.getByTestId('tab').first().hover()
  const card = page.getByTestId('tab-stats')
  await expect(card.locator('div', { hasText: '단어 수' }).locator('dd')).toHaveText('3')
})
