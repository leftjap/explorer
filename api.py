# PROJECT: explorer
"""파일 시스템 API — pywebview expose용"""

import os
import shutil
import subprocess
from pathlib import Path

ROOT_PATH = r"C:\dev"


class Api:
    """pywebview에 노출되는 API 클래스."""

    def list_dir(self, path_str: str) -> dict:
        """주어진 경로의 디렉터리 목록을 반환한다.

        Returns:
            {"path": str, "items": [{"name": str, "is_dir": bool, "size": int}]}
            에러 시 {"error": str}
        """
        try:
            p = Path(path_str)
            if not p.exists():
                return {"error": f"경로가 존재하지 않습니다: {path_str}"}
            if not p.is_dir():
                return {"error": f"디렉터리가 아닙니다: {path_str}"}
            if not str(p.resolve()).startswith(ROOT_PATH):
                return {"error": f"허용 범위 밖: {path_str}"}

            items = []
            try:
                entries = sorted(p.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
            except PermissionError:
                return {"error": f"접근 권한이 없습니다: {path_str}"}

            for entry in entries:
                name = entry.name
                if name.startswith("."):
                    continue
                try:
                    is_dir = entry.is_dir()
                    size = 0 if is_dir else entry.stat().st_size
                except (PermissionError, OSError):
                    continue
                items.append({"name": name, "is_dir": is_dir, "size": size})

            return {"path": str(p), "items": items}
        except Exception as e:
            return {"error": str(e)}

    def open_file(self, path_str: str) -> dict:
        """파일을 기본 앱으로 연다."""
        try:
            p = Path(path_str)
            if not p.exists():
                return {"error": f"파일이 존재하지 않습니다: {path_str}"}
            if not str(p.resolve()).startswith(ROOT_PATH):
                return {"error": f"허용 범위 밖: {path_str}"}
            os.startfile(str(p))
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def get_root(self) -> str:
        """루트 경로를 반환한다."""
        return ROOT_PATH
