# PROJECT: explorer
"""Miller Columns 파일 탐색기 — pywebview 엔트리포인트"""

import webview
from api import Api


def main():
    api = Api()
    window = webview.create_window(
        title="Explorer",
        url="index.html",
        js_api=api,
        width=1200,
        height=700,
        min_size=(800, 400),
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()
