import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

const panes = (page: Page) => page.locator('.dn-pane')

async function split(page: Page): Promise<void> {
  await openSeed(page, { '/w/a.md': '본문\n', '/w/b.md': '다른\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await expect(panes(page)).toHaveCount(2)
}

test('closing the only tab of a split pane with its X button closes the pane and leaves no hover card behind', async ({ page }) => {
  await split(page)
  const tab = panes(page).nth(1).getByTestId('tab')
  await tab.hover()
  await expect(page.getByTestId('tab-stats')).toBeVisible()
  await tab.getByRole('button', { name: '탭 닫기' }).click()
  await expect(panes(page)).toHaveCount(1)
  await expect(page.getByTestId('tab-stats')).toHaveCount(0)
  await expect(page.getByTestId('divider')).toHaveCount(0)
  await expect(panes(page).first().locator('.ProseMirror')).toContainText('본문')
})

test('the hover card also disappears when a tab is closed from the keyboard or menu', async ({ page }) => {
  await split(page)
  const tab = panes(page).nth(1).getByTestId('tab')
  await tab.hover()
  await expect(page.getByTestId('tab-stats')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+w')
  await expect(page.getByTestId('tab-stats')).toHaveCount(0)
  await expect(panes(page)).toHaveCount(1)
})

test('a pane with several tabs stays open until its last tab is closed', async ({ page }) => {
  await split(page)
  await page.evaluate(() => window.__mock!.queueOpen(['/w/b.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click() // opens b.md in the active (right) pane
  await expect(panes(page).nth(1).getByTestId('tab')).toHaveCount(2)
  await panes(page).nth(1).getByTestId('tab').first().getByRole('button', { name: '탭 닫기' }).click()
  await expect(panes(page)).toHaveCount(2)
  await panes(page).nth(1).getByTestId('tab').first().getByRole('button', { name: '탭 닫기' }).click()
  await expect(panes(page)).toHaveCount(1)
})

test('the last pane stays open and shows the empty message', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' }, ['/w/a.md'])
  await page.getByTestId('tab').first().getByRole('button', { name: '탭 닫기' }).click()
  await expect(panes(page)).toHaveCount(1)
  await expect(page.getByText('파일을 열거나 새 문서를 만들어 시작하세요.')).toBeVisible()
})

test('closing a modified copy still asks first; cancelling keeps the pane', async ({ page }) => {
  await split(page)
  await focusEditorAtEnd(page, panes(page).nth(1).locator('.ProseMirror'))
  await page.keyboard.type('abc')
  await panes(page).nth(1).getByTestId('tab').getByRole('button', { name: '탭 닫기' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('수정본')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(panes(page)).toHaveCount(2)
  await panes(page).nth(1).getByTestId('tab').getByRole('button', { name: '탭 닫기' }).click()
  await dialog.getByRole('button', { name: '저장 안 함' }).click()
  await expect(panes(page)).toHaveCount(1)
})

test('"창 닫기" and the tab context menu close the pane the same way', async ({ page }) => {
  await split(page)
  await panes(page).nth(1).getByTestId('tab').click({ button: 'right' })
  await page.getByTestId('tab-menu').getByRole('menuitem', { name: '닫기' }).click()
  await expect(panes(page)).toHaveCount(1)
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await expect(panes(page)).toHaveCount(2)
  await page.getByRole('button', { name: '창 닫기' }).click()
  await expect(panes(page)).toHaveCount(1)
})

test('dragging the only tab of a pane into the other pane closes the emptied pane', async ({ page }) => {
  await split(page)
  await panes(page).nth(1).getByTestId('tab').dragTo(panes(page).nth(0).locator('.dn-tabbar'))
  await expect(panes(page)).toHaveCount(1)
})
