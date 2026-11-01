import { expect, test, type Page } from '@playwright/test'
import { changeSettings, focusEditorAtEnd, openSettings, openSeed } from './helpers'

const css = (page: Page, selector: string, prop: string): Promise<string> =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

test('a 설정 button sits at the bottom of the sidebar, and Ctrl+, opens the same window', async ({ page }) => {
  await openSeed(page, {})
  const sidebar = await page.getByTestId('sidebar').boundingBox()
  const button = await page.getByRole('button', { name: '설정', exact: true }).boundingBox()
  expect(button!.y).toBeGreaterThan(sidebar!.y + sidebar!.height - 90)
  await page.keyboard.press('ControlOrMeta+,')
  const dialog = page.getByRole('dialog', { name: '설정' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('the toolbar no longer carries the toggles and the theme list', async ({ page }) => {
  await openSeed(page, {})
  for (const name of ['집중 모드', '타자기 모드', '분할 창 동기화', '자동 저장', '테마']) {
    await expect(page.getByLabel(name)).toHaveCount(0)
  }
  const dialog = await openSettings(page)
  for (const name of ['테마', '글꼴 종류', '글자 크기', '줄 간격', '자동 줄 바꿈', '맞춤법 검사', '집중 모드', '타자기 모드', '자동 저장', '저장 지연 시간', '시작할 때 이전 작업 복원', '분할 창 동기화']) {
    await expect(dialog.getByLabel(name, { exact: true }), name).toHaveCount(1)
  }
  await expect(dialog.getByRole('radiogroup', { name: '에디터 폭' }).getByRole('radio')).toHaveText(['좁게', '넓게', '꽉 차게'])
})

test('font size and line height change the text in the WYSIWYG and source editors at once', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await changeSettings(page, async (d) => {
    await d.getByLabel('글자 크기').fill('22')
    await d.getByLabel('줄 간격').fill('1.5')
  })
  expect(await css(page, '.ProseMirror', 'font-size')).toBe('22px')
  expect(parseFloat(await css(page, '.ProseMirror', 'line-height'))).toBeCloseTo(33, 0)
  await page.getByRole('button', { name: '소스 모드' }).click()
  expect(await css(page, '.cm-editor', 'font-size')).toBe('22px')
})

test('font family: serif, monospace and a typed font name', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await changeSettings(page, (d) => d.getByLabel('글꼴 종류').selectOption('serif'))
  expect(await css(page, '.ProseMirror', 'font-family')).toContain('Noto Serif KR')
  await changeSettings(page, (d) => d.getByLabel('글꼴 종류').selectOption('mono'))
  expect(await css(page, '.ProseMirror', 'font-family')).toContain('monospace')
  await changeSettings(page, async (d) => {
    await d.getByLabel('글꼴 종류').selectOption('custom')
    await d.getByLabel('글꼴 이름').fill('D2Coding"; color: red')
  })
  const family = await css(page, '.ProseMirror', 'font-family')
  expect(family).toContain('D2Coding')
  expect(family).not.toContain(';')
  expect(await css(page, '.ProseMirror', 'color')).not.toBe('rgb(255, 0, 0)')
})

test('the font preview follows the settings while the window is open', async ({ page }) => {
  await openSeed(page, {})
  const dialog = await openSettings(page)
  const preview = dialog.getByTestId('font-preview')
  const before = await preview.evaluate((el) => getComputedStyle(el).fontSize)
  await dialog.getByLabel('글자 크기').fill('26')
  expect(await preview.evaluate((el) => getComputedStyle(el).fontSize)).toBe('26px')
  expect(before).toBe('15px')
})

test('editor width: narrow, wide and full', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  const width = async () => (await page.locator('.ProseMirror').first().boundingBox())!.width
  expect(await css(page, '.ProseMirror', 'max-width')).toBe('820px')
  await changeSettings(page, (d) => d.getByRole('radio', { name: '좁게' }).click())
  expect(await css(page, '.ProseMirror', 'max-width')).toBe('680px')
  const narrow = await width()
  await changeSettings(page, (d) => d.getByRole('radio', { name: '꽉 차게' }).click())
  expect(await css(page, '.ProseMirror', 'max-width')).toBe('none')
  expect(await width()).toBeGreaterThan(narrow)
})

test('word wrap off keeps long lines on one line in both editors', async ({ page }) => {
  const long = '긴 줄 '.repeat(120)
  await openSeed(page, { '/w/a.md': long + '\n' }, ['/w/a.md'])
  const lines = () => page.locator('.ProseMirror p').first().evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))
  expect(await lines()).toBeGreaterThan(1)
  await changeSettings(page, (d) => d.getByLabel('자동 줄 바꿈').uncheck())
  expect(await lines()).toBe(1)
  await page.getByRole('button', { name: '소스 모드' }).click()
  await expect(page.locator('.cm-lineWrapping')).toHaveCount(0)
  await changeSettings(page, (d) => d.getByLabel('자동 줄 바꿈').check())
  await expect(page.locator('.cm-lineWrapping')).toHaveCount(1)
})

test('spell checking can be switched off for both editors', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await expect(page.locator('.ProseMirror').first()).toHaveAttribute('spellcheck', 'true')
  await changeSettings(page, (d) => d.getByLabel('맞춤법 검사').uncheck())
  await expect(page.locator('.ProseMirror').first()).toHaveAttribute('spellcheck', 'false')
  await page.getByRole('button', { name: '소스 모드' }).click()
  await expect(page.locator('.cm-content')).toHaveAttribute('spellcheck', 'false')
  await changeSettings(page, (d) => d.getByLabel('맞춤법 검사').check())
  await expect(page.locator('.cm-content')).toHaveAttribute('spellcheck', 'true')
})

test('auto-save delay: the slider is only active with auto-save on, and the delay is honoured', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  const dialog = await openSettings(page)
  await expect(dialog.getByLabel('저장 지연 시간')).toBeDisabled()
  await dialog.getByLabel('자동 저장').check()
  await expect(dialog.getByLabel('저장 지연 시간')).toBeEnabled()
  await dialog.getByLabel('저장 지연 시간').fill('4')
  await expect(dialog.locator('output').filter({ hasText: '4초' })).toBeVisible()
  await dialog.getByRole('button', { name: '닫기' }).click()
  await focusEditorAtEnd(page)
  await page.keyboard.type('x')
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
  await page.waitForTimeout(2500)
  await expect(page.getByTestId('tab-dirty')).toBeVisible() // 2.5 s: not saved yet with a 4 s delay
  await expect(page.getByTestId('tab-dirty')).toHaveCount(0, { timeout: 5000 })
})

test('settings are remembered after a reload and "기본값으로 되돌리기" restores the defaults', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await changeSettings(page, async (d) => {
    await d.getByLabel('글자 크기').fill('20')
    await d.getByLabel('시작할 때 이전 작업 복원').uncheck()
    await d.getByRole('radio', { name: '좁게' }).click()
  })
  await page.reload()
  const dialog = await openSettings(page)
  await expect(dialog.getByLabel('글자 크기')).toHaveValue('20')
  await expect(dialog.getByLabel('시작할 때 이전 작업 복원')).not.toBeChecked()
  await expect(dialog.getByRole('radio', { name: '좁게' })).toHaveAttribute('aria-checked', 'true')
  await dialog.getByRole('button', { name: '기본값으로 되돌리기' }).click()
  await expect(dialog.getByLabel('글자 크기')).toHaveValue('15')
  await expect(dialog.getByLabel('시작할 때 이전 작업 복원')).toBeChecked()
  await expect(dialog.getByRole('radio', { name: '넓게' })).toHaveAttribute('aria-checked', 'true')
})
