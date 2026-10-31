# donotext 설계 명세서 (Design Spec)

- 작성일: 2026-10-31
- 상태: 설계 승인 완료(사용자, 2026-10-31) → **스펙 검토 대기**
- 상위 문서: [`docs/PRD.md`](../../PRD.md) v0.1, [`HANDOFF.md`](../../../HANDOFF.md)
- 범위: PRD의 P0/P1 요구사항을 구현하기 위한 아키텍처. P2 항목은 §12에 별도 표기.

## 1. 목표 요약

MarkText급 WYSIWYG 마크다운 에디터를 Electron 데스크톱 앱으로 만들고, **화면 분할 + 파일 비교(diff)**를 1급 기능으로 추가한다. 에디터 코어는 **TipTap(ProseMirror)** 기반(사용자 승인 완료).

## 2. 확정된 결정 사항

| 항목 | 결정 | 출처 |
|---|---|---|
| 형태 | Electron 데스크톱 앱 | 사용자 확정 |
| 에디터 코어 | TipTap(ProseMirror) 기반 | 사용자 확정 |
| 설계 전체 | 채팅에서 제시 후 승인 | 사용자 확정 |
| UI 프레임워크 | React + Zustand | 설계 확정 |
| 소스 모드 | CodeMirror 6 | 설계 확정 |
| 비교 화면 | `@codemirror/merge` 기반 비교 탭 | 설계 확정(PRD S-06 조정) |
| UI 언어 | 한국어 우선, 영어는 후순위 | 가정(승인된 설계에 포함) |
| diff 병합(S-10) | v1 포함(라이브러리 기능으로 저비용) | 가정(승인된 설계에 포함) |
| 파일 형식 | §3.3 참고 | 사용자 질문 후 확정 |

## 3. 기술 스택과 구조

### 3.1 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 셸/빌드 | Electron + TypeScript + electron-vite, 배포 electron-builder | |
| UI | React, 상태는 Zustand | |
| WYSIWYG | TipTap + 마크다운 직렬화 확장 | **구체 패키지(공식 vs 커뮤니티)는 구현 계획 단계에서 설치 버전을 확인하고 결정** |
| 소스 모드 | CodeMirror 6 | |
| 비교 | `@codemirror/merge` MergeView | API(`goToNextChunk` 등)는 사전 지식, **구현 전 설치 버전으로 확인** |
| 파일 감시 | chokidar | |
| 테스트 | Vitest, Playwright | |

### 3.2 디렉터리 구조

```
src/
  main/       창·메뉴, 파일 서비스, 파일 감시, 세션 저장, 내보내기
  preload/    contextBridge로 타입 지정된 window.api만 노출
  shared/     IPC 타입, 레이아웃 타입 (main/renderer 공용)
  renderer/   app, store, layout, editor(wysiwyg|source|compare), sidebar
tests/
docs/
```

### 3.3 파일 형식

| 구분 | 동작 |
|---|---|
| 열기 기본 필터 | `.md`, `.markdown`, `.mdown`, `.txt` — 마크다운으로 해석, WYSIWYG/소스 모드 모두 사용 가능 |
| "모든 파일" 필터로 선택한 그 밖의 확장자 | **소스 모드 전용**으로 열기(마크다운 해석으로 서식이 바뀌는 것을 방지) |
| 저장/다른 이름으로 저장 | 임의 확장자 허용. `.txt`로 저장해도 내용은 마크다운 텍스트 그대로 |
| 사이드바 파일 트리 | 위 기본 확장자만 표시. "모든 파일 표시" 토글 제공 |

## 4. 프로세스 구조와 보안

### 4.1 IPC 계약

| 채널 | 설명 |
|---|---|
| `fs:openDialog` | 파일/폴더 선택(권한 부여) |
| `fs:read` / `fs:write` | 파일 읽기/쓰기 |
| `fs:readDir` | 폴더 목록 |
| `fs:watch` | 파일 변경 이벤트 구독 |
| `session:load` / `session:save` | 세션 복원 |
| `export:html` / `export:pdf` | 내보내기 |
| `image:save` | 붙여넣은 이미지 저장 |

모든 채널 입출력은 `shared/`의 타입으로 정의하고, 렌더러는 `window.api`로만 접근한다.

### 4.2 보안 요구사항

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP 적용.
- `fs:write`는 **사용자가 대화상자로 선택했거나 열어 둔 경로**에만 허용(허용 목록은 main이 관리).
- 외부 링크는 `http`/`https`만 허용, 기본 브라우저로 열기(`shell.openExternal`).
- 원격 콘텐츠 로드 금지. HTML 내보내기는 살균(sanitize) 후 저장.
- 문서 내용 외부 전송·텔레메트리 없음.

## 5. 문서 모델과 동기화

원칙: **마크다운 문자열이 진실, 에디터는 보기(view)**.

```ts
Document { id, path: string|null, text, baseline, eol, bom, readOnly, version }
dirty = (text !== baseline)
```

- 파일 하나당 Document 하나. 여러 창이 같은 Document를 볼 수 있다.
- **편집 흐름:** 키 입력 → ProseMirror 트랜잭션 → 150ms 디바운스 후 직렬화 → `docStore.setText(docId, text, origin=paneId)`.
- **동기화(S-03):** 같은 Document를 보는 다른 창은 `origin`이 자기 자신이 아닐 때만 `setContent`로 갱신. origin 태그로 루프를 막고 선택 영역을 보존한다. Yjs 등 협업 라이브러리는 사용하지 않는다(YAGNI).
- **왕복 정규화:** WYSIWYG는 표기를 정규화한다(예: `*`/`-` 목록 통일).
  - 파일을 **열기만 했을 때는 다시 쓰지 않는다.** 저장은 사용자가 편집했을 때만 발생.
  - `baseline = serialize(parse(원문))`으로 두어 열자마자 수정됨으로 표시되는 것을 방지.
  - 원문 서식을 그대로 보존해야 하면 소스 모드를 사용한다(소스 모드의 `text`는 원문 그대로).
  - EOL(CRLF/LF)과 BOM은 읽을 때 기록해 저장 시 유지한다.

## 6. 분할 레이아웃 (PRD S-01~S-05, S-11)

재귀 트리. 모든 조작은 **순수 함수**로 구현하고 단위 테스트한다.

```ts
type Node = Split | Leaf
Split { id, dir: 'row'|'col', children: Node[], sizes: number[] }
Leaf  { id, tabs: Tab[], active: number }
Tab   = { kind:'doc', docId, view:'wysiwyg'|'source' }
      | { kind:'compare', leftDocId, rightDocId }
```

| 조작 | 규칙 |
|---|---|
| `splitLeaf(leaf, dir, side)` | 리프를 Split으로 바꾸고 새 빈 리프 추가 |
| `closeLeaf` | 닫은 뒤 자식이 하나 남은 Split은 부모로 접음 |
| `moveTab` | 창 간 탭 이동 |
| `resize` / `equalize` | 경계 드래그 / 더블클릭 균등 분할 |

- **제한:** 리프 최대 6개, 깊이 최대 4.
- **UI:** 경계 드래그 조절, 탭 드래그 이동, 모든 조작에 키보드 단축키.
- **세션:** 종료 시 `{layout, 열린 문서 경로, 활성 탭}`을 `userData/session.json`에 저장. 저장하지 않은 내용은 주기적으로 `userData/backup/`에 백업하여 비정상 종료 후 복구.

## 7. 비교(Diff) 모드 (PRD S-06~S-10 조정)

PRD의 "두 창 하이라이트 + 스크롤 동기화"를 **비교 전용 탭**으로 대체한다.

- 비교 탭은 MergeView 하나로 좌우 두 문서를 나란히 표시(줄 정렬, 줄·단어 단위 하이라이트, 다음/이전 차이 이동, 차이 개수 표시, 차이 블록 병합).
- 마크다운 원문 기준이므로 소스 모드 표시이며, 양쪽 편집 가능. 편집 내용은 각 Document로 반영된다.
- 진입: "비교…" 명령 → 열린 문서 두 개 선택(또는 현재 문서 + 다른 문서).
- 일반 분할 창 간 **비율 기준 스크롤 연동 토글**(S-07)을 별도로 제공.
- 요구사항 매핑: S-06 = 비교 탭, S-07 = 스크롤 연동 토글, S-08 = 차이 이동, S-09 = 단어 하이라이트, S-10 = 병합 컨트롤, S-12 = P2로 보류.

## 8. 파일·사이드바·내보내기

- **파일 트리/개요:** main이 `fs:readDir`로 읽고, 개요 패널은 문서의 heading으로 생성.
- **외부 변경 감지:** 수정 없는 문서는 자동 재로드, 수정 중인 문서는 "다시 불러오기/유지" 배너.
- **이미지 붙여넣기:** 문서 폴더 하위 `assets/`에 저장하고 상대 경로 링크 삽입. 렌더링은 열어 둔 폴더로 제한한 커스텀 프로토콜 사용.
- **내보내기:** HTML(살균 후), PDF(`webContents.printToPDF`).
- **테마:** CSS 변수 기반 라이트/다크, 테마 추가 가능한 구조.

## 9. 오류 처리

| 상황 | 처리 |
|---|---|
| 저장 실패 | 수정됨 유지, 토스트, 다른 이름으로 저장 제안 |
| UTF-8이 아닌 파일 | 경고 후 읽기 전용으로 열기 |
| 5MB 초과 | 경고 후 소스 모드로만 열기 |
| 열린 파일 삭제/이동 | 탭에 표시, 내용 유지, 저장 시 경로 재선택 |
| 닫을 때 미저장 | 저장 / 저장 안 함 / 취소 |
| 마크다운 파싱 실패 | 소스 모드로 대체 |

## 10. 테스트 전략 (TDD)

| 대상 | 방식 |
|---|---|
| 레이아웃 트리 | Vitest 단위(분할·접기·이동·크기·직렬화) |
| 마크다운 왕복 | 샘플 코퍼스(표·목록·코드·수식·front matter) 열기→저장 무손실 |
| Document 동기화 | 같은 문서 두 뷰의 origin·루프 방지·dirty |
| IPC/파일 서비스 | 임시 디렉터리 단위 테스트, 경로 허용 규칙 |
| 파일 형식 | 확장자별 열기 모드(WYSIWYG/소스 전용) 분기 |
| 화면/E2E | Playwright. 컨테이너에서 Electron GUI 불가 시 렌더러 브라우저 모드(`window.api` 모킹)로 검증, 실제 Electron 최종 확인은 로컬 안내 |

## 11. 마일스톤 (PRD §11 연동)

M1 골격 + 단일 에디터 → M2 폴더 트리·탭·소스 모드·미저장 보호 → M3 분할 레이아웃 → M4 비교 탭 → M5 수식·집중/타자기·내보내기·테마·패키징.

## 12. 범위 밖 / 후속 (P2)

이모지(E-07), 다이어그램(E-12), 사이드바 드래그 이동(F-04), 비교 결과 내보내기(S-12), 영어 UI.

## 13. 미확인 사항

| 항목 | 확인 시점 |
|---|---|
| TipTap 마크다운 직렬화 패키지 선택 | 구현 계획 작성 시 |
| `@codemirror/merge` API 이름과 동작 | M4 착수 전 |
| MarkText 내부 구조·MIT 라이선스(사전 지식) | 코드 재사용 시에만 |
| 컨테이너에서 Electron GUI 실행 가능 여부 | M1 착수 시 |
