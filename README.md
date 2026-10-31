# donotext

MarkText 스타일의 **WYSIWYG 마크다운 에디터**(Electron 데스크톱 앱)에, MarkText에 없는 **화면 분할과 파일 비교(diff)** 를 더했습니다.

## 주요 기능

- **WYSIWYG 편집** (TipTap/ProseMirror) ↔ **소스 모드** (CodeMirror 6), CommonMark + GFM(표, 작업 목록, 취소선), 코드 구문 강조
- **수식**(KaTeX, `$…$` / `$$…$$`), **front matter**(YAML), 원문 HTML 보존, 이미지 붙여넣기(`assets/`에 저장)
- **집중 모드 · 타자기 모드 · 찾기/바꾸기** · 라이트/다크/시스템 **테마**
- **화면 분할**: 좌우/상하 재귀 분할(최대 6창), 창마다 독립 탭, 탭을 끌어서 다른 창으로 이동, 경계선 드래그·키보드 크기 조절, 같은 파일을 여러 창에서 열면 실시간 동기화, 창 간 **스크롤 연동**
- **파일 비교**: 열린 문서 두 개를 나란히 비교(줄·단어 단위 강조), 다음/이전 차이, 차이 병합(양방향)
- 폴더 트리·개요 패널, 외부 변경 감지, 자동 저장(선택), 미저장 내용 백업·세션 복원, 최근 파일
- **HTML / PDF 내보내기**(정화됨, 이미지 포함)
- 한글 입력(IME) 조합 중에는 다른 창의 갱신을 보류해 입력이 깨지지 않습니다.

## 실행

```bash
npm install
npm run dev          # Electron 개발 모드
npm run dev:web      # 브라우저 모드(가짜 파일 API, 화면·E2E 확인용)
```

## 검증

```bash
npm run typecheck
npm test             # 단위 테스트 (Vitest)
npm run check:i18n   # UI 문구가 ko.ts 밖에 하드코딩되지 않았는지 점검
PW_CHROMIUM_PATH=<chromium 경로> npm run test:e2e   # 브라우저 모드 E2E (Playwright). 설치된 Chromium을 쓰면 PW_CHROMIUM_PATH 생략 가능
```

## 빌드 / 패키징

```bash
npm run build        # out/ 생성
npm run pack         # 설치 파일 없이 폴더로 패키징 (release/)
npm run dist         # 현재 OS용 설치 파일
```

Windows(NSIS)·macOS(dmg)·Linux(AppImage) 설정은 `electron-builder.yml`에 있습니다. **이 저장소의 자동 검증은 Linux 폴더 패키지까지만 했습니다.** Windows/macOS 설치 파일, 코드 서명, 앱 아이콘은 해당 OS에서 따로 확인해야 합니다.

## 단축키

| 동작 | 키 (macOS는 Ctrl 대신 Cmd) |
|---|---|
| 열기 / 새 문서 / 저장 / 다른 이름으로 저장 | Ctrl+O / Ctrl+N / Ctrl+S / Ctrl+Shift+S |
| 탭 닫기 | Ctrl+W |
| 소스 모드 ↔ WYSIWYG | Ctrl+/ |
| 찾기 / 바꾸기 | Ctrl+F / Ctrl+H |
| 좌우 분할 / 상하 분할 | Ctrl+\\ / Ctrl+Shift+\\ |
| 이전·다음 창으로 포커스 | Ctrl+Alt+← / → |
| 창 닫기 (마지막 창은 닫히지 않음) | Ctrl+Alt+W |
| 비교 화면에서 다음/이전 차이 | F7 / Shift+F7 |
| 분할 경계선 이동 | 경계선에 포커스 후 방향키 (Enter: 균등) |

## 구조

```
src/main/      창·IPC·파일 서비스·감시·세션·내보내기·이미지 프로토콜
src/preload/   contextBridge로 노출하는 window.api (타입 지정)
src/shared/    main/renderer 공용 타입과 순수 함수
src/renderer/  React UI: editor/ layout/ sidebar/ store/ app/
tests/         unit/(Vitest) e2e/(Playwright)
docs/          PRD, 설계 명세서, 구현 계획서
```

보안 요건: `contextIsolation`·`sandbox` 켬, `nodeIntegration` 끔, CSP 적용, 파일 쓰기는 사용자가 연 위치로 제한, 외부 링크는 http/https만, 마크다운의 위험한 링크·이미지·HTML은 정화.

## 알려진 제한

- WYSIWYG는 표기를 정규화합니다(예: `*` 목록 → `-`). **열기만 하면 파일을 다시 쓰지 않지만**, 편집 후 저장하면 정규화된 형태로 저장됩니다. 원문 서식 그대로가 필요하면 소스 모드를 쓰세요.
- 수식은 Pandoc 규칙을 따릅니다. `$5 와 $10`은 글자이지만 `$5 와 6$ 개`처럼 닫는 `$` 앞이 공백이 아니면 수식으로 읽힐 수 있습니다.
- 찾기는 서식이 바뀌는 경계(예: 굵은 글씨 중간)를 넘는 문자열을 찾지 못합니다.
- 파일 대화상자로 연 문서는 그 문서의 `assets/` 폴더 이미지만 표시됩니다. 다른 위치의 상대 경로 이미지는 **폴더 열기**로 해당 폴더를 열어야 보입니다.
- 비교 탭은 마크다운 원문 기준(소스 표시)입니다.
- 바로가기 Ctrl+W/Ctrl+N은 OS나 브라우저가 먼저 가로챌 수 있습니다(데스크톱 앱에서는 동작).
- 심볼릭 링크는 해석하지 않습니다(허용된 폴더 안의 링크가 밖을 가리키면 따라갑니다).
- 아직 없음: 이모지 단축코드, 다이어그램(Mermaid), 사이드바 드래그 이동, 비교 결과 내보내기, 영어 UI.
