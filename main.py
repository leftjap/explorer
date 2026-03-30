# PROJECT: explorer
"""Miller Columns 파일 탐색기 — pywebview 엔트리포인트"""

import os
import sys
import webview
from api import Api


def get_resource_path(filename):
    """PyInstaller 번들 또는 개발 환경에서 리소스 경로를 반환한다."""
    if getattr(sys, '_MEIPASS', None):
        return os.path.join(sys._MEIPASS, filename)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)


def main():
    api = Api()
    window = webview.create_window(
        title="Explorer",
        url=get_resource_path("index.html"),
        js_api=api,
        width=1200,
        height=700,
        min_size=(800, 400),
    )
    webview.start(
        debug=False,
        private_mode=False,
        storage_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "webview_data"),
        http_server=True,
        http_port=18904,
    )


if __name__ == "__main__":
    main()
