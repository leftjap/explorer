// PROJECT: explorer
// Miller Columns 파일 탐색기 — 메인 로직

(function () {
    "use strict";

    var columnsEl = document.getElementById("columns");
    var breadcrumbEl = document.getElementById("breadcrumb");
    var statusbarEl = document.getElementById("statusbar");

    var columnPaths = [];
    var rootPath = "";

    // 클립보드 상태
    var clipboard = { path: "", mode: "" }; // mode: "copy" | "cut"

    // 시차 클릭 이름 변경 상태
    var renameState = {
        lastClickedPath: null,
        lastClickTime: 0,
        renameTimeout: null
    };

    // --- 초기화 ---

    async function init() {
        // Capture phase keydown 리스너 (최우선 처리 + preventDefault)
        document.addEventListener('keydown', function(e) {
            // Ctrl+C: 복사
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyC') {
                e.preventDefault();
                e.stopPropagation();
                handleCopy();
                return;
            }
            // Ctrl+X: 잘라내기
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyX') {
                e.preventDefault();
                e.stopPropagation();
                handleCut();
                return;
            }
            // Ctrl+V: 붙여넣기
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyV') {
                e.preventDefault();
                e.stopPropagation();
                handlePaste();
                return;
            }
            // Delete: 휴지통 삭제
            if (e.code === 'Delete' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                // rename 활성화 중이면 스킵
                if (document.querySelector('.name[contenteditable="true"]')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
                return;
            }
            // Ctrl+Shift+N: 새 폴더
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyN') {
                e.preventDefault();
                e.stopPropagation();
                handleNewFolder();
                return;
            }
            // Ctrl+Z: 실행 취소
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyZ') {
                // rename 활성화 중이면 스킵 (텍스트 undo)
                if (document.querySelector('.name[contenteditable="true"]')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                handleUndo();
                return;
            }
            // 나머지 키는 기존 로직
            handleKeydown(e);
        }, true);

        initContextMenu();
        rootPath = await window.pywebview.api.get_root();
        await loadColumn(rootPath, 0);
    }

    window.addEventListener("pywebviewready", function () {
        init();
    });

    // --- 컬럼 로드 ---

    async function loadColumn(path, depth) {
        while (columnsEl.children.length > depth) {
            columnsEl.removeChild(columnsEl.lastChild);
        }
        columnPaths = columnPaths.slice(0, depth);
        columnPaths.push(path);

        var result = await window.pywebview.api.list_dir(path);

        if (result.error) {
            statusbarEl.textContent = "오류: " + result.error;
            return;
        }

        var col = document.createElement("div");
        col.className = "column";
        col.dataset.depth = depth;
        col.dataset.path = path;

        if (result.items.length === 0) {
            var empty = document.createElement("div");
            empty.className = "column-item";
            empty.style.color = "#666";
            empty.textContent = "(비어 있음)";
            col.appendChild(empty);
        } else {
            result.items.forEach(function (item) {
                var row = document.createElement("div");
                row.className = "column-item";
                row.dataset.name = item.name;
                row.dataset.isDir = item.is_dir;
                row.dataset.path = path + "\\" + item.name;

                var icon = document.createElement("span");
                icon.className = "icon";
                icon.textContent = item.is_dir ? "📁" : "📄";

                var name = document.createElement("span");
                name.className = "name";
                name.textContent = item.name;

                row.appendChild(icon);
                row.appendChild(name);

                if (item.is_dir) {
                    var arrow = document.createElement("span");
                    arrow.className = "arrow";
                    arrow.textContent = "›";
                    row.appendChild(arrow);
                }

                row.addEventListener("click", function () {
                    handleItemClickUnified(row, depth);
                });

                col.appendChild(row);
            });
        }

        columnsEl.appendChild(col);
        columnsEl.scrollLeft = columnsEl.scrollWidth;

        updateBreadcrumb();
        updateStatusbar(result.items.length);
    }

    // --- 컬럼 새로고침 ---

    async function refreshColumn(depth) {
        if (depth < 0 || depth >= columnPaths.length) return;
        var path = columnPaths[depth];
        var result = await window.pywebview.api.list_dir(path);
        if (result.error) return;

        var col = columnsEl.children[depth];
        if (!col) return;

        var selectedName = null;
        var prev = col.querySelector(".selected");
        if (prev) selectedName = prev.dataset.name;

        col.innerHTML = "";

        if (result.items.length === 0) {
            var empty = document.createElement("div");
            empty.className = "column-item";
            empty.style.color = "#666";
            empty.textContent = "(비어 있음)";
            col.appendChild(empty);
        } else {
            result.items.forEach(function (item) {
                var row = document.createElement("div");
                row.className = "column-item";
                row.dataset.name = item.name;
                row.dataset.isDir = item.is_dir;
                row.dataset.path = path + "\\" + item.name;

                var icon = document.createElement("span");
                icon.className = "icon";
                icon.textContent = item.is_dir ? "📁" : "📄";

                var name = document.createElement("span");
                name.className = "name";
                name.textContent = item.name;

                row.appendChild(icon);
                row.appendChild(name);

                if (item.is_dir) {
                    var arrow = document.createElement("span");
                    arrow.className = "arrow";
                    arrow.textContent = "›";
                    row.appendChild(arrow);
                }

                if (item.name === selectedName) {
                    row.classList.add("selected");
                }

                row.addEventListener("click", function () {
                    handleItemClickUnified(row, depth);
                });

                col.appendChild(row);
            });
        }

        updateStatusbar(result.items.length);
    }

    // --- 클릭 핸들러 ---

    function handleItemClickUnified(row, depth) {
        var now = Date.now();
        var path = row.dataset.path;

        // 시차 클릭 (300ms 이내) → 더블클릭 취급
        if (now - renameState.lastClickTime < 300 && renameState.lastClickedPath === path) {
            clearTimeout(renameState.renameTimeout);
            renameState.lastClickedPath = null;
            // 더블클릭 처리 (폴더 진입 또는 파일 열기)
            handleDoubleClick(row, depth);
            return;
        }

        // 이미 선택된 항목을 다시 클릭 (300ms~1500ms) → rename 예약
        if (renameState.lastClickedPath === path && now - renameState.lastClickTime >= 300) {
            clearTimeout(renameState.renameTimeout);
            renameState.renameTimeout = setTimeout(function() {
                startRename(row);
            }, 500);
            renameState.lastClickedPath = path;
            renameState.lastClickTime = now;
            return;
        }

        // 새 항목 클릭 → 기존 선택 로직
        clearTimeout(renameState.renameTimeout);
        renameState.lastClickedPath = path;
        renameState.lastClickTime = now;
        selectItem(row, depth);
    }

    function selectItem(row, depth) {
        var col = row.parentElement;
        var prevSelected = col.querySelector(".selected");
        if (prevSelected) {
            prevSelected.classList.remove("selected");
        }

        row.classList.add("selected");

        if (row.dataset.isDir === "true") {
            loadColumn(row.dataset.path, depth + 1);
        } else {
            while (columnsEl.children.length > depth + 1) {
                columnsEl.removeChild(columnsEl.lastChild);
            }
            columnPaths = columnPaths.slice(0, depth + 1);
            updateBreadcrumb();
            statusbarEl.textContent = row.dataset.name;
        }
    }

    function handleDoubleClick(row, depth) {
        // 더블클릭: 폴더는 진입, 파일은 열기
        if (row.dataset.isDir === "true") {
            selectItem(row, depth);
        } else {
            openFile(row.dataset.path);
        }
    }

    async function openFile(path) {
        statusbarEl.textContent = "열는 중: " + path;
        var result = await window.pywebview.api.open_file(path);
        if (result.error) {
            statusbarEl.textContent = "오류: " + result.error;
        } else {
            statusbarEl.textContent = "열림: " + path;
        }
    }

    // --- 키보드 ---

    function getActiveColumn() {
        // 선택된 항목이 있는 가장 깊은 컬럼
        for (var i = columnsEl.children.length - 1; i >= 0; i--) {
            var col = columnsEl.children[i];
            if (col.querySelector(".selected")) {
                return { col: col, depth: parseInt(col.dataset.depth) };
            }
        }
        // 선택된 게 없으면 첫 번째 컬럼
        if (columnsEl.children.length > 0) {
            return { col: columnsEl.children[0], depth: 0 };
        }
        return null;
    }

    function getSelectableItems(col) {
        var items = col.querySelectorAll(".column-item");
        var result = [];
        for (var i = 0; i < items.length; i++) {
            if (items[i].dataset.name) result.push(items[i]);
        }
        return result;
    }

    function handleKeydown(e) {
        // rename 활성화 중이면 방향키/Delete 처리 제외
        if (document.querySelector('.name[contenteditable="true"]')) return;

        var active = getActiveColumn();
        if (!active) return;

        var col = active.col;
        var depth = active.depth;
        var items = getSelectableItems(col);
        if (items.length === 0) return;

        var selected = col.querySelector(".selected");
        var idx = -1;
        if (selected) {
            for (var i = 0; i < items.length; i++) {
                if (items[i] === selected) { idx = i; break; }
            }
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            var next = idx < items.length - 1 ? idx + 1 : idx;
            if (selected) selected.classList.remove("selected");
            items[next].classList.add("selected");
            items[next].scrollIntoView({ block: "nearest" });
            statusbarEl.textContent = items[next].dataset.name;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            var prev = idx > 0 ? idx - 1 : 0;
            if (selected) selected.classList.remove("selected");
            items[prev].classList.add("selected");
            items[prev].scrollIntoView({ block: "nearest" });
            statusbarEl.textContent = items[prev].dataset.name;
        } else if (e.key === "ArrowRight" || e.key === "Enter") {
            e.preventDefault();
            if (!selected) return;
            if (selected.dataset.isDir === "true") {
                loadColumn(selected.dataset.path, depth + 1).then(function () {
                    // 새 컬럼의 첫 항목 선택
                    var newCol = columnsEl.children[depth + 1];
                    if (newCol) {
                        var newItems = getSelectableItems(newCol);
                        if (newItems.length > 0) {
                            newItems[0].classList.add("selected");
                            statusbarEl.textContent = newItems[0].dataset.name;
                        }
                    }
                });
            } else if (e.key === "Enter") {
                openFile(selected.dataset.path);
            }
        } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
            e.preventDefault();
            if (depth > 0) {
                // 현재 컬럼 이후 제거
                while (columnsEl.children.length > depth) {
                    columnsEl.removeChild(columnsEl.lastChild);
                }
                columnPaths = columnPaths.slice(0, depth);
                // 이전 컬럼의 선택 항목에 포커스
                var prevCol = columnsEl.children[depth - 1];
                if (prevCol) {
                    var prevSelected = prevCol.querySelector(".selected");
                    if (prevSelected) {
                        statusbarEl.textContent = prevSelected.dataset.name;
                    }
                }
                updateBreadcrumb();
            }
        }
    }

    // --- 복사 / 잘라내기 / 붙여넣기 ---

    function getSelectedItem() {
        for (var i = columnsEl.children.length - 1; i >= 0; i--) {
            var sel = columnsEl.children[i].querySelector(".selected");
            if (sel && sel.dataset.path) return sel;
        }
        return null;
    }

    function getCurrentDirPath() {
        // 현재 보고 있는 가장 깊은 디렉터리 경로
        // 선택된 항목이 폴더면 그 폴더, 파일이면 그 파일의 부모
        var sel = getSelectedItem();
        if (sel) {
            if (sel.dataset.isDir === "true") {
                // 선택된 폴더의 부모 (= 해당 컬럼의 path)
                return sel.parentElement.dataset.path;
            } else {
                return sel.parentElement.dataset.path;
            }
        }
        if (columnPaths.length > 0) {
            return columnPaths[columnPaths.length - 1];
        }
        return rootPath;
    }

    async function handleCopy() {
        var sel = getSelectedItem();
        if (!sel) {
            statusbarEl.textContent = "복사할 항목을 선택하세요";
            return;
        }
        clipboard = { path: sel.dataset.path, mode: "copy" };
        document.querySelectorAll(".column-item.cut").forEach(function(el) {
            el.classList.remove("cut");
        });
        try {
            var result = await window.pywebview.api.copy_to_clipboard(sel.dataset.path);
            if (result.success) {
                statusbarEl.textContent = "복사: " + result.name;
            } else {
                statusbarEl.textContent = "복사 실패: " + result.error;
            }
        } catch (e) {
            statusbarEl.textContent = "복사: " + sel.dataset.name;
        }
    }

    async function handleCut() {
        var sel = getSelectedItem();
        if (!sel) {
            statusbarEl.textContent = "잘라낼 항목을 선택하세요";
            return;
        }
        clipboard = { path: sel.dataset.path, mode: "cut" };
        document.querySelectorAll(".column-item.cut").forEach(function(el) {
            el.classList.remove("cut");
        });
        sel.classList.add("cut");
        try {
            await window.pywebview.api.copy_to_clipboard(sel.dataset.path);
            statusbarEl.textContent = "잘라내기: " + sel.dataset.name;
        } catch (e) {
            statusbarEl.textContent = "잘라내기: " + sel.dataset.name;
        }
    }

    async function handlePaste() {
        if (!clipboard.path) {
            statusbarEl.textContent = "클립보드가 비어 있습니다";
            return;
        }

        var destDir = getCurrentDirPath();
        statusbarEl.textContent = "붙여넣는 중...";

        var result;
        if (clipboard.mode === "copy") {
            result = await window.pywebview.api.copy_file(clipboard.path, destDir);
        } else {
            result = await window.pywebview.api.move_file(clipboard.path, destDir);
        }

        if (result.error) {
            statusbarEl.textContent = "오류: " + result.error;
            return;
        }

        // cut이면 원본 컬럼도 새로고침 + 클립보드 초기화
        if (clipboard.mode === "cut") {
            var srcDir = clipboard.path.substring(0, clipboard.path.lastIndexOf("\\"));
            // 원본 폴더가 보이는 컬럼 찾아서 새로고침
            for (var i = 0; i < columnsEl.children.length; i++) {
                if (columnsEl.children[i].dataset.path === srcDir) {
                    await refreshColumn(i);
                    break;
                }
            }
            clipboard = { path: "", mode: "" };
            clearCutStyle();
        }

        // 대상 컬럼 새로고침
        for (var j = 0; j < columnsEl.children.length; j++) {
            if (columnsEl.children[j].dataset.path === destDir) {
                await refreshColumn(j);
                break;
            }
        }

        var filename = result.dest.substring(result.dest.lastIndexOf("\\") + 1);
        statusbarEl.textContent = "완료: " + filename;
    }

    function clearCutStyle() {
        var cuts = document.querySelectorAll(".column-item.cut");
        for (var i = 0; i < cuts.length; i++) {
            cuts[i].classList.remove("cut");
        }
    }

    // --- 브레드크럼 ---

    function updateBreadcrumb() {
        breadcrumbEl.innerHTML = "";

        var segments = [];
        segments.push({ label: rootPath.split("\\").pop() || rootPath, path: rootPath });

        for (var i = 0; i < columnsEl.children.length; i++) {
            var col = columnsEl.children[i];
            var selected = col.querySelector(".selected");
            if (selected) {
                segments.push({ label: selected.dataset.name, path: selected.dataset.path });
            }
        }

        segments.forEach(function (seg, idx) {
            if (idx > 0) {
                var sep = document.createElement("span");
                sep.className = "sep";
                sep.textContent = "›";
                breadcrumbEl.appendChild(sep);
            }

            var span = document.createElement("span");
            span.textContent = seg.label;
            span.dataset.path = seg.path;
            span.addEventListener("click", function () {
                loadColumn(seg.path, idx);
            });
            breadcrumbEl.appendChild(span);
        });
    }

    // --- 상태바 ---

    function updateStatusbar(count) {
        statusbarEl.textContent = count + "개 항목";
    }

    // --- Delete 휴지통 삭제 ---

    async function handleDelete() {
        var selected = getSelectedItem();
        if (!selected) return;
        var name = selected.dataset.name;
        var path = selected.dataset.path;
        var isDir = selected.dataset.isDir === "true";
        if (!confirm(name + '을(를) 휴지통으로 이동하시겠습니까?')) return;
        try {
            var result = await window.pywebview.api.delete_file(path);
            if (result.success) {
                statusbarEl.textContent = '삭제됨: ' + result.name;
                // 현재 컬럼 찾기
                var col = selected.parentElement;
                var depth = parseInt(col.dataset.depth);
                // 폴더 삭제면 하위 컬럼 제거
                if (isDir) {
                    while (columnsEl.children.length > depth + 1) {
                        columnsEl.removeChild(columnsEl.lastChild);
                    }
                    columnPaths = columnPaths.slice(0, depth + 1);
                }
                // 현재 컬럼 새로고침
                refreshColumn(depth);
            } else {
                statusbarEl.textContent = '삭제 실패: ' + result.error;
            }
        } catch (e) {
            statusbarEl.textContent = '삭제 실패: ' + e.message;
        }
    }

    // --- Ctrl+Shift+N 새 폴더 ---

    async function handleNewFolder() {
        var currentDir = getCurrentDirectory();
        if (!currentDir) return;
        var folderName = prompt('새 폴더 이름:');
        if (!folderName || folderName.trim() === '') return;
        try {
            var result = await window.pywebview.api.create_folder(currentDir, folderName.trim());
            if (result.success) {
                statusbarEl.textContent = '생성됨: ' + result.name;
                // 현재 컬럼 새로고침
                var columns = document.querySelectorAll('.column');
                var targetDepth = -1;
                for (var i = 0; i < columns.length; i++) {
                    if (columns[i].dataset.path === currentDir) {
                        targetDepth = i;
                        break;
                    }
                }
                if (targetDepth >= 0) {
                    refreshColumn(targetDepth);
                }
            } else {
                statusbarEl.textContent = '생성 실패: ' + result.error;
            }
        } catch (e) {
            statusbarEl.textContent = '생성 실패: ' + e.message;
        }
    }

    function getCurrentDirectory() {
        // 현재 보고 있는 폴더 경로
        var columns = document.querySelectorAll('.column');
        if (columns.length === 0) return null;
        var lastColumn = columns[columns.length - 1];
        return lastColumn.dataset.path || null;
    }

    // --- 시차 클릭 이름 변경 ---

    function startRename(row) {
        var nameSpan = row.querySelector('.name');
        if (!nameSpan) return;
        var oldName = nameSpan.textContent;
        nameSpan.contentEditable = 'true';
        nameSpan.focus();

        // 확장자 앞까지만 선택
        var dotIndex = oldName.lastIndexOf('.');
        var range = document.createRange();
        var sel = window.getSelection();
        if (nameSpan.firstChild) {
            range.setStart(nameSpan.firstChild, 0);
            range.setEnd(nameSpan.firstChild, dotIndex > 0 ? dotIndex : oldName.length);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        var keyHandler = function(e) {
            if (e.code === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                finishRename(row, oldName, nameSpan.textContent.trim());
                nameSpan.contentEditable = 'false';
                nameSpan.removeEventListener('keydown', keyHandler);
            }
            if (e.code === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                nameSpan.textContent = oldName;
                nameSpan.contentEditable = 'false';
                nameSpan.removeEventListener('keydown', keyHandler);
            }
        };

        nameSpan.addEventListener('keydown', keyHandler);

        var blurHandler = function() {
            if (nameSpan.contentEditable === 'true') {
                finishRename(row, oldName, nameSpan.textContent.trim());
                nameSpan.contentEditable = 'false';
            }
            nameSpan.removeEventListener('blur', blurHandler);
        };

        nameSpan.addEventListener('blur', blurHandler);
    }

    async function finishRename(row, oldName, newName) {
        if (!newName || newName === oldName) return;
        try {
            var result = await window.pywebview.api.rename_file(row.dataset.path, newName);
            if (result.success) {
                row.dataset.path = result.new_path;
                row.dataset.name = result.new_name;
                row.querySelector('.name').textContent = result.new_name;
                statusbarEl.textContent = '이름 변경: ' + result.old_name + ' → ' + result.new_name;
                // 컬럼 새로고침
                var col = row.parentElement;
                var depth = parseInt(col.dataset.depth);
                refreshColumn(depth);
            } else {
                row.querySelector('.name').textContent = oldName;
                statusbarEl.textContent = '이름 변경 실패: ' + result.error;
            }
        } catch (e) {
            row.querySelector('.name').textContent = oldName;
            statusbarEl.textContent = '이름 변경 실패: ' + e.message;
        }
    }

    // --- Ctrl+Z 실행 취소 ---

    async function handleUndo() {
        try {
            var result = await window.pywebview.api.undo();
            if (result.success) {
                statusbarEl.textContent = result.message;
                // 전체 컬럼 새로고침
                reloadCurrentView();
            } else {
                statusbarEl.textContent = result.error;
            }
        } catch (e) {
            statusbarEl.textContent = '실행 취소 실패: ' + e.message;
        }
    }

    async function reloadCurrentView() {
        // 현재 경로를 유지하면서 모든 컬럼 새로고침
        var paths = columnPaths.slice();
        if (paths.length === 0) {
            await loadColumn(rootPath, 0);
        } else {
            for (var i = 0; i < paths.length; i++) {
                var result = await window.pywebview.api.list_dir(paths[i]);
                if (result.error) {
                    // 삭제된 경로면 거기서 중단
                    while (columnsEl.children.length > i) {
                        columnsEl.removeChild(columnsEl.lastChild);
                    }
                    columnPaths = columnPaths.slice(0, i);
                    break;
                }
                await refreshColumn(i);
            }
        }
        updateBreadcrumb();
    }

    // --- 컨텍스트 메뉴 ---

    var contextMenuEl = document.getElementById("context-menu");
    var contextTarget = null; // 우클릭한 항목 (row element 또는 null)
    var contextDepth = -1;    // 우클릭한 컬럼의 depth

    function initContextMenu() {
        // 우클릭 이벤트
        columnsEl.addEventListener("contextmenu", function (e) {
            e.preventDefault();

            var row = e.target.closest(".column-item");
            var col = e.target.closest(".column");

            if (row && row.dataset.path) {
                // 항목 우클릭 → 해당 항목 선택
                contextTarget = row;
                contextDepth = col ? parseInt(col.dataset.depth) : -1;
                selectItem(row, contextDepth);
            } else if (col) {
                // 빈 영역 우클릭
                contextTarget = null;
                contextDepth = parseInt(col.dataset.depth);
            } else {
                contextTarget = null;
                contextDepth = -1;
            }

            showContextMenu(e.clientX, e.clientY);
        });

        // 메뉴 항목 클릭
        contextMenuEl.addEventListener("click", function (e) {
            var item = e.target.closest(".ctx-item");
            if (!item || item.classList.contains("disabled")) return;

            var action = item.dataset.action;
            hideContextMenu();

            switch (action) {
                case "open":
                    if (contextTarget) {
                        if (contextTarget.dataset.isDir === "true") {
                            loadColumn(contextTarget.dataset.path, contextDepth + 1);
                        } else {
                            openFile(contextTarget.dataset.path);
                        }
                    }
                    break;
                case "copy":
                    handleCopy();
                    break;
                case "cut":
                    handleCut();
                    break;
                case "paste":
                    handlePaste();
                    break;
                case "rename":
                    if (contextTarget) {
                        startRename(contextTarget);
                    }
                    break;
                case "delete":
                    handleDelete();
                    break;
                case "newFolder":
                    handleNewFolder();
                    break;
            }
        });

        // 메뉴 밖 클릭 → 닫기
        document.addEventListener("click", function () {
            hideContextMenu();
        });

        // Esc → 닫기
        document.addEventListener("keydown", function (e) {
            if (e.code === "Escape" && contextMenuEl.style.display !== "none") {
                hideContextMenu();
            }
        });
    }

    function showContextMenu(x, y) {
        var hasTarget = contextTarget !== null;
        var hasClipboard = clipboard.path !== "";

        // 항목별 활성/비활성
        var items = contextMenuEl.querySelectorAll(".ctx-item");
        for (var i = 0; i < items.length; i++) {
            var action = items[i].dataset.action;
            items[i].classList.remove("disabled");

            if (action === "open" && !hasTarget) {
                items[i].classList.add("disabled");
            }
            if ((action === "copy" || action === "cut") && !hasTarget) {
                items[i].classList.add("disabled");
            }
            if (action === "paste" && !hasClipboard) {
                items[i].classList.add("disabled");
            }
            if (action === "rename" && !hasTarget) {
                items[i].classList.add("disabled");
            }
            if (action === "delete" && !hasTarget) {
                items[i].classList.add("disabled");
            }
        }

        // 위치 결정 (화면 밖으로 나가지 않도록)
        contextMenuEl.style.display = "block";
        var menuW = contextMenuEl.offsetWidth;
        var menuH = contextMenuEl.offsetHeight;
        var winW = window.innerWidth;
        var winH = window.innerHeight;

        if (x + menuW > winW) x = winW - menuW - 4;
        if (y + menuH > winH) y = winH - menuH - 4;
        if (x < 0) x = 0;
        if (y < 0) y = 0;

        contextMenuEl.style.left = x + "px";
        contextMenuEl.style.top = y + "px";
    }

    function hideContextMenu() {
        contextMenuEl.style.display = "none";
        contextTarget = null;
    }
})();
