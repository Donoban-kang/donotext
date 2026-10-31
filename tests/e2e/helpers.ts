import type { Page } from '@playwright/test'

/**
 * Focus the editor and move the caret to the end of the document.
 * ProseMirror re-syncs the DOM selection ~20ms after focus, so keystrokes sent
 * immediately after a click can be lost; wait for focus to settle first.
 */
export async function focusEditorAtEnd(page: Page, selector = '.ProseMirror'): Promise<void> {
  const editor = page.locator(selector).first()
  await editor.click()
  await page.waitForFunction((sel) => document.querySelector(sel)?.classList.contains('ProseMirror-focused'), selector)
  await page.waitForTimeout(60)
  await page.keyboard.press('ControlOrMeta+End')
}
