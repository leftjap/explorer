# PROJECT: explorer
# CLAUDE.md — Explorer (Miller Columns 파일 탐색기)

## 실행 방법
cd C:\dev\apps\explorer
.venv\Scripts\activate
python main.py

## 구조
- main.py: pywebview 윈도우 생성 + API 연결
- api.py: 파일 시스템 API (list_dir, open_file, copy, move)
- index.html: UI 레이아웃
- style.css: Miller Columns 스타일
- app.js: Miller Columns 로직 + 이벤트

## 주의사항
- Python 3.13 venv 사용 (.venv). 시스템 Python 3.14와 별도.
- pywebview는 pythonnet 의존 → Python 3.14 미지원 → 3.13 고정.
- Windows 전용. Unix 도구 금지 (L-08).
- 루트 경로는 api.py의 ROOT_PATH 상수. 하드코딩 C:\dev.
