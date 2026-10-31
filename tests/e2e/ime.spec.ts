import { expect, test, type Page } from '@playwright/test'
import { focusEditorAtEnd, openSeed } from './helpers'

// These tests drive a REAL IME composition (compositionstart/update/end with composed text) through CDP.
const panes = (page: Page) => page.locator('.dn-pane')

async function setup(page: Page): Promise<void> {
  await openSeed(page, { '/w/a.md': '# 제목\n\n본문\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await expect(panes(page)).toHaveCount(2)
}

const remoteEdit = (page: Page, append: string): Promise<void> =>
  page.evaluate((extra) => {
    const s = window.__stores!.documents.getState()
    const d = Object.values(s.docs)[0]
    s.setText(d.id, d.text.replace(/\n*$/, '\n') + extra, 'another-window')
  }, append)

const storeText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    window.__stores!.flushEditors()
    return Object.values(window.__stores!.documents.getState().docs)[0].text
  })

test('Hangul composed while another pane changes the same document is kept, and the other change arrives too', async ({ page }) => {
  await setup(page)
  const ed0 = panes(page).nth(0).locator('.ProseMirror')
  const ed1 = panes(page).nth(1).locator('.ProseMirror')
  await focusEditorAtEnd(page, ed0)
  const ime = await page.context().newCDPSession(page)
  await ime.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 })
  await remoteEdit(page, '\n원격 문단\n') // arrives mid-composition
  await ime.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 })
  await ime.send('Input.insertText', { text: '한' }) // commit
  for (const ed of [ed0, ed1]) {
    await expect(ed).toContainText('본문한')
    await expect(ed).toContainText('원격 문단')
  }
  const text = await storeText(page)
  expect(text).toContain('본문한')
  expect(text).toContain('원격 문단')
})

test('without any remote change the composed text simply stays', async ({ page }) => {
  await setup(page)
  const ed0 = panes(page).nth(0).locator('.ProseMirror')
  await focusEditorAtEnd(page, ed0)
  const ime = await page.context().newCDPSession(page)
  await ime.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 })
  await ime.send('Input.insertText', { text: '가' })
  await expect(panes(page).nth(1).locator('.ProseMirror')).toContainText('본문가')
})

test('when both sides changed the same line, the composed text wins and the user is told', async ({ page }) => {
  await setup(page)
  const ed0 = panes(page).nth(0).locator('.ProseMirror')
  await focusEditorAtEnd(page, ed0)
  const ime = await page.context().newCDPSession(page)
  await ime.send('Input.imeSetComposition', { text: 'ㄴ', selectionStart: 1, selectionEnd: 1 })
  await page.evaluate(() => {
    const s = window.__stores!.documents.getState()
    const d = Object.values(s.docs)[0]
    s.setText(d.id, d.text.replace('본문', '본문 원격수정'), 'another-window')
  })
  await ime.send('Input.insertText', { text: '나' })
  await expect(ed0).toContainText('본문나')
  await expect(page.getByTestId('toast')).toContainText('충돌')
  expect(await storeText(page)).toContain('본문나')
})

test('the same holds in the source editor', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: '소스 모드' }).click() // the focused (second) pane switches to source
  const cm = panes(page).nth(1).locator('.cm-content')
  const other = panes(page).nth(0).locator('.ProseMirror')
  await cm.click()
  await page.keyboard.press('ControlOrMeta+End')
  const ime = await page.context().newCDPSession(page)
  await ime.send('Input.imeSetComposition', { text: 'ㅎ', selectionStart: 1, selectionEnd: 1 })
  await remoteEdit(page, '\n원격 문단\n')
  await ime.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 })
  await ime.send('Input.insertText', { text: '한' })
  await expect(cm).toContainText('한')
  await expect(cm).toContainText('원격 문단')
  await expect(other).toContainText('원격 문단')
  const text = await storeText(page)
  expect(text).toContain('한')
  expect(text).toContain('원격 문단')
})
