## 2026-04-02

### Changed
- 빌드 중 앱 종료 불필요 — 실행 중 폴더 rename 후 교체 방식. build.bat 도입. (build.bat, AGENTS.md)
- 빌드 경로 분리 — 빌드 후 C:\apps\Finder\로 자동 복사, 작업표시줄 고정 유지. (AGENTS.md)

## 2026-04-01

### Added
- 사이드바 항목별 마지막 탐색 경로 기억 — 사이드바 항목 재클릭 시 이전 깊이까지 자동 복원. (app.js)

### Fixed
- 사이드바 전환 시 경로 복원 안 됨 — selectItem 내 columnPaths 저장 시점이 async loadColumn 완료 전이어서 불완전. 사이드바 클릭 핸들러의 전환 직전 저장만 유지. (app.js)
- 경로 복원이 컬럼 내 depth 0 폴더 전환에서 동작하지 않음 — 사이드바 전환만 처리했으나 실제 사용 패턴은 depth 0 컬럼 폴더 클릭. selectItem async 전환 + depth 0 전환 시 저장/복원 추가. [로직.사용패턴] (app.js)

### Changed
- 프로젝트명 Explorer → Finder 전면 변경 — Windows explorer.exe 프로세스 이름 충돌 해소 목적. (main.py, Explorer.spec→Finder.spec, index.html, AGENTS.md, CLAUDE.md)

### Removed
- __pycache__ 레포 트래킹 제거 — .gitignore 등록되어 있었으나 과거 커밋으로 트래킹 중이었음. (git rm --cached)
- build/ 폴더 삭제 — PyInstaller 중간 산출물 및 구 이름(Explorer) 잔재 폴더 포함. 재빌드 시 자동 생성됨
- Explorer.lnk 삭제 — 리네임 전 구 이름 바로가기 잔재
