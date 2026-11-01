import { expect, test } from '@playwright/test'
import { changeSettings, openSeed } from './helpers'

test('typing in the editor does not draw an input-style box around the page', async ({ page }) => {
  await openSeed(page, {})
  await page.getByRole('button', { name: '새 문서' }).click()
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.type('abc')
  const outline = await editor.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('none')
})

test('source editor shows no focus box either', async ({ page }) => {
  await openSeed(page, {})
  await page.getByRole('button', { name: '새 문서' }).click()
  await page.getByRole('button', { name: '소스 모드' }).click()
  const content = page.locator('.cm-content').first()
  await content.click()
  const outline = await content.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('none')
})

test('focus mode: selecting text or special blocks never draws a focus frame inside the editor', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '---\ntitle: x\n---\n\n# 제목\n\n문단 $a^2$ 입니다.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] 할 일\n\n끝 문단\n' }, ['/w/a.md'])
  await changeSettings(page, (d) => d.getByLabel('집중 모드').check())
  const framed = (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('.dn-editor-wrap, .dn-editor-wrap *')]
        .filter((e) => getComputedStyle(e).outlineStyle !== 'none' && parseFloat(getComputedStyle(e).outlineWidth) > 0)
        .map((e) => `${e.tagName}.${e.className}`)
    )
  for (const sel of ['.ProseMirror h1', '.ProseMirror pre', '.ProseMirror td', '.ProseMirror li']) {
    await page.locator(sel).first().click({ force: true })
    expect(await framed(), sel).toEqual([])
  }
  await page.keyboard.press('ControlOrMeta+a')
  expect(await framed(), 'select all').toEqual([])
})
