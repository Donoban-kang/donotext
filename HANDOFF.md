# HANDOFF — donotext

> 다음 세션이 이 파일만 읽고 이어서 작업할 수 있도록 유지하는 인수인계 문서입니다.
> 작업을 마칠 때마다 §2, §4, §5를 갱신하세요.

- 마지막 갱신: 2026-10-31
- 작업 브랜치: `claude/wonderful-davinci-5lejjm`
- 저장소: `donoban-kang/donotext`

## 1. 프로젝트 한 줄 요약

MarkText(오픈소스 마크다운 에디터)를 분석해 재현한 **Electron 데스크톱 마크다운 에디터**에, MarkText에 없는 **화면 분할 + 파일 비교(diff)** 기능을 추가한다.

## 2. 현재 상태

| 항목 | 상태 |
|---|---|
| 저장소 | README.md만 있는 빈 저장소 + 이 문서 + `docs/PRD.md` |
| 코드 | **구현 완료** — 계획서 Task 1~18 전부 (아래 §2-1) |
| 브레인스토밍 | 진행 중. 경로 = **아키텍처**(새 프로젝트) |
| PRD | `docs/PRD.md` v0.1 초안 작성 완료, **사용자 검토 대기** |
| 설계 | **사용자 승인 완료** (2026-10-31) |
| 명세서(spec) | `docs/superpowers/specs/2026-10-31-donotext-design.md` 작성 완료, **사용자 검토 대기** |
| 스펙 | **사용자 승인 완료** |
| 구현 계획서(plan) | `docs/superpowers/plans/2026-10-31-donotext-implementation.md` — **실행 완료(Native)** |

### 2-1. 구현 결과 (2026-10-31)

| 항목 | 결과 |
|---|---|
| 단위 테스트 | `npm test` — Vitest (현재 통과 수는 최종 검증 로그 참고) |
| E2E | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test` — 브라우저 모드 |
| 실제 Electron(xvfb, `--no-sandbox`) 확인 | IPC 접근 제어, 세션 파일로 권한 확대 불가, 종료 시 저장 확인, 단일 인스턴스+파일 인자, 심볼릭 링크 저장, 세션·백업 복구, 이미지 프로토콜, HTML/PDF 내보내기, 패키지(`release/linux-unpacked`) 실행 |
| 최종 리뷰 | 독립 리뷰어(opus, 18커밋 전체) 판정 **No** → Critical 1·Important 9(+상향 4) 수정 후 재검증. 수정 후 재리뷰는 하지 않고, 실패하던 테스트 → 통과로 확인 |
| 테스트 수 | Vitest 456 · Playwright 100 (브라우저 모드) |
| **미검증(로컬 확인 필요)** | Windows/macOS 설치 파일·서명·아이콘, 실제 화면 렌더링 육안 확인, 실제 한글 IME 입력(자동화는 composition 이벤트로 대체) |
| 구현 중 내린 판단(Rulings) | 작업 로그: 저장소 외부 `.superpowers/sdd/…/progress.md`(git 제외) 내용을 최종 보고에 정리함 — 핵심은 README 「알려진 제한」과 아래 §4 |

## 3. 사용자 결정사항 (확정)

1. 기준 제품은 MarkText, **똑같이 재현**.
2. 추가 기능: 창을 여러 개로 나눠 **파일 내용을 비교·분석**하는 화면 분할.
3. 형태: **Electron 데스크톱 앱** (웹 앱 아님).
4. PRD와 HANDOFF.md를 먼저 작성한 뒤 A안 진행을 이어가기로 함.
5. **에디터 코어는 A안(TipTap/ProseMirror 기반)으로 확정** (2026-10-31 사용자 승인). 전체 설계 제시 → 설계 승인 대기.

## 4. 승인 대기 / 미결

| 항목 | 내용 |
|---|---|
| 에디터 코어 | ~~승인 대기~~ → **A안 확정** (완료) |
| 전체 설계 | ~~승인 대기~~ → **승인 완료**, 스펙 문서로 저장함 |
| 후속 후보 | README 「알려진 제한」의 "아직 없음" 항목, session.json 경로 재허용 범위 축소(보안 메모), 심볼릭 링크 처리 |
| PRD §12 | 범위·UI 언어·병합 기능(S-10)·OS 우선순위·파일 확장자 등 6건 미결 |

## 5. 다음 단계 (순서 고정 — 게이트 준수)

작업 방식은 `superpowers:brainstorming` 아키텍처 경로를 따른다. **승인 없이 다음 단계로 넘어가지 말 것.**

1. ~~PRD 검토, 에디터 코어 A안 승인~~ (완료)
2. ~~전체 설계 제시·승인~~ (완료)
3. ~~설계를 스펙 문서로 저장·커밋, 자체 점검~~ (완료)
4. ~~스펙 검토·승인~~ (완료)
5. ~~구현 계획서 작성·실행(Native)~~ (완료).
   - 계획서 안에서 구현 시 확인하도록 한 것: TipTap 마크다운 직렬화 패키지 선택(설치 버전 확인), 컨테이너에서 Electron GUI 실행 가능 여부.
6. 승인·선택 후 계획서의 Task 1→18 순서로 구현(마일스톤 M1→M5, PRD §11). TDD 적용. 각 태스크 완료 시 이 문서의 §2를 갱신. `@codemirror/merge` API는 Task 14 Step 1에서 확인.

## 6. 알아 둘 사실

- MarkText README에서 확인한 기능: WYSIWYG, CommonMark/GFM/일부 Pandoc, KaTeX, front matter, 이모지, HTML/PDF 내보내기, 다중 테마, 소스/타자기/집중 모드, 클립보드 이미지 붙여넣기.
- **[확인 필요]** MarkText 내부 구조(Muya 엔진, Vue)와 MIT 라이선스는 사전 지식이며 이번 세션에서 검증하지 못함. 코드를 재사용하려면 먼저 LICENSE 파일을 확인할 것.
- 개발 환경은 클라우드 컨테이너. Chromium+Playwright가 설치되어 있어 렌더러는 브라우저 모드로 검증 가능하나, Electron GUI 직접 실행 검증은 제한적일 수 있음.
- **Electron GUI 확인(Task 1):** 컨테이너(root)에서 `xvfb-run -a npx electron --no-sandbox --disable-gpu .`로 실행됨(Electron 45.2.1). root라 `--no-sandbox`가 필요하며 앱 코드의 `sandbox: true`는 그대로 유지. E2E는 우선 브라우저 모드(`npm run dev:web`)로 진행.
- **마크다운 패키지(Task 6):** 공식 `@tiptap/markdown` 3.32.2 선택(@tiptap/core 3.32.2와 버전 일치, peer 충족). `tiptap-markdown` 0.9.0은 비채택. TipTap 패키지는 정확한 버전으로 고정(내부 `parseHTMLToken` 패치 의존). 원문 HTML은 불활성 노드(rawHtmlBlock/Inline)로 보존.
- 컨테이너는 일시적이므로 **작업물은 반드시 커밋·푸시**해야 보존됨.

## 7. 사용자 선호 (응답 방식)

- 실무형 한국어 존댓말, 과장·불필요한 면책 금지, 질문 규모에 맞춘 분량.
- 사실 / 근거 있는 추정 / 추측을 구분해 표기. 검증 못 한 것은 "추가 확인 필요".
- 외부 효력 행위(발송·삭제·게시 등)는 내용 요약 후 명시적 승인을 받고 실행.
- PR은 사용자가 요청할 때만 생성.

## 8. 파일 지도

| 경로 | 설명 |
|---|---|
| `README.md` | 초기 파일 (내용 보강 필요) |
| `docs/PRD.md` | 제품 요구사항 문서 v0.1 |
| `HANDOFF.md` | 이 문서 |
| `docs/superpowers/specs/2026-10-31-donotext-design.md` | 설계 명세서 (승인된 설계) |
| `docs/superpowers/plans/2026-10-31-donotext-implementation.md` | 구현 계획서 (Task 1~18) |

## 9. 세션 로그

| 날짜 | 내용 |
|---|---|
| 2026-10-31 | 요청 접수 → MarkText README 조사 → Electron 데스크톱 확정 → 에디터 코어 3안 비교(A 추천) → PRD v0.1, HANDOFF.md 작성 |
| 2026-10-31 | A안 확정 → 전체 설계 제시·승인 → 파일 형식 정책 확정 → 설계 명세서 작성 |
| 2026-10-31 | 스펙 승인 → 구현 계획서 작성(18개 태스크) |
| 2026-10-31 | 계획서 Task 1~18 구현 완료(Native) → 최종 전체 리뷰(판정 No) → 수정 패스(C1, I1~I9 외) 완료 |
| 2026-11-01 | UI 재디자인(시안 C: 미니멀 구조 + 토스식 둥근 모양, 파란 포인트 1개). CSS 토큰화·아이콘 툴바·카드형 창. 동작 변경 없음 |
| 2026-11-01 | 도움말 추가: 사이드바 왼쪽 아래 버튼 → 버전·만든이·업데이트 확인(GitHub 최신 릴리스 조회)·단축키. 저장소가 비공개라 앱의 업데이트 확인은 404 안내 + 릴리스 페이지 링크로 처리 |
