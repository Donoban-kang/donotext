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
