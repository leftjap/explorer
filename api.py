# PROJECT: explorer
"""파일 시스템 API — pywebview expose용"""

import os
import shutil
import subprocess
import ctypes
import struct
from ctypes import wintypes
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

    def copy_to_clipboard(self, file_path: str) -> dict:
        """시스템 클립보드에 파일을 CF_HDROP 포맷으로 복사"""
        try:
            file_path = os.path.abspath(file_path)
            if not os.path.exists(file_path):
                return {'success': False, 'error': '파일이 존재하지 않습니다'}

            # DROPFILES 구조체: 20바이트 헤더
            # pFiles(4) + pt.x(4) + pt.y(4) + fNC(4) + fWide(4)
            offset = 20
            fWide = 1  # 유니코드 사용

            # 파일 경로를 UTF-16LE로 인코딩 + 이중 널 종료
            encoded = file_path.encode('utf-16-le') + b'\x00\x00' + b'\x00\x00'

            # DROPFILES 헤더 생성
            header = struct.pack('IiiII', offset, 0, 0, 0, fWide)
            data = header + encoded

            GHND = 0x0042
            CF_HDROP = 15

            kernel32 = ctypes.windll.kernel32
            user32 = ctypes.windll.user32

            user32.OpenClipboard(None)
            user32.EmptyClipboard()

            hGlobal = kernel32.GlobalAlloc(GHND, len(data))
            pGlobal = kernel32.GlobalLock(hGlobal)
            ctypes.memmove(pGlobal, data, len(data))
            kernel32.GlobalUnlock(hGlobal)

            user32.SetClipboardData(CF_HDROP, hGlobal)
            user32.CloseClipboard()

            return {'success': True, 'name': os.path.basename(file_path)}
        except Exception as e:
            try:
                ctypes.windll.user32.CloseClipboard()
            except:
                pass
            return {'success': False, 'error': str(e)}
