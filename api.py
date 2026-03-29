# PROJECT: explorer
"""파일 시스템 API — pywebview expose용"""

import os
import shutil
import subprocess
import ctypes
import struct
from ctypes import wintypes
from pathlib import Path
from send2trash import send2trash

ROOT_PATH = r"C:\dev"

HIDDEN_NAMES = {"__pycache__", "node_modules", ".venv", ".git", ".claude", "$RECYCLE.BIN", "System Volume Information"}

# undo 스택: 작업 취소를 위한 히스토리
undo_stack = []


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

            undo_stack.append({'type': 'copy', 'dest': str(target)})
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

            undo_stack.append({'type': 'move', 'src': str(src_p), 'dest': str(target)})
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

    def copy_to_clipboard(self, file_path):
        """시스템 클립보드에 파일을 CF_HDROP 포맷으로 복사"""
        try:
            import ctypes
            from ctypes import wintypes as w
            import struct

            file_path = os.path.abspath(file_path)
            if not os.path.exists(file_path):
                return {'success': False, 'error': '파일이 존재하지 않습니다'}

            # ctypes 함수 타입 명시 선언 (64비트 필수)
            kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel32.GlobalAlloc.argtypes = [w.UINT, ctypes.c_size_t]
            kernel32.GlobalAlloc.restype = w.HGLOBAL
            kernel32.GlobalLock.argtypes = [w.HGLOBAL]
            kernel32.GlobalLock.restype = w.LPVOID
            kernel32.GlobalUnlock.argtypes = [w.HGLOBAL]
            kernel32.GlobalUnlock.restype = w.BOOL
            kernel32.RtlCopyMemory = ctypes.cdll.msvcrt.memcpy
            kernel32.RtlCopyMemory.argtypes = [w.LPVOID, w.LPCVOID, ctypes.c_size_t]
            kernel32.RtlCopyMemory.restype = None

            user32 = ctypes.WinDLL('user32', use_last_error=True)
            user32.OpenClipboard.argtypes = [w.HWND]
            user32.OpenClipboard.restype = w.BOOL
            user32.CloseClipboard.argtypes = []
            user32.CloseClipboard.restype = w.BOOL
            user32.EmptyClipboard.argtypes = []
            user32.EmptyClipboard.restype = w.BOOL
            user32.SetClipboardData.argtypes = [w.UINT, w.HANDLE]
            user32.SetClipboardData.restype = w.HANDLE

            CF_HDROP = 15
            GMEM_MOVEABLE = 0x0002

            # DROPFILES 구조체 (20바이트) + UTF-16LE 파일경로 + 이중 널 종료
            offset = 20
            encoded_path = file_path.encode('utf-16-le') + b'\x00\x00' + b'\x00\x00'
            header = struct.pack('IiiII', offset, 0, 0, 0, 1)
            data = header + encoded_path

            user32.OpenClipboard(None)
            user32.EmptyClipboard()

            hGlobal = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(data))
            pGlobal = kernel32.GlobalLock(hGlobal)
            ctypes.cdll.msvcrt.memcpy(ctypes.c_void_p(pGlobal), data, len(data))
            kernel32.GlobalUnlock(hGlobal)

            user32.SetClipboardData(CF_HDROP, hGlobal)
            user32.CloseClipboard()

            return {'success': True, 'name': os.path.basename(file_path)}
        except Exception as e:
            try:
                ctypes.WinDLL('user32').CloseClipboard()
            except:
                pass
            return {'success': False, 'error': str(e)}

    def delete_file(self, file_path):
        """파일/폴더를 휴지통으로 이동"""
        try:
            file_path = os.path.abspath(file_path)
            if not file_path.startswith(ROOT_PATH):
                return {'success': False, 'error': '허용되지 않은 경로'}
            if not os.path.exists(file_path):
                return {'success': False, 'error': '파일이 존재하지 않습니다'}
            name = os.path.basename(file_path)
            send2trash(file_path)
            return {'success': True, 'name': name}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def create_folder(self, parent_dir, folder_name):
        """새 폴더 생성"""
        try:
            parent_dir = os.path.abspath(parent_dir)
            if not parent_dir.startswith(ROOT_PATH):
                return {'success': False, 'error': '허용되지 않은 경로'}
            new_path = os.path.join(parent_dir, folder_name)
            if os.path.exists(new_path):
                return {'success': False, 'error': '이미 존재하는 이름입니다'}
            os.makedirs(new_path)
            undo_stack.append({'type': 'create_folder', 'path': new_path})
            return {'success': True, 'name': folder_name, 'path': new_path}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def rename_file(self, old_path, new_name):
        """파일/폴더 이름 변경"""
        try:
            old_path = os.path.abspath(old_path)
            if not old_path.startswith(ROOT_PATH):
                return {'success': False, 'error': '허용되지 않은 경로'}
            if not os.path.exists(old_path):
                return {'success': False, 'error': '파일이 존재하지 않습니다'}
            parent = os.path.dirname(old_path)
            new_path = os.path.join(parent, new_name)
            if os.path.exists(new_path):
                return {'success': False, 'error': '이미 존재하는 이름입니다'}
            os.rename(old_path, new_path)
            undo_stack.append({'type': 'rename', 'old_path': old_path, 'new_path': new_path})
            return {'success': True, 'old_name': os.path.basename(old_path), 'new_name': new_name, 'new_path': new_path}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def undo(self):
        """마지막 작업 실행 취소"""
        try:
            if not undo_stack:
                return {'success': False, 'error': '취소할 작업이 없습니다'}
            action = undo_stack.pop()
            action_type = action['type']

            if action_type == 'copy':
                # 복사된 파일 삭제
                if os.path.exists(action['dest']):
                    if os.path.isdir(action['dest']):
                        shutil.rmtree(action['dest'])
                    else:
                        os.remove(action['dest'])
                    return {'success': True, 'message': '복사 취소: ' + os.path.basename(action['dest'])}

            elif action_type == 'move':
                # 원래 위치로 되돌리기
                if os.path.exists(action['dest']):
                    shutil.move(action['dest'], action['src'])
                    return {'success': True, 'message': '이동 취소: ' + os.path.basename(action['src'])}

            elif action_type == 'rename':
                # 원래 이름으로 되돌리기
                if os.path.exists(action['new_path']):
                    os.rename(action['new_path'], action['old_path'])
                    return {'success': True, 'message': '이름 변경 취소: ' + os.path.basename(action['old_path'])}

            elif action_type == 'create_folder':
                # 생성된 폴더 삭제 (비어있는 경우만)
                if os.path.exists(action['path']):
                    if not os.listdir(action['path']):
                        os.rmdir(action['path'])
                        return {'success': True, 'message': '폴더 생성 취소: ' + os.path.basename(action['path'])}
                    else:
                        return {'success': False, 'error': '폴더가 비어있지 않아 취소 불가'}

            return {'success': False, 'error': '취소할 수 없는 작업'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
