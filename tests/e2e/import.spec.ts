import { expect, test, type Page } from '@playwright/test'
import { openSeed } from './helpers'

const outcome = {
  ok: true,
  format: 'docx',
  baseName: '보고서',
  markdown: '# 점검 결과\n\n| 구분 | 값 |\n| --- | --- |\n| 가 | 1 |\n\n- 첫째\n- 둘째\n',
  warnings: [{ code: 'imagesSkipped', count: 2 }],
  stats: { chars: 60, headings: 1, tables: 1, listItems: 2 }
}

async function dropFile(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.__mock!.queueDrop([p])
    const dt = new DataTransfer()
    dt.items.add(new File(['x'], p.slice(p.lastIndexOf('/') + 1)))
    const target = document.querySelector('.dn-pane-body') ?? document.body
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, path)
}

test('the import button opens the converted document as a new unsaved tab with its structure', async ({ page }) => {
  await openSeed(page, {})
  await page.evaluate((o) => window.__mock!.queueImport(o as never), outcome)
  await page.getByTestId('import-doc').click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await expect(page.getByTestId('tab').first()).toContainText('보고서.md')
  await expect(page.locator('.ProseMirror h1')).toHaveText('점검 결과')
  await expect(page.locator('.ProseMirror table th').first()).toHaveText('구분')
  await expect(page.locator('.ProseMirror ul li')).toHaveText(['첫째', '둘째'])
  const toasts = page.locator('.dn-toast')
  await expect(toasts.first()).toContainText('"보고서"을(를) 마크다운으로 가져왔어요. (제목 1 · 표 1 · 목록 2 · 60자)')
  await expect(toasts.nth(1)).toContainText('그림 2개는 가져오지 않았어요.')
})

test('a cancelled picker changes nothing', async ({ page }) => {
  await openSeed(page, {})
  await page.getByTestId('import-doc').click()
  await expect(page.getByTestId('tab')).toHaveCount(0)
  await expect(page.locator('.dn-toast')).toHaveCount(0)
})

test('a dropped PDF is converted: progress notice, result tab, and the compare-with-original reminder', async ({ page }) => {
  await openSeed(page, {})
  await page.evaluate((o) => window.__mock!.queueImport({ ...(o as object), format: 'pdf', baseName: '공문' } as never), outcome)
  await dropFile(page, '/w/공문.pdf')
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await expect(page.getByTestId('tab').first()).toContainText('공문.md')
  const calls = await page.evaluate(() => window.__mock!.importCalls)
  expect(calls).toEqual(['/w/공문.pdf'])
  await expect(page.locator('.dn-toast').filter({ hasText: '원본과 한 번 비교해 보세요' })).toHaveCount(1)
})

test('a file that cannot be converted gets a clear message naming it', async ({ page }) => {
  await openSeed(page, {})
  await page.evaluate(() => window.__mock!.queueImport({ ok: false, code: 'encrypted', name: '비밀.pdf' }))
  await dropFile(page, '/w/비밀.pdf')
  await expect(page.locator('.dn-toast').filter({ hasText: '"비밀.pdf"은(는) 암호가 걸려 있어서 가져오지 못했어요.' })).toHaveCount(1)
  await expect(page.getByTestId('tab')).toHaveCount(0)
})

test('the converted document is unsaved: closing its tab asks whether to save', async ({ page }) => {
  await openSeed(page, {})
  await page.evaluate((o) => window.__mock!.queueImport(o as never), outcome)
  await page.getByTestId('import-doc').click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await page.getByTestId('tab').first().hover()
  await page.getByTestId('tab').first().getByRole('button', { name: /닫기/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
