# donotext Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MarkText급 WYSIWYG 마크다운 에디터를 Electron 데스크톱 앱으로 만들고, 화면 분할과 비교(diff) 탭을 추가한다.

**Architecture:** main(파일·세션·내보내기·감시) / preload(`window.api`만 노출) / renderer(React + Zustand)의 3층 구조. 마크다운 문자열이 문서의 진실이고 에디터(TipTap, CodeMirror 6, MergeView)는 그 문자열의 보기(view)다. 분할 레이아웃은 재귀 트리이며 모든 조작은 순수 함수다.

**Tech Stack:** Electron, TypeScript, electron-vite, React, Zustand, TipTap(ProseMirror), CodeMirror 6, `@codemirror/merge`, chokidar, DOMPurify, Vitest, Playwright, electron-builder.

**Spec:** `docs/superpowers/specs/2026-10-31-donotext-design.md` (PRD: `docs/PRD.md`)

## Global Constraints

- Electron: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, CSP 적용 (스펙 §4.2).
- `fs:write`는 사용자가 대화상자로 선택했거나 열어 둔 경로(폴더는 하위 포함)에만 허용. main이 허용 목록을 관리 (§4.2).
- 외부 링크는 `http`/`https`만 `shell.openExternal`로 연다. 원격 콘텐츠 로드 금지. HTML 내보내기는 살균 후 저장 (§4.2).
- 문서 내용 외부 전송·텔레메트리 없음 (§4.2).
- 열기 기본 필터 `.md .markdown .mdown .txt` → 마크다운. 그 밖의 확장자는 소스 모드 전용. 저장은 임의 확장자 허용. 사이드바는 기본 확장자만 표시하고 "모든 파일 표시" 토글 제공 (§3.3).
- 에디터 → 문서 반영 디바운스 150ms, `origin=paneId` 태그로 루프 방지. Yjs 등 협업 라이브러리 금지 (§5).
- 파일을 열기만 했을 때는 다시 쓰지 않는다. EOL(CRLF/LF)과 BOM은 읽을 때 기록해 저장 시 유지 (§5).
- 레이아웃: 리프 최대 6개, Split 중첩 깊이 최대 4 (§6).
- 5MB 초과 파일은 경고 후 소스 모드 전용, UTF-8이 아니면 경고 후 읽기 전용 (§9).
- UI 언어는 한국어 우선, 영어는 후순위 (§2).
- 스펙 §5 보완: `baseline` 비교는 `isDirty = text !== baseline && text !== baselineNormalized`로 구현한다 (열자마자 수정됨이 되지 않으면서 원문을 다시 쓰지 않는다는 스펙 의도와 동일).
- 명령: 테스트 `npm test`, 타입 검사 `npm run typecheck`, 브라우저 모드 `npm run dev:web`.

## Review Focus

1. **CRLF/BOM 파일**: 열고 편집 없이 두면 바이트가 그대로이고, 편집 후 저장해도 CRLF와 BOM이 유지된다 → Task 3, 5.
2. **허용되지 않은 경로 쓰기**(`..` 경로 탈출 포함)는 거부된다 → Task 3.
3. **악성 마크다운** (`<script>`, `javascript:` 링크, 이미지 `onerror`)이 렌더링·내보내기에서 실행되지 않는다 → Task 2, 7, 17.
4. **한글 IME 조합 중** 다른 창의 갱신이 입력을 깨뜨리지 않는다 → Task 7, 13.
5. **마지막 창 닫기·제한 초과 분할**(리프 7번째, 깊이 5)은 레이아웃을 깨지 않는다. 한글·공백이 든 경로와 빈 파일도 정상 동작한다 → Task 3, 9.

---

## File Structure

```
src/shared/      fileKind.ts textFormat.ts links.ts ipc.ts session.ts csp.ts
src/main/        index.ts windowOptions.ts ipcHandlers.ts services/{fsService,watchService,sessionStore,exportService,imageService}.ts
src/preload/     index.ts
src/renderer/
  api/           mockApi.ts
  store/         documents.ts layoutStore.ts settings.ts
  layout/        tree.ts SplitView.tsx Pane.tsx TabBar.tsx
  editor/        markdown/{codec,extensions}.ts  WysiwygEditor.tsx SourceEditor.tsx CompareView.tsx sync.ts findReplace.ts
  sidebar/       FileTree.tsx Outline.tsx
  app/           App.tsx commands.ts i18n/ko.ts theme.css
tests/           unit/ e2e/ fixtures/corpus/
```

---

### Task 1: 프로젝트 골격과 보안 창 설정

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/main/index.ts`, `src/main/windowOptions.ts`, `src/shared/csp.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `.gitignore`
- Test: `tests/unit/windowOptions.test.ts`

**Interfaces:**
- Produces: `buildWebPreferences(preloadPath: string): Electron.WebPreferences`, `CSP: string`.

- [ ] **Step 1: Write the failing test** — `windowOptions.test.ts`: `buildWebPreferences('/p')` returns `contextIsolation === true`, `sandbox === true`, `nodeIntegration === false`, `preload === '/p'`; `CSP` contains `default-src 'self'` and `script-src 'self'` and does not contain `unsafe-eval`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/windowOptions.test.ts` → FAIL (모듈 없음).
- [ ] **Step 3: Scaffold** electron-vite(React+TS) 프로젝트를 만들고(스크립트: `dev`, `dev:web`(렌더러만), `build`, `test`, `typecheck`), 위 두 함수를 구현한다. main은 `buildWebPreferences`로 창을 만들고 CSP를 응답 헤더에 주입한다.
- [ ] **Step 4: Run** 같은 테스트 → PASS. `npm run typecheck` → 오류 없음. `npm run build` → 성공.
- [ ] **Step 5: 환경 확인** — `xvfb-run -a npx electron --version` 또는 동등 명령으로 컨테이너에서 Electron GUI 실행 가능 여부를 확인하고 결과를 `HANDOFF.md` §6에 한 줄 기록한다 (불가하면 이후 E2E는 브라우저 모드로 진행).
- [ ] **Step 6: Commit** `feat: scaffold electron app with hardened window config`

### Task 2: 공용 순수 모듈 (파일 종류, 텍스트 인코딩, 링크 검증)

**Files:**
- Create: `src/shared/fileKind.ts`, `src/shared/textFormat.ts`, `src/shared/links.ts`
- Test: `tests/unit/fileKind.test.ts`, `tests/unit/textFormat.test.ts`, `tests/unit/links.test.ts`

**Interfaces:**
- Produces:
  - `type FileKind = 'markdown' | 'sourceOnly'`; `MARKDOWN_EXTENSIONS: readonly ['.md','.markdown','.mdown','.txt']`; `classifyPath(path: string): FileKind` (대소문자 무시)
  - `type Eol = 'lf' | 'crlf'`; `decodeText(buf: Uint8Array): { text: string; eol: Eol; bom: boolean; validUtf8: boolean }` (text는 메모리에서 항상 LF); `encodeText(text: string, eol: Eol, bom: boolean): Uint8Array`
  - `isSafeLinkUrl(url: string): boolean`

- [ ] **Step 1: Write the failing tests**
  - `classifyPath('a.MD')==='markdown'`, `'x.txt'`→markdown, `'x.json'`/`'x'`→sourceOnly.
  - BOM+CRLF 바이트를 `decodeText` → `bom===true, eol==='crlf', text`에 `\r` 없음; `encodeText(text,'crlf',true)`가 원래 바이트와 동일(왕복). 빈 버퍼 → `text===''`. 한글·공백이 든 문자열 왕복. `[0xff,0xfe,0x41]` → `validUtf8===false`.
  - `isSafeLinkUrl`: `https://a.b`, `http://a.b`, `mailto:a@b.c`, `./rel.md`, `#h` → true; `javascript:alert(1)`, `JaVaScript:x`, `data:text/html,x`, `file:///etc/passwd` → false.
- [ ] **Step 2: Run** `npx vitest run tests/unit/` → FAIL.
- [ ] **Step 3: Implement** 위 시그니처. `decodeText`는 `TextDecoder('utf-8',{fatal:true})`를 시도하고 실패하면 비엄격 디코딩 + `validUtf8:false`. EOL은 첫 줄바꿈이 `\r\n`이면 crlf.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add file kind, text format, link safety helpers`

### Task 3: FsService (허용 목록, 읽기/쓰기/디렉터리)

**Files:**
- Create: `src/main/services/fsService.ts`
- Test: `tests/unit/fsService.test.ts` (임시 디렉터리 사용)

**Interfaces:**
- Consumes: `decodeText`, `encodeText`, `classifyPath` (Task 2).
- Produces:
  ```ts
  type Warning = 'notUtf8' | 'tooLarge'
  interface ReadResult { path: string; text: string; eol: Eol; bom: boolean; kind: FileKind; readOnly: boolean; warning?: Warning }
  interface DirEntry { name: string; path: string; isDir: boolean }
  class FsService {
    constructor(opts?: { maxBytes?: number; trash?: (path: string) => Promise<void> })  // maxBytes 기본 5*1024*1024; trash 미지정 시 fs.rm
    grant(path: string): void                            // 파일 또는 폴더(하위 포함)
    isAllowed(path: string): boolean                     // path.resolve 후 비교, '..' 탈출 불가
    readFile(path: string): Promise<ReadResult>          // 미허용 경로면 reject
    writeFile(path: string, text: string, eol: Eol, bom: boolean): Promise<void>
    readDir(path: string): Promise<DirEntry[]>           // 폴더 우선, 이름순
    createEntry(parent: string, name: string, isDir: boolean): Promise<string>
    renameEntry(path: string, newName: string): Promise<string>
    deleteEntry(path: string): Promise<void>             // opts.trash가 있으면 휴지통 이동(Electron은 shell.trashItem 주입)
  }
  ```

- [ ] **Step 1: Write the failing tests**
  - 미허용 경로 `writeFile` → reject; `grant(dir)` 후 `dir/../outside.md` 쓰기 → reject (Review Focus 2).
  - `grant(dir)` 후 `dir/한글 폴더/메모 1.md` 생성·읽기·쓰기 성공 (Review Focus 5).
  - 빈 파일 `readFile` → `text===''`, `kind==='markdown'`.
  - CRLF+BOM 파일: `readFile` 후 `writeFile(path,text,eol,bom)`한 바이트가 원본과 동일 (Review Focus 1).
  - `maxBytes:10`에 11바이트 파일 → `warning==='tooLarge'`, `kind==='sourceOnly'`. 잘못된 UTF-8 → `warning==='notUtf8'`, `readOnly===true`.
  - `readDir`는 폴더가 먼저, `.json`은 `readDir` 결과에 포함(필터는 UI 담당).
- [ ] **Step 2: Run** `npx vitest run tests/unit/fsService.test.ts` → FAIL.
- [ ] **Step 3: Implement** `FsService`. 경로는 항상 `path.resolve`로 정규화하고, 허용 루트와 `path.relative`가 `..`로 시작하지 않을 때만 허용한다.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add FsService with grant-based access control`

### Task 4: IPC, preload, 브라우저 모드 목(mock)과 E2E 하네스

**Files:**
- Create: `src/shared/ipc.ts`, `src/main/ipcHandlers.ts`, `src/renderer/api/mockApi.ts`, `playwright.config.ts`
- Modify: `src/preload/index.ts`, `src/main/index.ts`, `src/renderer/main.tsx`
- Test: `tests/unit/mockApi.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `FsService` (Task 3).
- Produces: `interface DonotextApi` (= `window.api`):
  ```ts
  openFileDialog(): Promise<ReadResult[]>
  openFolderDialog(): Promise<{ root: string; entries: DirEntry[] } | null>
  saveAsDialog(suggestedName?: string): Promise<string | null>   // 반환 경로는 자동 grant
  readFile(path: string): Promise<ReadResult>
  writeFile(path: string, text: string, eol: Eol, bom: boolean): Promise<void>
  readDir(path: string): Promise<DirEntry[]>
  createEntry(parent: string, name: string, isDir: boolean): Promise<string>
  renameEntry(path: string, newName: string): Promise<string>
  deleteEntry(path: string): Promise<void>
  watch(paths: string[]): void
  onFileChanged(cb: (e: { path: string; kind: 'change' | 'unlink' }) => void): () => void
  loadSession(): Promise<SessionData | null>   // SessionData는 Task 12에서 정의, 여기서는 unknown 별칭
  saveSession(s: SessionData): Promise<void>
  writeBackup(docId: string, text: string): Promise<void>
  exportHtml(html: string, suggestedName: string): Promise<string | null>
  exportPdf(html: string, suggestedName: string): Promise<string | null>
  saveImage(docPath: string | null, bytes: Uint8Array, ext: string): Promise<string>  // 문서 기준 상대 경로 반환
  openExternal(url: string): Promise<void>          // http/https만, 아니면 reject
  ```
  `createMockApi(): DonotextApi` — 메모리 파일시스템 기반, `window.api`가 없을 때 renderer가 사용.

- [ ] **Step 1: Write the failing tests** — `mockApi.test.ts`: `createMockApi()`로 `writeFile`→`readFile` 왕복, `openExternal('javascript:x')` reject. `smoke.spec.ts`(Playwright, `npm run dev:web` 대상): 페이지에 "donotext" 제목과 빈 에디터 영역(`data-testid="workspace"`)이 보인다.
- [ ] **Step 2: Run** `npx vitest run tests/unit/mockApi.test.ts` → FAIL.
- [ ] **Step 3: Implement** 채널 상수(`fs:openDialog` 등 스펙 §4.1)를 `shared/ipc.ts`에, `ipcMain.handle` 등록을 `ipcHandlers.ts`에, `contextBridge.exposeInMainWorld('api', …)`를 preload에 둔다. 모든 핸들러는 인자를 검증한다(문자열·길이).
- [ ] **Step 4: Run** 단위 → PASS. `npx playwright test tests/e2e/smoke.spec.ts` → PASS.
- [ ] **Step 5: Commit** `feat: add typed IPC, preload bridge, and browser-mode mock API`

### Task 5: Document 스토어

**Files:**
- Create: `src/renderer/store/documents.ts`
- Test: `tests/unit/documents.test.ts`

**Interfaces:**
- Consumes: `ReadResult` (Task 3), `normalizeMarkdown` (Task 6의 인터페이스. 이 태스크에서는 `setNormalizer(fn: (md: string) => string)`로 주입해 순서 의존을 피한다).
- Produces:
  ```ts
  interface Doc { id: string; path: string | null; name: string; text: string; baseline: string; baselineNormalized: string; eol: Eol; bom: boolean; readOnly: boolean; sourceOnly: boolean; version: number; external: 'none' | 'changed' | 'deleted' }
  // zustand store `useDocuments`
  open(r: ReadResult): string                         // 같은 path면 기존 id 반환
  openUntitled(): string
  setText(id: string, text: string, origin: string): void   // version++ 및 구독자 호출
  markSaved(id: string, path?: string): void
  reload(id: string, r: ReadResult): void
  close(id: string): void
  isDirty(id: string): boolean                        // text !== baseline && text !== baselineNormalized
  subscribeText(id: string, cb: (text: string, origin: string) => void): () => void
  setNormalizer(fn: (md: string) => string): void
  ```

- [ ] **Step 1: Write the failing tests**
  - 열기 직후 `isDirty===false` (정규화가 텍스트를 바꾸는 normalizer를 주입해도). `setText` 후 true. `markSaved` 후 false.
  - 같은 path를 두 번 `open` → 같은 id, doc은 하나.
  - `setText(id,'x','paneA')`가 구독자에게 `('x','paneA')`로 전달되고, 값이 현재 text와 같으면 호출·`version` 증가 없음.
  - sourceOnly 문서는 정규화하지 않는다(`baselineNormalized===baseline`). CRLF/BOM 값이 `markSaved` 이후에도 유지(Review Focus 1).
- [ ] **Step 2: Run** `npx vitest run tests/unit/documents.test.ts` → FAIL.
- [ ] **Step 3: Implement** 위 인터페이스.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add document store with dirty tracking and origin-tagged updates`

### Task 6: 마크다운 코덱 (TipTap 확장과 왕복)

**Files:**
- Create: `src/renderer/editor/markdown/extensions.ts`, `src/renderer/editor/markdown/codec.ts`, `tests/fixtures/corpus/*.md`
- Test: `tests/unit/codec.test.ts`

**Interfaces:**
- Produces: `getExtensions(): Extensions` (StarterKit, GFM 표, 작업 목록, 취소선, 코드 블록+구문 강조, 링크(`isSafeLinkUrl` 적용), 이미지), `normalizeMarkdown(md: string): string`, `markdownToHtml(md: string): string`.

- [ ] **Step 1: 패키지 결정** — TipTap 공식 마크다운 확장과 커뮤니티 `tiptap-markdown`을 `npm view <pkg> version peerDependencies`로 확인해, 설치한 TipTap 버전과 peer가 맞는 쪽을 선택한다. 선택과 이유를 이 파일 Task 6 아래와 `HANDOFF.md`에 한 줄 기록한다.
- [ ] **Step 2: Write the failing tests** — 코퍼스(제목, 중첩 목록, 표, 코드 블록, 작업 목록, 링크, 이미지, 빈 파일, 한글 본문)에 대해 `normalizeMarkdown(normalizeMarkdown(x)) === normalizeMarkdown(x)`(멱등), 그리고 핵심 구조(제목 수, 표 행 수, 코드 블록 내용)가 보존됨. `[x](javascript:alert(1))`가 정규화 결과에서 `href`를 잃거나 제거된다 (Review Focus 3). 빈 문자열 → `''`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/codec.test.ts` → FAIL.
- [ ] **Step 4: Implement** 확장 목록과 코덱. `normalizeMarkdown`은 헤드리스 에디터로 parse→serialize. 지원하지 않는 문법은 원문 텍스트로 보존되도록 한다(손실 금지).
- [ ] **Step 5: Run** → PASS. 앱 시작 시 `useDocuments.getState().setNormalizer(normalizeMarkdown)`를 연결.
- [ ] **Step 6: Commit** `feat: add markdown codec on TipTap with roundtrip corpus`

### Task 7: WYSIWYG 에디터 컴포넌트와 동기화 헬퍼

**Files:**
- Create: `src/renderer/editor/sync.ts`, `src/renderer/editor/WysiwygEditor.tsx`
- Test: `tests/unit/sync.test.ts`, `tests/e2e/wysiwyg.spec.ts`

**Interfaces:**
- Consumes: `useDocuments`(Task 5), `getExtensions`(Task 6).
- Produces:
  ```ts
  shouldApplyRemote(a: { selfId: string; origin: string; composing: boolean }): boolean  // origin!==selfId && !composing
  createDebouncer(ms: number): { call(fn: () => void): void; flush(): void; cancel(): void }
  <WysiwygEditor docId={string} paneId={string} />
  ```

- [ ] **Step 1: Write the failing tests** — `sync.test.ts`: `shouldApplyRemote({selfId:'a',origin:'a',composing:false})===false`, 다른 origin이면 true, `composing:true`면 false (Review Focus 4). 디바운서: fake timers에서 150ms 안에 3번 `call` → 마지막 1번만 실행, `flush()`는 즉시 실행. `wysiwyg.spec.ts`(브라우저 모드): 파일을 열고 텍스트 입력 → 탭에 수정됨 표시, `# `+공백 입력 → h1 렌더, **굵게** 단축키(Ctrl/Cmd+B) 동작, Ctrl/Cmd+Z로 되돌리기.
- [ ] **Step 2: Run** `npx vitest run tests/unit/sync.test.ts` → FAIL.
- [ ] **Step 3: Implement** 두 헬퍼와 컴포넌트. 사용자 입력 트랜잭션에서만 디바운스 후 `setText(docId, serialize, paneId)`를 호출하고, `subscribeText` 수신 시 `shouldApplyRemote`가 true일 때만 선택 영역을 보존하며 `setContent`(이때 emit 금지). 조합이 끝나면(`compositionend`) 보류된 갱신을 적용. 인라인/단락 단축키(E-10)와 실행 취소/다시 실행 포함.
- [ ] **Step 4: Run** 단위 → PASS, `npx playwright test tests/e2e/wysiwyg.spec.ts` → PASS.
- [ ] **Step 5: Commit** `feat: add WYSIWYG editor bound to document store`

### Task 8: 소스 모드, 보기 전환, 찾기/바꾸기

**Files:**
- Create: `src/renderer/editor/SourceEditor.tsx`, `src/renderer/editor/findReplace.ts`
- Modify: `src/renderer/editor/WysiwygEditor.tsx` (검색 확장 등록)
- Test: `tests/unit/findReplace.test.ts`, `tests/e2e/source.spec.ts`

**Interfaces:**
- Produces: `findMatches(text: string, query: string, opts: { caseSensitive: boolean }): Array<{ from: number; to: number }>`; `<SourceEditor docId paneId />`(CodeMirror 6, 마크다운 언어, `search` 키맵); `Tab.view` 전환 명령 `toggleView(tabRef)`는 Task 10에서 연결.

- [ ] **Step 1: Write the failing tests** — `findMatches('Aa aA','a',{caseSensitive:false})` → 4개, `caseSensitive:true` → 2개; 빈 query → `[]`; 한글 `findMatches('안녕 안녕','안녕',…)` → 2개. e2e: 소스 모드에서 입력한 텍스트가 같은 문서의 WYSIWYG에 반영.
- [ ] **Step 2: Run** `npx vitest run tests/unit/findReplace.test.ts` → FAIL.
- [ ] **Step 3: Implement** `findMatches`와 `SourceEditor`(Task 7과 같은 origin/디바운스 규칙. 소스 모드의 `text`는 원문 그대로이며 정규화하지 않는다). WYSIWYG 쪽은 `findMatches` 결과를 데코레이션하는 ProseMirror 플러그인과 찾기/바꾸기 패널(Ctrl/Cmd+F, Ctrl/Cmd+H).
- [ ] **Step 4: Run** 단위 → PASS, e2e → PASS.
- [ ] **Step 5: Commit** `feat: add source mode and find/replace`

### Task 9: 레이아웃 트리 순수 함수

**Files:**
- Create: `src/renderer/layout/tree.ts`
- Test: `tests/unit/layoutTree.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Tab = { kind: 'doc'; docId: string; view: 'wysiwyg' | 'source' } | { kind: 'compare'; leftDocId: string; rightDocId: string }
  interface Leaf { type: 'leaf'; id: string; tabs: Tab[]; active: number }
  interface Split { type: 'split'; id: string; dir: 'row' | 'col'; children: LayoutNode[]; sizes: number[] }   // sizes 합 = 1
  type LayoutNode = Leaf | Split
  const MAX_LEAVES = 6, MAX_DEPTH = 4
  newLeaf(): Leaf
  splitLeaf(root: LayoutNode, leafId: string, dir: 'row'|'col', side: 'before'|'after'): LayoutNode  // 제한 초과 시 root 그대로
  closeLeaf(root: LayoutNode, leafId: string): LayoutNode                                          // 유일한 리프면 root 그대로
  openTab(root, leafId: string, tab: Tab): LayoutNode
  closeTab(root, leafId: string, index: number): LayoutNode
  moveTab(root, from: { leafId: string; index: number }, to: { leafId: string; index: number }): LayoutNode
  resize(root, splitId: string, sizes: number[]): LayoutNode
  equalize(root, splitId: string): LayoutNode
  setActiveTab(root, leafId: string, index: number): LayoutNode
  countLeaves(root): number; depth(root): number; findLeaf(root, id: string): Leaf | undefined
  parseLayout(json: unknown): LayoutNode      // 잘못된 입력이면 newLeaf()
  ```

- [ ] **Step 1: Write the failing tests** (불변성: 입력 객체를 변경하지 않음을 모든 조작에서 확인)
  - 리프 1개를 `row`로 분할 → Split(children 2, sizes `[0.5,0.5]`), `side:'before'`면 새 리프가 앞.
  - 같은 방향 Split 안의 리프를 같은 방향으로 분할 → 중첩 없이 형제로 삽입(깊이 증가 없음).
  - 리프 6개에서 `splitLeaf` → root 그대로 (7번째 거부). 깊이 4에서 다른 방향 분할 → root 그대로 (Review Focus 5).
  - `closeLeaf`: 자식이 하나 남은 Split은 부모로 접힘. 유일한 리프에 호출 → root 그대로.
  - `moveTab` 같은 리프 내 순서 변경, 다른 리프로 이동 후 원본 리프가 비면 `closeLeaf`는 호출하지 않고 빈 리프로 유지.
  - `resize`는 합이 1이 아니면 정규화. `parseLayout({garbage:1})` → 새 리프, `parseLayout(JSON.parse(JSON.stringify(root)))` 왕복 동일.
- [ ] **Step 2: Run** `npx vitest run tests/unit/layoutTree.test.ts` → FAIL.
- [ ] **Step 3: Implement** 위 시그니처 (모든 함수는 새 트리를 반환).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add immutable split layout tree operations`

### Task 10: 앱 셸 — 패널, 탭, 열기·저장·닫기 흐름

**Files:**
- Create: `src/renderer/store/layoutStore.ts`, `src/renderer/layout/{Pane,TabBar,SplitView}.tsx`, `src/renderer/app/{App,commands}.tsx`, `src/renderer/app/i18n/ko.ts`
- Test: `tests/unit/commands.test.ts`, `tests/e2e/files.spec.ts`

**Interfaces:**
- Consumes: Task 4, 5, 7, 8, 9.
- Produces: `commands`: `openFile()`, `saveActive()`, `saveAsActive()`, `closeTab(leafId, index)`, `newUntitled()`, `toggleView()`; `confirmUnsaved(name: string): Promise<'save'|'discard'|'cancel'>`(주입 가능 — 테스트에서 대체); `t(key: keyof typeof ko): string`.

- [ ] **Step 1: Write the failing tests** — `commands.test.ts`(mock API 주입): 수정된 문서 `closeTab` + 확인이 `'cancel'`이면 탭 유지, `'discard'`면 닫힘, `'save'`면 `writeFile` 호출 후 닫힘; 수정 안 된 문서는 확인 없이 닫힘; sourceOnly 문서는 `toggleView`가 `wysiwyg`로 못 바뀜; 읽기 전용 문서의 `saveActive`는 `saveAs`로 유도. e2e: 파일 열기→편집→Ctrl+S→탭의 수정됨 표시 사라짐; 다른 이름으로 저장 시 확장자 `.txt` 허용; 닫기 시 확인 대화.
- [ ] **Step 2: Run** `npx vitest run tests/unit/commands.test.ts` → FAIL.
- [ ] **Step 3: Implement** 단일 리프에서 동작하는 셸과 파일 흐름(F-01, F-06). 저장 실패 시 수정됨을 유지하고 토스트(스펙 §9). 5MB 초과·비UTF-8 경고 배너.
- [ ] **Step 4: Run** 단위 → PASS, e2e → PASS.
- [ ] **Step 5: Commit** `feat: add app shell with tabs and file open/save/close flows`

### Task 11: 사이드바 — 파일 트리와 개요

**Files:**
- Create: `src/renderer/sidebar/{FileTree,Outline}.tsx`, `src/renderer/store/settings.ts`
- Test: `tests/unit/outline.test.ts`, `tests/e2e/sidebar.spec.ts`

**Interfaces:**
- Produces: `extractOutline(markdown: string): Array<{ level: number; text: string; offset: number }>` (코드 블록 안의 `#`는 제외); 설정 `showAllFiles: boolean`.

- [ ] **Step 1: Write the failing tests** — `extractOutline`: 코드 블록 안 `# x` 제외, 한글 제목 포함, 빈 문서 → `[]`. e2e: 폴더 열기 → `.md`/`.txt`만 보이고 `.json`은 숨김, "모든 파일 표시" 켜면 `.json` 표시 후 열면 소스 모드 전용; 새 파일 만들기·이름 바꾸기·삭제(확인 대화 후) 동작.
- [ ] **Step 2: Run** `npx vitest run tests/unit/outline.test.ts` → FAIL.
- [ ] **Step 3: Implement** 파일 트리(F-02, F-03)와 개요 패널(F-08, 클릭 시 해당 위치로 이동). 삭제는 항상 확인을 거친다.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add sidebar file tree and outline`

### Task 12: 파일 감시, 자동 저장, 백업, 세션 복원, 최근 파일

**Files:**
- Create: `src/main/services/{watchService,sessionStore}.ts`, `src/shared/session.ts`
- Modify: `src/main/ipcHandlers.ts`, `src/renderer/app/App.tsx`
- Test: `tests/unit/sessionStore.test.ts`, `tests/unit/externalChange.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface SessionData { version: 1; layout: LayoutNode; docs: Array<{ id: string; path: string | null }>; folder: string | null; activeLeafId: string; recent: string[] }
  class SessionStore { constructor(dir: string); load(): Promise<SessionData | null>; save(s: SessionData): Promise<void>; writeBackup(docId: string, text: string): Promise<void>; readBackups(): Promise<Record<string, string>>; clearBackup(docId: string): Promise<void> }
  applyExternalChange(doc: Doc, ev: { kind: 'change' | 'unlink' }, r?: ReadResult): { action: 'reload' | 'banner' | 'markDeleted' }
  pushRecent(recent: string[], path: string, max?: number): string[]   // 기본 max 10, 중복 제거, 최신이 앞
  ```

- [ ] **Step 1: Write the failing tests** — `SessionStore`: 저장→로드 왕복, 파일이 손상된 JSON이면 `load()`가 `null`(앱이 새로 시작), 백업 쓰기/읽기/삭제. `applyExternalChange`: 수정 없는 문서의 `change` → `reload`, 수정 중이면 `banner`, `unlink` → `markDeleted`. `pushRecent`: 중복 제거·최대 길이.
- [ ] **Step 2: Run** `npx vitest run tests/unit/sessionStore.test.ts tests/unit/externalChange.test.ts` → FAIL.
- [ ] **Step 3: Implement** chokidar 기반 `watchService`(열린 파일과 폴더 감시, 앱 자신의 저장으로 인한 이벤트는 무시), 세션 저장(종료 시 + 레이아웃 변경 시 디바운스), 미저장 내용 주기 백업(30초), 시작 시 복원 및 미저장 백업 복구 제안, 자동 저장 옵션(설정).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add file watching, session restore, backups, recent files`

### Task 13: 분할 UI, 스크롤 연동, 다중 창 동기화

**Files:**
- Modify: `src/renderer/layout/{SplitView,Pane,TabBar}.tsx`, `src/renderer/app/commands.tsx`
- Create: `src/renderer/layout/scrollLink.ts`
- Test: `tests/unit/scrollLink.test.ts`, `tests/e2e/split.spec.ts`

**Interfaces:**
- Consumes: Task 9 트리 함수, Task 7 동기화.
- Produces: 명령 `splitActive(dir, side)`, `closeActivePane()`, `focusPane(delta)`; `ratioToOffset(ratio: number, scrollHeight: number, clientHeight: number): number`, `offsetToRatio(offset: number, scrollHeight: number, clientHeight: number): number`; 설정 `scrollLink: { a: string; b: string } | null`.

- [ ] **Step 1: Write the failing tests** — `scrollLink.test.ts`: `offsetToRatio(0,1000,400)===0`, `offsetToRatio(600,1000,400)===1`, `ratioToOffset`과 왕복, `scrollHeight<=clientHeight`면 0(0으로 나누기 없음). e2e(`split.spec.ts`): 단축키로 세로·가로 분할, 경계 드래그로 크기 변경, 더블클릭 균등화, 탭을 다른 창으로 드래그 이동, 같은 파일을 두 창에서 열고 한쪽에서 입력하면 다른 쪽이 갱신되며 입력 커서가 유지됨(S-03), 리프 6개 상태에서 7번째 분할 시도는 안내 토스트만 표시, 마지막 남은 창은 닫히지 않음.
- [ ] **Step 2: Run** `npx vitest run tests/unit/scrollLink.test.ts` → FAIL.
- [ ] **Step 3: Implement** 재귀 `SplitView`(경계 드래그/더블클릭/키보드 조절), 탭 드래그 앤 드롭, 분할·닫기·창 이동 단축키(모두 키보드로 도달 가능), 스크롤 연동 토글(S-07).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add split panes, tab moving, scroll link, same-file sync`

### Task 14: 비교 탭 (MergeView)

**Files:**
- Create: `src/renderer/editor/CompareView.tsx`
- Modify: `src/renderer/app/commands.tsx`
- Test: `tests/e2e/compare.spec.ts`

**Interfaces:**
- Consumes: `Tab` `{ kind: 'compare' }`(Task 9), `useDocuments`(Task 5).
- Produces: `<CompareView leftDocId rightDocId paneId />`; 명령 `compareDocs(leftId: string, rightId: string)`, `nextDiff()`, `prevDiff()`.

- [ ] **Step 1: API 확인** — 설치된 `@codemirror/merge` 버전의 `MergeView`, 다음/이전 차이 이동 함수, 되돌리기(병합) 컨트롤, 인라인 강조 옵션의 실제 이름을 `node_modules` 타입 정의에서 확인하고 이 태스크 아래에 결과를 한 줄 기록한다.
- [ ] **Step 2: Write the failing test** — `compare.spec.ts`(브라우저 모드): 서로 다른 두 문서(`a.md`: 3줄, `b.md`: 한 줄 수정+한 줄 추가)로 "비교…" → 비교 탭이 열리고 변경 줄 하이라이트가 존재하며 차이 개수가 표시됨; "다음 차이"가 다음 변경으로 이동; 오른쪽에서 입력하면 해당 Document가 수정됨 표시; 차이 블록 병합 컨트롤로 왼쪽 내용이 오른쪽에 반영; 두 문서가 같으면 "차이 없음" 표시.
- [ ] **Step 3: Run** `npx playwright test tests/e2e/compare.spec.ts` → FAIL.
- [ ] **Step 4: Implement** `CompareView`: 두 문서의 `text`로 MergeView를 만들고 편집은 각각 `setText(docId, text, paneId)`로 반영, 외부 갱신은 `shouldApplyRemote`로 처리. 소스 표시(마크다운 원문 기준).
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: add compare tab with side-by-side diff and merge controls`

### Task 15: 이미지 붙여넣기와 로컬 이미지 표시

**Files:**
- Create: `src/main/services/imageService.ts`
- Modify: `src/renderer/editor/WysiwygEditor.tsx`, `src/main/index.ts` (커스텀 프로토콜 등록)
- Test: `tests/unit/imageService.test.ts`

**Interfaces:**
- Produces: `ImageService.save(docPath: string | null, bytes: Uint8Array, ext: string): Promise<string>` — 문서 폴더 하위 `assets/`에 `img-<timestamp>.<ext>`로 저장하고 문서 기준 상대 경로를 반환. 허용 확장자 `png jpg jpeg gif webp`만.

- [ ] **Step 1: Write the failing tests** — 저장 경로가 `assets/` 하위이고 반환값이 `assets/img-….png`; 제목 없는 문서(`docPath===null`)는 reject(먼저 저장하라는 안내); `ext='exe'`/`'../x'` reject; 한글·공백 폴더에서도 상대 경로가 정확.
- [ ] **Step 2: Run** `npx vitest run tests/unit/imageService.test.ts` → FAIL.
- [ ] **Step 3: Implement** 서비스와 에디터 붙여넣기 핸들러(클립보드 이미지 → `api.saveImage` → 이미지 노드 삽입). 이미지 렌더링은 열어 둔 폴더 안 파일만 서비스하는 커스텀 프로토콜(`donotext-file://`)로 처리하고 허용 목록 밖은 404.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add clipboard image paste and scoped local image protocol`

### Task 16: 수식, front matter, 집중·타자기 모드

**Files:**
- Create: `src/renderer/editor/markdown/frontMatter.ts`
- Modify: `src/renderer/editor/markdown/extensions.ts`, `src/renderer/editor/WysiwygEditor.tsx`, `src/renderer/store/settings.ts`
- Test: `tests/unit/frontMatter.test.ts`, `tests/unit/codec.test.ts`(케이스 추가)

**Interfaces:**
- Produces: `splitFrontMatter(md: string): { frontMatter: string | null; body: string }`; 설정 `focusMode: boolean`, `typewriterMode: boolean`.

- [ ] **Step 1: Write the failing tests** — `splitFrontMatter('---\na: 1\n---\n# t')` → `{frontMatter:'a: 1', body:'# t'}`; front matter만 있는 문서 → body `''`; `---`만 있고 닫힘이 없으면 `frontMatter:null`. 코덱: front matter가 왕복에서 변하지 않음; `$a^2$`와 `$$\n x \n$$`가 왕복에서 보존됨.
- [ ] **Step 2: Run** `npx vitest run tests/unit/frontMatter.test.ts` → FAIL.
- [ ] **Step 3: Implement** KaTeX 인라인/블록 노드(렌더 실패 시 원문 표시), front matter 블록, 집중 모드(현재 단락 외 흐리게), 타자기 모드(커서 줄을 세로 중앙 유지).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add math, front matter, focus and typewriter modes`

### Task 17: HTML·PDF 내보내기

**Files:**
- Create: `src/main/services/exportService.ts`, `src/renderer/editor/exportHtml.ts`
- Test: `tests/unit/exportHtml.test.ts`

**Interfaces:**
- Consumes: `markdownToHtml`(Task 6).
- Produces: `buildExportHtml(markdown: string, title: string): string` — DOMPurify로 살균한 완전한 HTML 문서 문자열; `ExportService.exportPdf(html: string, outPath: string): Promise<void>`(숨김 창 + `webContents.printToPDF`).

- [ ] **Step 1: Write the failing tests** — `buildExportHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>','t')` 결과에 `<script`, `javascript:`, `onerror`가 없음 (Review Focus 3); 제목·표·코드 블록이 HTML 요소로 존재; `<title>`에 특수문자 이스케이프; 빈 문서도 유효한 HTML.
- [ ] **Step 2: Run** `npx vitest run tests/unit/exportHtml.test.ts` → FAIL.
- [ ] **Step 3: Implement** 살균은 렌더러(DOM 보유)에서 수행한 뒤 `api.exportHtml/exportPdf`로 문자열만 main에 전달한다. 메뉴에 내보내기 연결.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: add sanitized HTML and PDF export`

### Task 18: 테마, 한국어 UI 마무리, 패키징, 문서

**Files:**
- Create: `src/renderer/app/theme.css`, `electron-builder.yml`
- Modify: `src/renderer/store/settings.ts`, `src/renderer/app/i18n/ko.ts`, `README.md`, `HANDOFF.md`
- Test: `tests/unit/theme.test.ts`, `tests/e2e/theme.spec.ts`

**Interfaces:**
- Produces: `type Theme = 'light' | 'dark' | 'system'`; `resolveTheme(pref: Theme, systemDark: boolean): 'light' | 'dark'`.

- [ ] **Step 1: Write the failing tests** — `resolveTheme('system',true)==='dark'`, `resolveTheme('light',true)==='light'`; e2e: 테마 전환 시 `document.documentElement.dataset.theme`가 바뀌고 새로고침 후에도 유지. 모든 화면 문자열이 `ko.ts`를 통해 표시됨(하드코딩 한글 grep 점검 스크립트 `npm run check:i18n`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/theme.test.ts` → FAIL.
- [ ] **Step 3: Implement** CSS 변수 기반 라이트/다크 테마, 설정 UI, `electron-builder.yml`(Win/macOS/Linux 대상), README(실행·빌드·단축키·알려진 제한).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build && npx playwright test` → 모두 통과. 가능하면 `npx electron-builder --dir`로 패키징 확인, 불가하면 사유를 HANDOFF에 기록.
- [ ] **Step 5: HANDOFF 갱신** — 상태, 완료된 마일스톤(M1–M5), 로컬에서 직접 확인해야 할 항목(실제 Electron GUI, 서명/설치 파일)을 기록.
- [ ] **Step 6: Commit** `feat: add themes, Korean UI, packaging config, and docs`

---

## 마일스톤 대응

| 마일스톤 | 태스크 |
|---|---|
| M1 골격 + 단일 에디터 + 파일 열기/저장 | 1–8, 10(단일 리프) |
| M2 폴더 트리·탭·소스 모드·미저장 보호 | 8, 10, 11, 12 |
| M3 분할 레이아웃 | 9, 13 |
| M4 비교 탭 | 14 |
| M5 수식·집중/타자기·내보내기·테마·패키징 | 15–18 |

## 요구사항 커버리지 요약

E-01~E-06,E-08~E-11 → 6,7,8,16 / E-09 → 15 / S-01~S-05,S-07 → 9,13 / S-03 → 5,7,13 / S-06,S-08~S-10 → 14 / S-11 → 12 / F-01,F-06 → 10 / F-02,F-03,F-08 → 11 / F-05,F-07 → 12 / F-09 → 17 / F-10 → 18. P2(E-07, E-12, F-04, S-12)는 범위 밖.
