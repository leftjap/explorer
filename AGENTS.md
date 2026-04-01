<!-- PROJECT: finder -->

# AGENTS.md — Finder 작업 가이드

> **공통 규칙**: AI의 응답은 간결한 경어체로 작성합니다.
> 이 문서는 finder 고유 규칙만 담는다. 코드 구조는 소스를 직접 읽어서 확인한다.
> 공통 규칙(트랙 판단, 작업지시서 형식, Claude Code 규칙, 디버깅 프로토콜)은
> https://raw.githubusercontent.com/leftjap/opus/main/common-rules.md 를 따른다.

---

## 0. 파일 업로드 기준

| 작업 유형 | 필요 파일 | 추가 확인 가능 |
|---|---|---|
| CSS만 변경 | style.css | — |
| JS 함수 수정 | app.js | — |
| Python API 수정 | api.py | main.py |
| 레이아웃 변경 | index.html + style.css | app.js |
| 사이드바 관련 | app.js + api.py | style.css |
| 컨텍스트 메뉴 | app.js + index.html | — |

---

## 1. 파일 구조

```
main.py           — pywebview 엔트리포인트. PyInstaller 리소스 경로 처리(sys._MEIPASS)
api.py            — 파일시스템 API (pywebview expose). 허용 경로 보안, 즐겨찾기, 클립보드, undo
app.js            — 프론트엔드 로직 (Miller Columns, 사이드바, 키보드, 컨텍스트 메뉴, 리네임)
index.html        — HTML 구조 + 컨텍스트 메뉴 DOM
style.css         — 전체 스타일 (Windows 11 라이트 테마)
icon.ico          — 앱 아이콘
favorites.json    — 사이드바 즐겨찾기 (런타임 자동 생성, gitignore)
column_widths.json — 컬럼 너비 설정 (런타임 자동 생성, gitignore)
```

---

## 2. finder 고유 주의사항

### exe 재빌드 필수
PyInstaller onedir 빌드. 코드 변경 후 exe 재빌드를 하지 않으면 변경분이 반영되지 않는다.
**모든 작업지시서의 커밋 Step 앞에 exe 재빌드 Step을 포함한다.**

빌드 명령:
```
cd C:\dev\apps\finder
build.bat
```

출력 경로: `C:\dev\apps\finder\dist\Finder\` → `C:\apps\Finder\` 로 자동 복사
사용자 실행 경로: `C:\apps\Finder\Finder.exe` (작업표시줄 고정 대상)
빌드는 앱 실행 중에도 완료됨 (실행 중 폴더를 rename 후 교체). 반영은 앱 재실행 시.

⚠️ .spec은 레포에 포함 필수 (gitignore 제외). onedir 모드 사용 — COLLECT 블록 존재, EXE에 exclude_binaries=True. onefile 전환 금지 (pywebview 동적 import 문제 발생).

### 경로 보안
api.py의 `_is_allowed()`로 모든 파일 접근을 제한. favorites.json의 경로가 ALLOWED_PATHS와 동기화됨. 우회 금지.

### favorites.json
런타임 자동 생성. gitignore 대상. 사용자 PC마다 다른 경로를 가질 수 있으므로 하드코딩 금지.

### pywebview 제약
- `sys._MEIPASS`: PyInstaller 번들에서 리소스 경로. `get_resource_path()` 사용 필수
- `window.pywebview.api`: JS→Python 호출. 비동기(async/await)
- 폴더 선택: `webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)`

### 작업 전 체크리스트
- [ ] exe 재빌드 Step 포함?
- [ ] _is_allowed() 경로 보안 우회 없음?
- [ ] favorites.json 하드코딩 없음?
- [ ] 새 리소스 파일 추가 시 --add-data 갱신?

---

## 3. 영향 범위 분석

시뮬레이션: ①전역 변수 ②그 변수를 읽는 함수 ③loadColumn/renderSidebar/컨텍스트 메뉴 정상 동작

고위험: 없음 (현재 규모 소형)
중위험: loadColumn(), renderSidebar(), handlePaste(), selectItem()

---

## 4. 소스 참조

| 항목 | 값 |
|---|---|
| GitHub raw base | https://raw.githubusercontent.com/leftjap/Finder/main/ |

크롤링 제외: 없음 (전체 파일 크롤링 가능)

---

## 5. 증상 → 의심 파일

| 증상 | 파일 |
|---|---|
| 사이드바 안 나옴 | api.py(get_favorites) + app.js(renderSidebar) |
| 폴더 목록 안 뜸 | api.py(list_dir) + app.js(loadColumn) |
| 복사/붙여넣기 실패 | api.py(copy_file/move_file) + app.js(handlePaste) |
| 컨텍스트 메뉴 안 뜸 | app.js(initContextMenu) + index.html |
| 이름 변경 안 됨 | api.py(rename_file) + app.js(startRename) |
| exe 실행 시 변경 미반영 | PyInstaller 재빌드 필요 |

---

## ⚠️ 프로세스 안전 (Critical)

- 이 프로젝트의 빌드 출력물은 `Finder.exe`이다.
- **절대로** `Stop-Process -Name Finder` 또는 이름 기반 프로세스 종료 명령을 실행하지 않는다.
- 빌드 전 앱 종료 불필요. 빌드 완료 후 안내: `사용자: 새 빌드가 배포되었습니다. 앱을 재실행하면 반영됩니다.`
- `Start-Process`로 GUI 앱을 자동 실행하지 않는다. 실행도 사용자에게 안내한다.
