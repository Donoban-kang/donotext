import { expect, test, type Page } from '@playwright/test'
import { changeSettings, focusEditorAtEnd, openSeed } from './helpers'

const storeText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    window.__stores!.flushEditors()
    return Object.values(window.__stores!.documents.getState().docs)[0].text
  })

test.describe('math', () => {
  const md = '질량 $E=mc^2$ 입니다.\n\n$$\n\\frac{a}{b}\n$$\n'

  test('renders inline and block formulas with KaTeX and keeps the markdown unchanged', async ({ page }) => {
    await openSeed(page, { '/w/m.md': md }, ['/w/m.md'])
    await expect(page.locator('.ProseMirror .katex')).toHaveCount(2)
    await expect(page.locator('.ProseMirror .katex-display')).toHaveCount(1)
    expect(await storeText(page)).toBe(md)
  })

  test('double-clicking a formula lets you edit its TeX', async ({ page }) => {
    await openSeed(page, { '/w/m.md': md }, ['/w/m.md'])
    await page.locator('.dn-math-inline .katex-html').dblclick()
    const input = page.getByRole('textbox', { name: '수식 입력' })
    await input.fill('x^3')
    await input.press('Enter')
    await expect(page.locator('.dn-math-inline .katex')).toBeVisible()
    expect(await storeText(page)).toContain('$x^3$')
  })

  test('typing $...$ turns into a formula and $$ + space starts a block', async ({ page }) => {
    await openSeed(page, { '/w/m.md': '시작\n' }, ['/w/m.md'])
    await focusEditorAtEnd(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('값 $y^2$')
    await expect(page.locator('.dn-math-inline')).toHaveCount(1)
    expect(await storeText(page)).toContain('$y^2$')
    await page.keyboard.press('Enter')
    await page.keyboard.type('$$ ')
    await expect(page.locator('.dn-math-block')).toHaveCount(1)
  })

  test('prices with dollar signs stay plain text', async ({ page }) => {
    await openSeed(page, { '/w/p.md': '사과 $5 배 $10 입니다\n' }, ['/w/p.md'])
    await expect(page.locator('.dn-math')).toHaveCount(0)
    await expect(page.locator('.ProseMirror')).toContainText('사과 $5 배 $10 입니다')
  })

  test('hostile TeX cannot produce links or scripts', async ({ page }) => {
    await openSeed(page, { '/w/h.md': '$\\href{javascript:alert(1)}{click}$ and $\\htmlClass{x}{y}$\n' }, ['/w/h.md'])
    await expect(page.locator('.ProseMirror a[href^="javascript"]')).toHaveCount(0)
    await expect(page.locator('.ProseMirror script')).toHaveCount(0)
  })
})

test('front matter is shown as a YAML block and kept at the top when saving', async ({ page }) => {
  const md = '---\n제목: 안녕\n태그: [a, b]\n---\n\n# 본문\n\n문단\n'
  await openSeed(page, { '/w/f.md': md }, ['/w/f.md'])
  await expect(page.locator('.ProseMirror pre[data-front-matter]')).toContainText('제목: 안녕')
  await expect(page.locator('.ProseMirror h1')).toHaveText('본문')
  await focusEditorAtEnd(page)
  await page.keyboard.type(' 끝')
  const text = await storeText(page)
  expect(text.startsWith('---\n제목: 안녕\n태그: [a, b]\n---\n')).toBe(true)
  expect(text).toContain('문단 끝')
})

test('focus mode dims every block except the one with the caret', async ({ page }) => {
  await openSeed(page, { '/w/f.md': '첫째 단락\n\n둘째 단락\n\n셋째 단락\n' }, ['/w/f.md'])
  const opacity = (n: number) => page.locator('.ProseMirror > p').nth(n).evaluate((el) => Number(getComputedStyle(el).opacity))
  expect(await opacity(0)).toBe(1) // mode is off by default
  await changeSettings(page, (d) => d.getByLabel('집중 모드').check())
  await page.locator('.ProseMirror > p').nth(1).click()
  await expect.poll(() => opacity(1)).toBe(1)
  await expect.poll(() => opacity(0)).toBeLessThan(0.6)
  await expect.poll(() => opacity(2)).toBeLessThan(0.6)
  await page.locator('.ProseMirror > p').nth(2).click()
  await expect.poll(() => opacity(2)).toBe(1)
  await expect.poll(() => opacity(1)).toBeLessThan(0.6)
  await changeSettings(page, (d) => d.getByLabel('집중 모드').uncheck())
  await expect.poll(() => opacity(0)).toBe(1)
})

test('typewriter mode keeps the caret line near the vertical centre of the editor', async ({ page }) => {
  const long = Array.from({ length: 80 }, (_, i) => `줄 ${i}\n`).join('\n')
  await openSeed(page, { '/w/t.md': long }, ['/w/t.md'])
  await changeSettings(page, (d) => d.getByLabel('타자기 모드').check())
  await focusEditorAtEnd(page)
  await page.keyboard.type('입력 중')
  const offset = await page.evaluate(() => {
    const host = document.querySelector('.dn-editor-host') as HTMLElement
    const r = host.getBoundingClientRect()
    const rect = getSelection()!.getRangeAt(0).getBoundingClientRect()
    return Math.abs(rect.top + rect.height / 2 - (r.top + r.height / 2))
  })
  expect(offset).toBeLessThan(40)
})
