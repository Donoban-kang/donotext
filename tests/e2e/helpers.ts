import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Focus an editor and move the caret to the end of its document.
 * ProseMirror re-syncs the DOM selection ~20ms after focus, so keystrokes sent
 * immediately after a click can be lost; wait for focus to settle first.
 */
export async function focusEditorAtEnd(page: Page, editor: Locator | string = '.ProseMirror'): Promise<void> {
  const loc = typeof editor === 'string' ? page.locator(editor).first() : editor
  await loc.click()
  await expect(loc).toHaveClass(/ProseMirror-focused/)
  await page.waitForTimeout(60)
  await page.keyboard.press('ControlOrMeta+End')
}

export async function openSeed(page: Page, seed: Record<string, string>, open: string[] = []): Promise<void> {
  await page.addInitScript((s) => {
    window.__DONOTEXT_SEED__ = s
  }, seed)
  await page.goto('/')
  for (const p of open) {
    await page.evaluate((path) => window.__mock!.queueOpen([path]), p)
    await page.getByRole('button', { name: '열기', exact: true }).click()
  }
}

/** Opens the 설정 window from the sidebar and returns it. */
export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '설정' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Opens 설정, runs `change` inside it, and closes it again (changes apply immediately). */
export async function changeSettings(page: Page, change: (dialog: Locator) => Promise<unknown>): Promise<void> {
  const dialog = await openSettings(page)
  await change(dialog)
  await dialog.getByRole('button', { name: '닫기' }).click()
  await expect(dialog).toHaveCount(0)
}

/** Turns on "분할 창 동기화": split panes of one file edit the same text, as they did before edited copies existed. */
export async function enableSplitSync(page: Page): Promise<void> {
  await changeSettings(page, (d) => d.getByLabel('분할 창 동기화').check())
}
