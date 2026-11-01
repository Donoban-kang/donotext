import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

const editor = (page: Page) => page.locator('.ProseMirror').first()
const fileText = (page: Page, path: string) => page.evaluate((p) => window.__mock!.files.get(p)?.text ?? null, path)
const menu = (page: Page) => page.getByTestId('format-menu')
const storeText = (page: Page) =>
  page.evaluate(() => {
    window.__stores!.flushEditors()
    return Object.values(window.__stores!.documents.getState().docs)[0].text
  })

/** Selects the word "word" in a paragraph "a word b". */
async function selectWord(page: Page): Promise<void> {
  // A second double-click right after the first would count as a triple click (whole paragraph).
  await page.waitForTimeout(600)
  await editor(page).locator('p').first().dblclick({ position: { x: 22, y: 8 } })
  await expect(editor(page)).toHaveClass(/ProseMirror-focused/)
  await page.waitForTimeout(80) // ProseMirror re-syncs the DOM selection shortly after focus
}

async function setup(page: Page, md = 'a word b\n'): Promise<void> {
  await openSeed(page, { '/w/a.md': md }, ['/w/a.md'])
  await selectWord(page)
}

async function applyFromMenu(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '서식' }).click()
  await menu(page).getByRole('menuitem', { name }).click()
}

test('the 서식 menu lists every format with its shortcut', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: '서식' }).click()
  const items = menu(page).getByRole('menuitem')
  await expect(items).toHaveCount(12)
  await expect(items.filter({ hasText: '굵게' })).toContainText('Ctrl+B')
  await expect(items.filter({ hasText: '취소선' })).toContainText('Ctrl+D')
  await expect(items.filter({ hasText: '형광펜' })).toContainText('Ctrl+Shift+H')
  await expect(items.filter({ hasText: '서식 지우기' })).toContainText('Ctrl+Shift+R')
  await page.keyboard.press('Escape')
  await expect(menu(page)).toHaveCount(0)
})

test('each inline format from the menu is applied and saved in its markdown form', async ({ page }) => {
  const cases: Array<[string, string, string]> = [
    ['굵게', 'strong', '**word**'],
    ['기울임', 'em', '*word*'],
    ['밑줄', 'u', '<u>word</u>'],
    ['위 첨자', 'sup', '<sup>word</sup>'],
    ['아래 첨자', 'sub', '<sub>word</sub>'],
    ['형광펜', 'mark', '==word=='],
    ['인라인 코드', 'code', '`word`'],
    ['취소선', 's', '~~word~~']
  ]
  for (const [label, tag, md] of cases) {
    await setup(page)
    await applyFromMenu(page, label)
    await expect(editor(page).locator(tag)).toHaveText('word')
    expect(await storeText(page)).toContain(md)
  }
})

test('the keyboard shortcuts apply the same formats', async ({ page }) => {
  const cases: Array<[string, string, string]> = [
    ['ControlOrMeta+b', 'strong', '**word**'],
    ['ControlOrMeta+i', 'em', '*word*'],
    ['ControlOrMeta+u', 'u', '<u>word</u>'],
    ['ControlOrMeta+d', 's', '~~word~~'],
    ['ControlOrMeta+Shift+h', 'mark', '==word=='],
    ['ControlOrMeta+`', 'code', '`word`']
  ]
  for (const [keys, tag, md] of cases) {
    await setup(page)
    await page.keyboard.press(keys)
    await expect(editor(page).locator(tag), keys).toHaveText('word')
    expect(await storeText(page), keys).toContain(md)
  }
})

test('Ctrl+Shift+S still means "save as" and no longer strikes text through', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => window.__mock!.queueSaveAs('/w/other.md'))
  await page.keyboard.press('ControlOrMeta+Shift+s')
  await expect.poll(() => fileText(page, '/w/other.md')).not.toBeNull()
  await expect(editor(page).locator('s')).toHaveCount(0)
})

test('applying a format again removes it', async ({ page }) => {
  await setup(page)
  await page.keyboard.press('ControlOrMeta+b')
  await expect(editor(page).locator('strong')).toHaveText('word')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(editor(page).locator('strong')).toHaveCount(0)
})

test('"서식 지우기" removes all formats from the selection', async ({ page }) => {
  await setup(page, 'a **word** b\n')
  await selectWord(page)
  await page.keyboard.press('ControlOrMeta+u')
  await applyFromMenu(page, '서식 지우기')
  await expect(editor(page).locator('strong, u')).toHaveCount(0)
  expect(await storeText(page)).toContain('a word b')
})

test('inline math turns the selection into a formula', async ({ page }) => {
  await setup(page, 'a x^2 b\n')
  await selectWord(page)
  await page.keyboard.press('ControlOrMeta+Shift+m')
  await expect(editor(page).locator('.dn-math-inline')).toHaveCount(1)
  expect(await storeText(page)).toMatch(/\$[^$]+\$/)
})

test('the link dialog adds, changes and removes a link, and refuses unsafe addresses', async ({ page }) => {
  await setup(page)
  await page.keyboard.press('ControlOrMeta+l')
  const dialog = page.getByRole('dialog', { name: '하이퍼링크' })
  await dialog.getByLabel('주소').fill('javascript:alert(1)')
  await dialog.getByRole('button', { name: '확인' }).click()
  await expect(page.getByTestId('toast').first()).toContainText('링크로 쓸 수 없어요')
  await expect(editor(page).locator('a')).toHaveCount(0)

  await selectWord(page)
  await page.keyboard.press('ControlOrMeta+l')
  await dialog.getByLabel('주소').fill('https://example.com')
  await dialog.getByRole('button', { name: '확인' }).click()
  await expect(editor(page).locator('a')).toHaveText('word')
  expect(await storeText(page)).toContain('[word](https://example.com)')

  await editor(page).locator('a').click()
  await page.keyboard.press('ControlOrMeta+l')
  await expect(dialog.getByLabel('주소')).toHaveValue('https://example.com')
  await dialog.getByLabel('주소').fill('')
  await dialog.getByRole('button', { name: '확인' }).click()
  await expect(editor(page).locator('a')).toHaveCount(0)
  expect(await storeText(page)).not.toContain('example.com')
})

test('a link with nothing selected inserts the address as the text', async ({ page }) => {
  await openSeed(page, { '/w/a.md': 'start\n' }, ['/w/a.md'])
  await focusEditorAtEnd(page)
  await page.keyboard.press('ControlOrMeta+l')
  const dialog = page.getByRole('dialog', { name: '하이퍼링크' })
  await dialog.getByLabel('주소').fill('https://example.com')
  await page.keyboard.press('Enter')
  await expect(editor(page).locator('a')).toHaveText('https://example.com')
})

test('the image item inserts a picture saved next to the document', async ({ page }) => {
  await setup(page)
  await focusEditorAtEnd(page)
  await page.getByRole('button', { name: '서식' }).click()
  const chooser = page.waitForEvent('filechooser')
  await menu(page).getByRole('menuitem', { name: '이미지' }).click()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  await (await chooser).setFiles({ name: 'pic.png', mimeType: 'image/png', buffer: png })
  await expect.poll(() => storeText(page)).toMatch(/!\[\]\(assets\//)
})

test('in source mode the menu and shortcuts write the markdown markers', async ({ page }) => {
  await openSeed(page, { '/w/a.md': 'a word b\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '소스 모드' }).click()
  const cm = page.locator('.cm-content')
  await cm.click()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(cm).toContainText('a **word** b')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(cm).toContainText('a word b')
  await applyFromMenu(page, '형광펜')
  await expect(cm).toContainText('a ==word== b')
  await applyFromMenu(page, '위 첨자')
  await expect(cm).toContainText('<sup>')
})

test('the menu is unavailable without an open document', async ({ page }) => {
  await openSeed(page, {})
  await expect(page.getByRole('button', { name: '서식' })).toBeDisabled()
})
