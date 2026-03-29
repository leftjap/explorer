# PROJECT: explorer
"""파일 시스템 API — pywebview expose용"""

import os
import shutil
import subprocess
from pathlib import Path

ROOT_PATH = r"C:\dev"

HIDDEN_NAMES = {"__pycache__", "node_modules", ".venv", ".git", ".claude", "$RECYCLE.BIN", "System Volume Information"}


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
                if name.startswith(".") or name in HIDDEN_NAMES:
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

    def copy_file(self, src: str, dest_dir: str) -> dict:
        """src 파일/폴더를 dest_dir로 복사한다. 동일 이름 시 번호 추가."""
        try:
            src_p = Path(src)
            dest_p = Path(dest_dir)
            if not src_p.exists():
                return {"error": f"원본이 존재하지 않습니다: {src}"}
            if not dest_p.is_dir():
                return {"error": f"대상이 디렉터리가 아닙니다: {dest_dir}"}
            if not str(src_p.resolve()).startswith(ROOT_PATH):
                return {"error": f"허용 범위 밖: {src}"}
            if not str(dest_p.resolve()).startswith(ROOT_PATH):
                return {"error": f"허용 범위 밖: {dest_dir}"}

            target = dest_p / src_p.name
            target = self._unique_name(target)

            if src_p.is_dir():
                shutil.copytree(str(src_p), str(target))
            else:
                shutil.copy2(str(src_p), str(target))

            return {"ok": True, "dest": str(target)}
        except Exception as e:
            return {"error": str(e)}

    def move_file(self, src: str, dest_dir: str) -> dict:
        """src 파일/폴더를 dest_dir로 이동한다. 동일 이름 시 번호 추가."""
        try:
            src_p = Path(src)
            dest_p = Path(dest_dir)
            if not src_p.exists():
                return {"error": f"원본이 존재하지 않습니다: {src}"}
            if not dest_p.is_dir():
                return {"error": f"대상이 디렉터리가 아닙니다: {dest_dir}"}
            if not str(src_p.resolve()).startswith(ROOT_PATH):
                return {"error": f"허용 범위 밖: {src}"}
            if not str(dest_p.resolve()).startswith(ROOT_PATH):
                return {"error": f"허용 범위 밖: {dest_dir}"}

            target = dest_p / src_p.name
            target = self._unique_name(target)

            shutil.move(str(src_p), str(target))

            return {"ok": True, "dest": str(target)}
        except Exception as e:
            return {"error": str(e)}

    def _unique_name(self, target: Path) -> Path:
        """대상 경로에 동일 이름이 있으면 (1), (2)... 를 붙인 경로를 반환한다."""
        if not target.exists():
            return target
        stem = target.stem
        suffix = target.suffix
        parent = target.parent
        counter = 1
        while True:
            new_name = f"{stem} ({counter}){suffix}"
            candidate = parent / new_name
            if not candidate.exists():
                return candidate
            counter += 1
