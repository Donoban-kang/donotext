// Renders a Korean official-document look-alike to a picture (scan-sample.png). make-scan-samples.py then wraps
// it into scan-sample.pdf (two scanned pages) and mixed.pdf (a text page, then the scanned page).
// Usage: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/fixtures/import/make-scan-samples.cjs
const { chromium } = require('playwright')
const path = require('node:path')
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.6 })
  await p.setContent(`<html><body style="margin:0;background:#fff;font-family:'WenQuanYi Zen Hei';color:#111">
  <div style="padding:70px 70px">
  <h1 style="text-align:center;font-size:30px;margin:0 0 30px">학교 정보보안 점검 계획</h1>
  <p style="font-size:18px;line-height:2.1;margin:0">수신 각급 학교장</p>
  <p style="font-size:18px;line-height:2.1;margin:0">제목 AICBM 분야 정보보안 점검 계획 알림</p>
  <p style="font-size:18px;line-height:2.1;margin:12px 0 0">1. 관련: 교육부 정보보안과-1234호(2026. 3. 2.)</p>
  <p style="font-size:18px;line-height:2.1;margin:0">2. 학교의 정보보안 수준을 높이기 위해 다음과 같이 점검을 추진하니 협조하여 주시기 바랍니다.</p>
  <p style="font-size:18px;line-height:2.1;margin:0 0 0 24px">가. 점검 기간: 2026. 5. 1. ~ 5. 31.</p>
  <p style="font-size:18px;line-height:2.1;margin:0 0 0 24px">나. 점검 대상: 관내 전체 학교</p>
  <p style="font-size:18px;line-height:2.1;margin:0 0 0 48px">○ 세부 점검 항목은 붙임 파일을 참고하시기 바랍니다.</p>
  <p style="font-size:18px;line-height:2.1;margin:12px 0 0">붙임 1. 점검표 1부. 2. 제출 서식 1부. 끝.</p>
  </div></body></html>`)
  await p.screenshot({ path: path.join(__dirname, 'scan-sample.png'), type: 'png' })
  await b.close()
})()
