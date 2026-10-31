import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

const panes = (page: Page) => page.locator('.dn-pane')
const editorIn = (page: Page, n: number) => panes(page).nth(n).locator('.ProseMirror')
const lines = Array.from({ length: 80 }, (_, i) => `줄 ${i}\n`).join('\n')

test.describe('splitting', () => {
  test('split right creates a second pane that shows the same file and takes focus', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '좌우 분할' }).click()
    await expect(panes(page)).toHaveCount(2)
    await expect(editorIn(page, 0)).toContainText('본문')
    await expect(editorIn(page, 1)).toContainText('본문')
    await expect(panes(page).nth(1)).toHaveClass(/active/)
  })

  test('split down stacks the panes vertically', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '상하 분할' }).click()
    const a = await panes(page).nth(0).boundingBox()
    const b = await panes(page).nth(1).boundingBox()
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 2)
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(2)
  })

  test('the keyboard shortcut Ctrl/Cmd+\\ splits', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
    await page.keyboard.press('ControlOrMeta+\\')
    await expect(panes(page)).toHaveCount(2)
  })

  test('the 7th pane is refused with a message and the layout stays at six', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '좌우 분할' }).click()
    await expect(panes(page)).toHaveCount(6)
    await page.getByRole('button', { name: '상하 분할' }).click()
    await expect(panes(page)).toHaveCount(6)
    await expect(page.getByTestId('toast')).toContainText('최대 6개')
  })

  test('the last pane cannot be closed', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
    await expect(page.getByRole('button', { name: '창 닫기' })).toBeDisabled()
    await page.keyboard.press('ControlOrMeta+Alt+w')
    await expect(panes(page)).toHaveCount(1)
    await expect(page.getByTestId('tab')).toHaveCount(1)
  })

  test('closing a pane keeps documents that other panes still show', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '좌우 분할' }).click()
    await page.getByRole('button', { name: '창 닫기' }).click()
    await expect(panes(page)).toHaveCount(1)
    await expect(editorIn(page, 0)).toContainText('본문')
  })

  test('Ctrl/Cmd+Alt+Arrow moves focus between panes', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '좌우 분할' }).click()
    await expect(panes(page).nth(1)).toHaveClass(/active/)
    await page.keyboard.press('ControlOrMeta+Alt+ArrowLeft')
    await expect(panes(page).nth(0)).toHaveClass(/active/)
    await page.keyboard.press('ControlOrMeta+Alt+ArrowRight')
    await expect(panes(page).nth(1)).toHaveClass(/active/)
  })
})

test.describe('same file in two panes', () => {
  test('typing in one pane updates the other without losing the caret', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '좌우 분할' }).click()
    await focusEditorAtEnd(page, editorIn(page, 1))
    await page.keyboard.type('abc')
    await expect(editorIn(page, 0)).toContainText('본문abc')
    await page.keyboard.type('def') // the caret must still be in pane 2, after "abc"
    await expect(editorIn(page, 1)).toContainText('본문abcdef')
    await expect(editorIn(page, 0)).toContainText('본문abcdef')
    await expect(page.getByTestId('tab-dirty')).toHaveCount(2)
  })

  test('a remote update waits while an IME composition is active, then applies', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '좌우 분할' }).click()
    // Pane 0 is mid-composition (e.g. typing Hangul)…
    await editorIn(page, 0).evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    // …while the same document is edited in pane 1.
    await focusEditorAtEnd(page, editorIn(page, 1))
    await page.keyboard.type('XYZ')
    await expect(page.getByTestId('tab-dirty').first()).toBeVisible()
    await page.waitForTimeout(300)
    await expect(editorIn(page, 0)).not.toContainText('XYZ')
    await editorIn(page, 0).evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await expect(editorIn(page, 0)).toContainText('본문XYZ')
  })
})

test.describe('resizing', () => {
  async function widths(page: Page): Promise<[number, number]> {
    const a = await panes(page).nth(0).boundingBox()
    const b = await panes(page).nth(1).boundingBox()
    return [a!.width, b!.width]
  }

  test('dragging the divider changes the pane sizes and double-click equalizes them', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '좌우 분할' }).click()
    const [w0a, w0b] = await widths(page)
    expect(Math.abs(w0a - w0b)).toBeLessThan(4)
    const box = (await page.getByTestId('divider').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()
    const [w1a, w1b] = await widths(page)
    expect(w1a).toBeGreaterThan(w0a + 100)
    expect(w1b).toBeLessThan(w0b - 100)
    await page.getByTestId('divider').dblclick()
    const [w2a, w2b] = await widths(page)
    expect(Math.abs(w2a - w2b)).toBeLessThan(4)
  })

  test('the divider can be moved with the keyboard', async ({ page }) => {
    await openSeed(page, { '/w/a.md': '# 제목\n' }, ['/w/a.md'])
    await page.getByRole('button', { name: '좌우 분할' }).click()
    const divider = page.getByTestId('divider')
    await divider.focus()
    const before = Number(await divider.getAttribute('aria-valuenow'))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    expect(Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(before)
    await page.keyboard.press('Enter')
    expect(Number(await divider.getAttribute('aria-valuenow'))).toBe(50)
  })
})

test('a tab can be dragged into another pane', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# A\n', '/w/b.md': '# B\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click() // pane 1 (active) shows a.md
  await page.evaluate(() => window.__mock!.queueOpen(['/w/b.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click() // b.md opens in pane 1
  await expect(panes(page).nth(1).getByTestId('tab')).toHaveCount(2)
  await panes(page).nth(1).getByTestId('tab').filter({ hasText: 'b.md' }).dragTo(panes(page).nth(0).locator('.dn-pane-body'))
  await expect(panes(page).nth(0).getByTestId('tab')).toHaveText([/a\.md/, /b\.md/])
  await expect(panes(page).nth(1).getByTestId('tab')).toHaveText([/a\.md/])
})

test('linked scrolling keeps two panes at the same relative position', async ({ page }) => {
  await openSeed(page, { '/w/long.md': `# 긴 문서\n\n${lines}` }, ['/w/long.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await page.getByRole('button', { name: '스크롤 연동' }).click()
  await expect(page.getByRole('button', { name: '스크롤 연동' })).toHaveAttribute('aria-pressed', 'true')
  const hostIn = (n: number) => panes(page).nth(n).locator('.dn-editor-host')
  await hostIn(0).evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.5
  })
  await expect.poll(() => hostIn(1).evaluate((el) => el.scrollTop)).toBeGreaterThan(50)
  const ratios = await Promise.all([0, 1].map((n) => hostIn(n).evaluate((el) => el.scrollTop / (el.scrollHeight - el.clientHeight))))
  expect(Math.abs(ratios[0] - ratios[1])).toBeLessThan(0.02)
  // Unlinking stops the following.
  await page.getByRole('button', { name: '스크롤 연동' }).click()
  const before = await hostIn(1).evaluate((el) => el.scrollTop)
  await hostIn(0).evaluate((el) => {
    el.scrollTop = 0
  })
  await page.waitForTimeout(200)
  expect(await hostIn(1).evaluate((el) => el.scrollTop)).toBe(before)
})
