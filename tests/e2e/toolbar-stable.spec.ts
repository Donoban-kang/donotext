import { expect, test } from '@playwright/test'
import { openSeed } from './helpers'

test('switching between source and WYSIWYG mode does not move anything in the toolbar', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  const positions = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.dn-toolbar > *')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]
      })
    )
  const wysiwyg = await positions()
  await page.getByRole('button', { name: '소스 모드' }).click()
  await expect(page.getByRole('button', { name: 'WYSIWYG 모드' })).toBeVisible()
  const source = await positions()
  expect(source).toEqual(wysiwyg)
  await page.getByRole('button', { name: 'WYSIWYG 모드' }).click()
  await expect(page.getByRole('button', { name: '소스 모드' })).toBeVisible()
  expect(await positions()).toEqual(wysiwyg)
})

test('the mode button keeps its accessible name (the hidden sizing text is not read out)', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await expect(page.getByRole('button', { name: '소스 모드', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'WYSIWYG 모드' })).toHaveCount(0)
})
