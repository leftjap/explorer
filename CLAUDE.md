# CLAUDE.md — explorer

> 공통 실행 규칙은 opus CLAUDE.md 참조.
> 이 파일은 explorer 고유 주의사항만 담는다.

## explorer 고유 주의

- 코드 변경 후 PyInstaller exe 재빌드 필수. .spec 있으면 `pyinstaller Explorer.spec`, 없으면 `pyinstaller --onefile --noconsole --name Explorer --icon icon.ico --add-data "index.html;." --add-data "app.js;." --add-data "style.css;." main.py`
- favorites.json은 gitignore 대상. 런타임 자동 생성. 경로 하드코딩 금지
- api.py _is_allowed()로 경로 보안. 우회 금지
- 새 리소스 파일(html/js/css) 추가 시 PyInstaller --add-data에도 추가
- JS에서 Python API 호출은 비동기: await window.pywebview.api.함수명()
