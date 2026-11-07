// Regenerates sample-gongmun.pdf (a Korean official-document look-alike) with Playwright's Chromium.
// Usage: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/fixtures/import/make-sample-pdf.cjs
const { chromium } = require('playwright')
const path = require('node:path')
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  const long =
    '본 사업은 관내 초·중·고등학교의 정보보안 수준을 높이고 개인정보 유출 사고를 예방하기 위하여 추진하는 것으로, 학교별 점검 결과를 종합하여 개선과제를 도출하고 후속 조치를 지원하고자 합니다.'
  const page = (n, body) =>
    `<section style="position:relative;height:940px;page-break-after:always;overflow:hidden"><div style="font-size:10px;text-align:right;border-bottom:1px solid #999">○○교육지원청 정보보안 점검계획</div>${body}<div style="position:absolute;bottom:0;width:100%;text-align:center;font-size:10px">- ${n} -</div></section>`
  const html = `<html><body style="font-family:Unifont;font-size:14px;line-height:1.6;margin:0">
  ${page(1, `<h1 style="text-align:center;font-size:24px">2026년 학교 정보보안 점검 계획</h1>
  <p>수신 각급 학교장</p><p>(경유)</p><p>제목 2026년 학교 정보보안 점검 계획 알림</p>
  <p>1. 관련: 교육부 정보보안과-1234(2026. 3. 2.)</p>
  <p>2. 학교의 정보보안 수준을 높이기 위해 다음과 같이 점검을 추진하니 협조하여 주시기 바랍니다.</p>
  <p style="margin-left:20px">가. 점검 기간: 2026. 5. 1. ~ 5. 31.</p>
  <p style="margin-left:20px">나. 점검 대상: 관내 전체 학교</p>
  <p style="margin-left:40px">○ ${long}</p>
  <p style="margin-left:40px">- 세부 점검 항목은 붙임 참조</p>
  <p>붙임 1. 점검표 1부.  2. 제출 서식 1부.  끝.</p>`)}
  ${page(2, `<h2>점검 항목</h2><table border="1" style="border-collapse:collapse;width:100%"><tr><th>구분</th><th>항목</th><th>배점</th></tr><tr><td>관리</td><td>개인정보 처리방침 게시</td><td>10</td></tr><tr><td>기술</td><td>PC 백신 설치</td><td>20</td></tr><tr><td>물리</td><td>서버실 출입통제</td><td>15</td></tr></table><p>${long}</p>`)}
  ${page(3, `<h2>제출 방법</h2><p>${long}</p><p>${long}</p>`)}
  </body></html>`
  await p.setContent(html)
  await p.pdf({ path: path.join(__dirname, 'sample-gongmun.pdf'), format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } })
  // A bordered table whose cells wrap over several lines, a merged category cell, and a bulleted list.
  const wrap = `<html><body style="font-family:Unifont;font-size:14px;line-height:1.6;margin:0">
  <h2>안내 문구</h2>
  <ul><li>첫째 항목입니다</li><li>둘째 항목입니다</li></ul>
  <table border="1" style="border-collapse:collapse;width:100%">
  <tr><th style="width:30%">안내 문구</th><th>하는 일</th></tr>
  <tr><td>타일 높이가 작습니다. 그래도 사용할까요?</td><td>우리 타일이 작으면 판단이 부정확할 수 있습니다. 가능하면 No 단추를 누르십시오. 영역 지정 화면이 다시 나오므로 닫고 화면을 키웁니다.</td></tr>
  <tr><td rowspan="2">관리</td><td>첫째 행 설명</td></tr>
  <tr><td>둘째 행 설명</td></tr>
  </table><p>표 아래 문단입니다.</p></body></html>`
  await p.setContent(wrap)
  await p.pdf({ path: path.join(__dirname, 'table-wrap.pdf'), format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } })
  await b.close()
})()
