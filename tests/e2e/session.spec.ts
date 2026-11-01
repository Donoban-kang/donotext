import { expect, test, type Page } from '@playwright/test'
import { changeSettings, focusEditorAtEnd } from './helpers'

const session = {
  version: 1 as const,
  layout: {
    type: 'split' as const,
    id: 'split-9',
    dir: 'row' as const,
    sizes: [0.5, 0.5],
    children: [
      { type: 'leaf' as const, id: 'leaf-8', tabs: [{ kind: 'doc' as const, docId: 'old-a', view: 'wysiwyg' as const }], active: 0 },
      { type: 'leaf' as const, id: 'leaf-9', tabs: [{ kind: 'doc' as const, docId: 'old-u', view: 'wysiwyg' as const }], active: 0 }
    ]
  },
  docs: [
    { id: 'old-a', path: '/w/a.md' },
    { id: 'old-u', path: null }
  ],
  folder: '/w',
  activeLeafId: 'leaf-9',
  recent: ['/w/a.md', '/w/b.md']
}

async function boot(page: Page, withSession: boolean): Promise<void> {
  await page.addInitScript(
    ([s, sess, backups]) => {
      window.__DONOTEXT_SEED__ = s as Record<string, string>
      if (sess) {
        window.__DONOTEXT_SESSION__ = sess as never
        window.__DONOTEXT_BACKUPS__ = backups as Record<string, string>
      }
    },
    [{ '/w/a.md': '# 제목 A\n', '/w/b.md': '# B\n' }, withSession ? session : null, { 'old-u': '저장하지 않은 메모', 'old-a': '# 제목 A 수정\n' }] as const
  )
  await page.goto('/')
}

test('restores panes, open files, unsaved edits and the recent list from the previous session', async ({ page }) => {
  await boot(page, true)
  await expect(page.getByTestId('tab')).toHaveCount(2)
  await expect(page.locator('.dn-pane')).toHaveCount(2)
  await expect(page.locator('.ProseMirror').first()).toContainText('제목 A 수정')
  await expect(page.locator('.ProseMirror').nth(1)).toContainText('저장하지 않은 메모')
  await expect(page.getByTestId('tab-dirty')).toHaveCount(2)
  await expect(page.getByRole('status')).toContainText('복구')
  await expect(page.locator('.dn-pane.active')).toContainText('저장하지 않은 메모')
  const options = await page.getByLabel('최근 파일').locator('option').allTextContents()
  expect(options).toEqual(['최근 파일', 'a.md', 'b.md'])
})

test('starts empty when there is no previous session', async ({ page }) => {
  await boot(page, false)
  await expect(page.getByText('파일을 열거나 새 문서를 만들어 시작하세요.')).toBeVisible()
})

test('the recent-files list opens a file', async ({ page }) => {
  await boot(page, true)
  await page.getByLabel('최근 파일').selectOption('/w/b.md')
  await expect(page.getByTestId('tab').filter({ hasText: 'b.md' })).toBeVisible()
})

test('auto save writes a modified file shortly after the last edit once enabled', async ({ page }) => {
  await boot(page, false)
  await page.evaluate(() => window.__mock!.queueOpen(['/w/a.md']))
  await page.getByRole('button', { name: '열기', exact: true }).click()
  await changeSettings(page, (d) => d.getByLabel('자동 저장').check())
  await focusEditorAtEnd(page)
  await page.keyboard.type(' 자동')
  await expect(page.getByTestId('tab-dirty')).toBeVisible()
  await expect(page.getByTestId('tab-dirty')).toHaveCount(0, { timeout: 6000 })
  expect(await page.evaluate(() => window.__mock!.files.get('/w/a.md')!.text)).toContain('자동')
})

test.describe('changes made outside the app', () => {
  test('an unmodified document reloads silently', async ({ page }) => {
    await boot(page, false)
    await page.evaluate(() => window.__mock!.queueOpen(['/w/a.md']))
    await page.getByRole('button', { name: '열기', exact: true }).click()
    await page.evaluate(() => {
      window.__mock!.files.set('/w/a.md', { text: '# 바깥에서 수정\n', eol: 'lf', bom: false })
      window.__mock!.emitChange({ path: '/w/a.md', kind: 'change' })
    })
    await expect(page.locator('.ProseMirror h1')).toHaveText('바깥에서 수정')
    await expect(page.getByTestId('external-banner')).toHaveCount(0)
  })

  test('a modified document shows a banner offering reload or keeping its own text', async ({ page }) => {
    await boot(page, false)
    await page.evaluate(() => window.__mock!.queueOpen(['/w/a.md']))
    await page.getByRole('button', { name: '열기', exact: true }).click()
    await focusEditorAtEnd(page)
    await page.keyboard.type(' 내 편집')
    await expect(page.getByTestId('tab-dirty')).toBeVisible()
    await page.evaluate(() => {
      window.__mock!.files.set('/w/a.md', { text: '# 디스크 버전\n', eol: 'lf', bom: false })
      window.__mock!.emitChange({ path: '/w/a.md', kind: 'change' })
    })
    const banner = page.getByTestId('external-banner')
    await expect(banner).toContainText('디스크에서 파일이 변경되었습니다')
    await expect(page.locator('.ProseMirror')).toContainText('내 편집')
    await banner.getByRole('button', { name: '다시 불러오기' }).click()
    await expect(page.locator('.ProseMirror h1')).toHaveText('디스크 버전')
    await expect(banner).toHaveCount(0)
  })

  test('a deleted file keeps its content and says so', async ({ page }) => {
    await boot(page, false)
    await page.evaluate(() => window.__mock!.queueOpen(['/w/a.md']))
    await page.getByRole('button', { name: '열기', exact: true }).click()
    await page.evaluate(() => {
      window.__mock!.files.delete('/w/a.md')
      window.__mock!.emitChange({ path: '/w/a.md', kind: 'unlink' })
    })
    await expect(page.getByTestId('external-banner')).toContainText('삭제되었거나 이동')
    await expect(page.locator('.ProseMirror h1')).toHaveText('제목 A')
  })

  test('the folder tree refreshes when a file appears on disk', async ({ page }) => {
    await boot(page, false)
    await page.evaluate(() => window.__mock!.queueFolder('/w'))
    await page.getByRole('button', { name: '폴더 열기' }).click()
    await expect(page.getByRole('tree').getByRole('button', { name: 'new.md', exact: true })).toHaveCount(0)
    await page.evaluate(() => {
      window.__mock!.files.set('/w/new.md', { text: '', eol: 'lf', bom: false })
      window.__mock!.emitChange({ path: '/w/new.md', kind: 'add' })
    })
    await expect(page.getByRole('tree').getByRole('button', { name: 'new.md', exact: true })).toBeVisible()
  })
})
