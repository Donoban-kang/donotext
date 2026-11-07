import { expect, test, type Page } from '@playwright/test'
import { openSeed } from './helpers'

/** Fires drag events at `selector` as the browser would for files dragged in from the file manager. */
async function dropFiles(page: Page, paths: string[], selector = '.dn-pane-body', finish = true): Promise<void> {
  await page.evaluate(
    ({ paths, selector, finish }) => {
      window.__mock!.queueDrop(paths)
      const dt = new DataTransfer()
      for (const p of paths) dt.items.add(new File(['x'], p.slice(p.lastIndexOf('/') + 1)))
      const target = document.querySelector(selector) ?? document.body
      const fire = (type: string): void => void target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
      fire('dragenter')
      fire('dragover')
      if (finish) fire('drop')
    },
    { paths, selector, finish }
  )
}

const panes = (page: Page) => page.locator('.dn-pane')

test('dragging files over the window shows the hint, and leaving hides it', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '본문\n' })
  await dropFiles(page, ['/w/a.md'], '.dn-pane-body', false)
  await expect(page.getByTestId('drop-overlay')).toBeVisible()
  const overlay = page.getByTestId('drop-overlay')
  await expect(overlay).toContainText('여기에 놓으면 donotext로 열려요')
  await expect(overlay.locator('.dn-drop-badge')).toHaveText(['.md', '.markdown', '.txt', '.json', '.pdf', '.docx', '.xlsx', '.pptx', '폴더'])
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(new File(['x'], 'a.md'))
    document.querySelector('.dn-pane-body')!.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.getByTestId('drop-overlay')).toHaveCount(0)
})

test('dropping a markdown file and a json file opens them in WYSIWYG and source mode', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# 제목\n', '/w/data.json': '{"a": 1}\n' })
  await dropFiles(page, ['/w/a.md', '/w/data.json'])
  await expect(page.getByTestId('tab')).toHaveCount(2)
  await expect(page.getByTestId('drop-overlay')).toHaveCount(0)
  await expect(page.getByTestId('tab').first()).toContainText('a.md')
  await page.getByTestId('tab').first().click()
  await expect(page.locator('.ProseMirror h1')).toHaveText('제목')
  await page.getByTestId('tab').nth(1).click()
  await expect(page.locator('.cm-content')).toContainText('"a": 1')
})

test('an empty new document is replaced by the dropped file, a typed one is kept', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# A\n', '/w/b.md': '# B\n' })
  await page.getByRole('button', { name: '새 문서' }).click()
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await dropFiles(page, ['/w/a.md'])
  await expect(page.getByTestId('tab')).toHaveCount(1)
  await expect(page.getByTestId('tab').first()).toContainText('a.md')

  await page.getByRole('button', { name: '새 문서' }).click()
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type('메모')
  await dropFiles(page, ['/w/b.md'])
  await expect(page.getByTestId('tab')).toHaveCount(3) // a.md, the typed document, b.md
})

test('a dropped folder opens in the sidebar tree', async ({ page }) => {
  await openSeed(page, { '/w/notes/a.md': '본문\n', '/w/notes/b.txt': 'x\n' })
  await dropFiles(page, ['/w/notes'])
  const tree = page.getByRole('tree')
  await expect(tree.getByRole('button', { name: 'a.md', exact: true })).toBeVisible()
  await expect(tree.getByRole('button', { name: 'b.txt', exact: true })).toBeVisible()
  await expect(page.getByTestId('tab')).toHaveCount(0)
})

test('a binary file is refused with a notice and does not become a tab', async ({ page }) => {
  await openSeed(page, { '/w/pic.png': 'PNG\u0000\u0001', '/w/a.md': '본문\n' })
  await dropFiles(page, ['/w/pic.png', '/w/a.md'])
  await expect(page.getByTestId('toast').first()).toContainText('pic.png')
  await expect(page.getByTestId('tab')).toHaveCount(1)
})

test('the file opens in the pane it was dropped on', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# A\n', '/w/b.md': '# B\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await expect(panes(page)).toHaveCount(2)
  await dropFiles(page, ['/w/b.md'], '[data-testid^="pane-"]:first-of-type .dn-pane-body')
  await expect(panes(page).nth(0).getByTestId('tab')).toHaveCount(2)
  await expect(panes(page).nth(1).getByTestId('tab')).toHaveCount(1)
})

test('moving a tab between panes is not mistaken for a file drop', async ({ page }) => {
  await openSeed(page, { '/w/a.md': '# A\n' }, ['/w/a.md'])
  await page.getByRole('button', { name: '좌우 분할' }).click()
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('application/x-donotext-tab', '{}')
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.getByTestId('drop-overlay')).toHaveCount(0)
})

test('a dropped UTF-16 or CP949 text file opens editable, shows its encoding, and is saved in the same encoding', async ({ page }) => {
  await openSeed(page, {})
  await page.evaluate(() => {
    window.__mock!.files.set('/w/eula.txt', { text: '라이선스 약관\n', eol: 'crlf', bom: true, encoding: 'utf-16le' })
    window.__mock!.files.set('/w/korean.txt', { text: '안녕하세요\n', eol: 'crlf', bom: false, encoding: 'cp949' })
  })
  await dropFiles(page, ['/w/eula.txt', '/w/korean.txt'])
  await expect(page.getByTestId('tab')).toHaveCount(2)
  await expect(page.getByTestId('doc-warning')).toHaveCount(0) // no "not UTF-8, read-only" banner

  const tab = (name: string) => page.getByTestId('tab').filter({ hasText: name })
  const encodingOf = async (name: string) => {
    await tab(name).hover()
    const card = page.getByTestId('tab-stats')
    await expect(card).toBeVisible()
    const value = await card.locator('div', { hasText: '인코딩' }).locator('dd').innerText()
    await page.mouse.move(700, 500)
    return value
  }
  expect(await encodingOf('eula.txt')).toBe('UTF-16 LE (BOM)')
  expect(await encodingOf('korean.txt')).toBe('한국어 (CP949)')

  await tab('eula.txt').click()
  await page.locator('.cm-content, .ProseMirror').first().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('추가')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => page.evaluate(() => window.__mock!.files.get('/w/eula.txt')?.text)).toContain('추가')
  const saved = await page.evaluate(() => window.__mock!.files.get('/w/eula.txt'))
  expect([saved!.encoding, saved!.bom, saved!.eol]).toEqual(['utf-16le', true, 'crlf'])
})
