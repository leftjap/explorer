// PROJECT: explorer
// Miller Columns 파일 탐색기 — 메인 로직

(function () {
    "use strict";

    var columnsEl = document.getElementById("columns");
    var breadcrumbEl = document.getElementById("breadcrumb");
    var statusbarEl = document.getElementById("statusbar");
    var sidebarEl = document.getElementById("sidebar");
    var sidebarResizerEl = document.getElementById("sidebar-resizer");

    var columnPaths = [];
    var rootPath = "";

    // 클립보드 상태
    var clipboard = { paths: [], mode: "" }; // mode: "copy" | "cut"

    // 시차 클릭 이름 변경 상태
    var renameState = {
        lastClickedPath: null,
        lastClickTime: 0,
        renameTimeout: null
    };

    // 컬럼 너비 저장 (depth별)
    var COLUMN_WIDTHS_KEY = "explorer_column_widths";

    function loadColumnWidths() {
        try {
            var stored = localStorage.getItem(COLUMN_WIDTHS_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    }

    function saveColumnWidth(depth, width) {
        var widths = loadColumnWidths();
        widths[depth] = width;
        try {
            localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths));
        } catch (e) {
            // localStorage 실패 무시
        }
    }

    function getColumnWidth(depth) {
        var widths = loadColumnWidths();
        return widths[depth] || null;
    }

    // --- 초기화 ---

    async function init() {
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyC') {
                e.preventDefault();
                e.stopPropagation();
                handleCopy();
                return;
            }
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyX') {
                e.preventDefault();
                e.stopPropagation();
                handleCut();
                return;
            }
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyV') {
                e.preventDefault();
                e.stopPropagation();
                handlePaste();
                return;
            }
            if (e.code === 'Delete' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                if (document.querySelector('.name[contenteditable="true"]')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                handleDelete();
                return;
            }
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyN') {
                e.preventDefault();
                e.stopPropagation();
                handleNewFolder();
                return;
            }
            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyZ') {
                if (document.querySelector('.name[contenteditable="true"]')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                handleUndo();
                return;
            }
            handleKeydown(e);
        }, true);

        initContextMenu();
        initSidebarResizer();

        var favorites = await window.pywebview.api.get_favorites();
        renderSidebar(favorites);

        rootPath = favorites.length > 0 ? favorites[0].path : await window.pywebview.api.get_root();
        await loadColumn(rootPath, 0);
    }

    function renderSidebar(favorites) {
        sidebarEl.innerHTML = "";
        for (var i = 0; i < favorites.length; i++) {
            (function(fav) {
                var item = document.createElement("div");
                item.className = "sidebar-item";
                if (fav.path === rootPath) item.classList.add("active");
                item.dataset.path = fav.path;

                var icon = document.createElement("span");
                icon.className = "sidebar-icon";
                icon.textContent = fav.icon;

                var name = document.createElement("span");
                name.textContent = fav.name;

                item.appendChild(icon);
                item.appendChild(name);

                item.addEventListener("click", function() {
                    rootPath = fav.path;
                    var allItems = sidebarEl.querySelectorAll(".sidebar-item");
                    for (var j = 0; j < allItems.length; j++) {
                        allItems[j].classList.remove("active");
                    }
                    item.classList.add("active");
                    columnPaths = [];
                    loadColumn(rootPath, 0);
                });

                item.addEventListener("contextmenu", function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    showSidebarContextMenu(e.clientX, e.clientY, fav.path);
                });

                sidebarEl.appendChild(item);
            })(favorites[i]);
        }

        // "+" 추가 버튼
        var addBtn = document.createElement("div");
        addBtn.className = "sidebar-add";
        var addIcon = document.createElement("span");
        addIcon.className = "sidebar-add-icon";
        addIcon.textContent = "+";
        var addLabel = document.createElement("span");
        addLabel.textContent = "폴더 추가";
        addBtn.appendChild(addIcon);
        addBtn.appendChild(addLabel);
        addBtn.addEventListener("click", handleAddFavorite);
        sidebarEl.appendChild(addBtn);
    }

    // --- 사이드바 즐겨찾기 관리 ---

    var sidebarCtxEl = null;
    var sidebarCtxPath = "";

    function showSidebarContextMenu(x, y, path) {
        if (!sidebarCtxEl) {
            sidebarCtxEl = document.getElementById("sidebar-context-menu");
            sidebarCtxEl.addEventListener("click", function(e) {
                var item = e.target.closest(".ctx-item");
                if (!item) return;
                var action = item.dataset.action;
                hideSidebarContextMenu();
                if (action === "sidebar-remove") {
                    handleRemoveFavorite(sidebarCtxPath);
                } else if (action === "sidebar-rename") {
                    handleRenameFavorite(sidebarCtxPath);
                }
            });
            document.addEventListener("click", function() {
                hideSidebarContextMenu();
            });
        }
        sidebarCtxPath = path;
        sidebarCtxEl.style.display = "block";

        var menuW = sidebarCtxEl.offsetWidth;
        var menuH = sidebarCtxEl.offsetHeight;
        var winW = window.innerWidth;
        var winH = window.innerHeight;
        if (x + menuW > winW) x = winW - menuW - 4;
        if (y + menuH > winH) y = winH - menuH - 4;
        if (x < 0) x = 0;
        if (y < 0) y = 0;

        sidebarCtxEl.style.left = x + "px";
        sidebarCtxEl.style.top = y + "px";
    }

    function hideSidebarContextMenu() {
        if (sidebarCtxEl) {
            sidebarCtxEl.style.display = "none";
        }
    }

    async function handleAddFavorite() {
        var result = await window.pywebview.api.add_favorite();
        if (result.success) {
            renderSidebar(result.favorites);
            statusbarEl.textContent = "즐겨찾기 추가됨";
        } else if (result.error !== "선택 취소") {
            statusbarEl.textContent = "추가 실패: " + result.error;
        }
    }

    async function handleRemoveFavorite(path) {
        var result = await window.pywebview.api.remove_favorite(path);
        if (result.success) {
            // 제거된 경로가 현재 rootPath이면 첫 항목으로 전환
            if (path === rootPath && result.favorites.length > 0) {
                rootPath = result.favorites[0].path;
                columnPaths = [];
                loadColumn(rootPath, 0);
            }
            renderSidebar(result.favorites);
            statusbarEl.textContent = "즐겨찾기 제거됨";
        } else {
            statusbarEl.textContent = "제거 실패: " + result.error;
        }
    }

    async function handleRenameFavorite(path) {
        var newName = prompt("표시 이름:");
        if (!newName || newName.trim() === "") return;
        var result = await window.pywebview.api.rename_favorite(path, newName.trim());
        if (result.success) {
            renderSidebar(result.favorites);
            statusbarEl.textContent = "이름 변경됨";
        } else {
            statusbarEl.textContent = "이름 변경 실패: " + result.error;
        }
    }

    function initSidebarResizer() {
        var startX = 0;
        var startWidth = 0;
        var overlay = null;

        function onMouseDown(e) {
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX;
            startWidth = sidebarEl.offsetWidth;
            sidebarResizerEl.classList.add("active");

            overlay = document.createElement("div");
            overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;cursor:col-resize;";
            document.body.appendChild(overlay);

            overlay.addEventListener("mousemove", onMouseMove);
            overlay.addEventListener("mouseup", onMouseUp);
        }

        function onMouseMove(e) {
            var newWidth = startWidth + (e.clientX - startX);
            if (newWidth < 120) newWidth = 120;
            if (newWidth > 300) newWidth = 300;
            sidebarEl.style.width = newWidth + "px";
        }

        function onMouseUp() {
            sidebarResizerEl.classList.remove("active");
            if (overlay) {
                overlay.removeEventListener("mousemove", onMouseMove);
                overlay.removeEventListener("mouseup", onMouseUp);
                document.body.removeChild(overlay);
                overlay = null;
            }
        }

        sidebarResizerEl.addEventListener("mousedown", onMouseDown);
    }

    window.addEventListener("pywebviewready", function () {
        init();
    });

    // --- 컬럼 로드 ---

    async function loadColumn(path, depth) {
        // depth 이후의 컬럼 + 리사이저 모두 제거
        while (columnsEl.children.length > depth * 2) {
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

        // 저장된 컬럼 너비 적용
        var savedWidth = getColumnWidth(depth);
        if (savedWidth) {
            col.style.width = savedWidth + "px";
        }

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

                row.addEventListener("click", function (e) {
                    window._lastClickEvent = e;
                    handleItemClickUnified(row, depth);
                });

                col.appendChild(row);
            });
        }

        columnsEl.appendChild(col);

        // 리사이저 추가 (컬럼 오른쪽)
        var resizer = document.createElement("div");
        resizer.className = "column-resizer";
        resizer.dataset.depth = depth;
        columnsEl.appendChild(resizer);

        initResizer(resizer, col);

        columnsEl.scrollLeft = columnsEl.scrollWidth;

        updateBreadcrumb();
        updateStatusbar(result.items.length);
    }

    // --- 컬럼 리사이즈 ---

    function initResizer(resizer, col) {
        var startX = 0;
        var startWidth = 0;
        var overlay = null;

        function onMouseDown(e) {
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX;
            startWidth = col.offsetWidth;
            resizer.classList.add("active");

            // 투명 오버레이로 전체 화면 마우스 이벤트 캡처
            overlay = document.createElement("div");
            overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;cursor:col-resize;";
            document.body.appendChild(overlay);

            overlay.addEventListener("mousemove", onMouseMove);
            overlay.addEventListener("mouseup", onMouseUp);
        }

        function onMouseMove(e) {
            var newWidth = startWidth + (e.clientX - startX);
            if (newWidth < 100) newWidth = 100;
            if (newWidth > 600) newWidth = 600;
            col.style.width = newWidth + "px";
        }

        function onMouseUp() {
            resizer.classList.remove("active");

            // 최종 너비를 depth별로 localStorage에 저장
            var finalWidth = col.offsetWidth;
            var depth = parseInt(col.dataset.depth);
            if (!isNaN(depth)) {
                saveColumnWidth(depth, finalWidth);
            }

            if (overlay) {
                overlay.removeEventListener("mousemove", onMouseMove);
                overlay.removeEventListener("mouseup", onMouseUp);
                document.body.removeChild(overlay);
                overlay = null;
            }
        }

        resizer.addEventListener("mousedown", onMouseDown);
    }

    // --- 컬럼 새로고침 ---

    async function refreshColumn(depth) {
        if (depth < 0 || depth >= columnPaths.length) return;
        var path = columnPaths[depth];
        var result = await window.pywebview.api.list_dir(path);
        if (result.error) return;

        var col = getColumnByDepth(depth);
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

                row.addEventListener("click", function (e) {
                    window._lastClickEvent = e;
                    handleItemClickUnified(row, depth);
                });

                col.appendChild(row);
            });
        }

        updateStatusbar(result.items.length);
    }

    function getColumnByDepth(depth) {
        var cols = columnsEl.querySelectorAll(".column");
        for (var i = 0; i < cols.length; i++) {
            if (parseInt(cols[i].dataset.depth) === depth) return cols[i];
        }
        return null;
    }

    // --- 클릭 핸들러 ---

    function handleItemClickUnified(row, depth) {
        var now = Date.now();
        var path = row.dataset.path;
        var event = window._lastClickEvent;

        // Ctrl+클릭: 같은 컬럼 내 토글 선택
        if (event && event.ctrlKey) {
            clearTimeout(renameState.renameTimeout);
            renameState.lastClickedPath = null;

            // 다른 컬럼의 선택을 해제하지 않고, 같은 컬럼 내에서만 토글
            if (row.classList.contains("selected")) {
                row.classList.remove("selected");
            } else {
                row.classList.add("selected");
            }

            // 선택 개수 표시
            var selCount = row.parentElement.querySelectorAll(".selected").length;
            if (selCount > 1) {
                statusbarEl.textContent = selCount + "개 선택됨";
            } else if (selCount === 1) {
                var sel = row.parentElement.querySelector(".selected");
                statusbarEl.textContent = sel ? sel.dataset.name : "";
            } else {
                statusbarEl.textContent = "";
            }
            return;
        }

        // 시차 클릭 (300ms 이내) → 더블클릭 취급
        if (now - renameState.lastClickTime < 300 && renameState.lastClickedPath === path) {
            clearTimeout(renameState.renameTimeout);
            renameState.lastClickedPath = null;
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
        // 같은 depth + 하위 컬럼의 선택만 해제 (상위 컬럼 선택은 유지)
        var allCols = columnsEl.querySelectorAll(".column");
        for (var i = 0; i < allCols.length; i++) {
            var colDepth = parseInt(allCols[i].dataset.depth);
            if (colDepth >= depth) {
                var selected = allCols[i].querySelectorAll(".column-item.selected");
                for (var j = 0; j < selected.length; j++) {
                    selected[j].classList.remove("selected");
                }
            }
        }

        row.classList.add("selected");

        // path-highlight: 상위 컬럼의 선택 항목에 연한 배경
        var allItems = columnsEl.querySelectorAll(".column-item.path-highlight");
        for (var k = 0; k < allItems.length; k++) {
            allItems[k].classList.remove("path-highlight");
        }
        for (var m = 0; m < allCols.length; m++) {
            var cd = parseInt(allCols[m].dataset.depth);
            if (cd < depth) {
                var sel = allCols[m].querySelector(".column-item.selected");
                if (sel) {
                    sel.classList.add("path-highlight");
                }
            }
        }

        if (row.dataset.isDir === "true") {
            loadColumn(row.dataset.path, depth + 1);
        } else {
            while (columnsEl.children.length > (depth + 1) * 2) {
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
        var cols = columnsEl.querySelectorAll(".column");
        for (var i = cols.length - 1; i >= 0; i--) {
            if (cols[i].querySelector(".selected")) {
                return { col: cols[i], depth: parseInt(cols[i].dataset.depth) };
            }
        }
        if (cols.length > 0) {
            return { col: cols[0], depth: 0 };
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
                // 현재 컬럼 이후 제거 (리사이저 포함)
                while (columnsEl.children.length > depth * 2) {
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

    function getSelectedItems() {
        var results = [];
        var cols = columnsEl.querySelectorAll(".column");
        for (var i = cols.length - 1; i >= 0; i--) {
            var sels = cols[i].querySelectorAll(".selected");
            if (sels.length > 0) {
                for (var j = 0; j < sels.length; j++) {
                    if (sels[j].dataset.path) results.push(sels[j]);
                }
                return results;
            }
        }
        return results;
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
        var items = getSelectedItems();
        if (items.length === 0) {
            statusbarEl.textContent = "복사할 항목을 선택하세요";
            return;
        }
        var paths = [];
        for (var i = 0; i < items.length; i++) {
            paths.push(items[i].dataset.path);
        }
        clipboard = { paths: paths, mode: "copy" };
        document.querySelectorAll(".column-item.cut").forEach(function(el) {
            el.classList.remove("cut");
        });
        try {
            var result;
            if (paths.length === 1) {
                result = await window.pywebview.api.copy_to_clipboard(paths[0]);
            } else {
                result = await window.pywebview.api.copy_files_to_clipboard(paths);
            }
            if (result.success) {
                statusbarEl.textContent = "복사: " + paths.length + "개 항목";
            } else {
                statusbarEl.textContent = "복사 실패: " + result.error;
            }
        } catch (e) {
            statusbarEl.textContent = "복사: " + paths.length + "개 항목";
        }
    }

    async function handleCut() {
        var items = getSelectedItems();
        if (items.length === 0) {
            statusbarEl.textContent = "잘라낼 항목을 선택하세요";
            return;
        }
        var paths = [];
        for (var i = 0; i < items.length; i++) {
            paths.push(items[i].dataset.path);
        }
        clipboard = { paths: paths, mode: "cut" };
        document.querySelectorAll(".column-item.cut").forEach(function(el) {
            el.classList.remove("cut");
        });
        for (var j = 0; j < items.length; j++) {
            items[j].classList.add("cut");
        }
        try {
            if (paths.length === 1) {
                await window.pywebview.api.copy_to_clipboard(paths[0]);
            } else {
                await window.pywebview.api.copy_files_to_clipboard(paths);
            }
            statusbarEl.textContent = "잘라내기: " + paths.length + "개 항목";
        } catch (e) {
            statusbarEl.textContent = "잘라내기: " + paths.length + "개 항목";
        }
    }

    async function handlePaste() {
        if (!clipboard.paths || clipboard.paths.length === 0) {
            statusbarEl.textContent = "클립보드가 비어 있습니다";
            return;
        }

        var destDir = getCurrentDirPath();
        statusbarEl.textContent = "붙여넣는 중...";

        var successCount = 0;
        var lastError = "";

        for (var i = 0; i < clipboard.paths.length; i++) {
            var result;
            if (clipboard.mode === "copy") {
                result = await window.pywebview.api.copy_file(clipboard.paths[i], destDir);
            } else {
                result = await window.pywebview.api.move_file(clipboard.paths[i], destDir);
            }
            if (result.error) {
                lastError = result.error;
            } else {
                successCount++;
            }
        }

        if (clipboard.mode === "cut") {
            // 원본 컬럼 새로고침
            var srcDir = clipboard.paths[0].substring(0, clipboard.paths[0].lastIndexOf("\\"));
            var cols = columnsEl.querySelectorAll(".column");
            for (var k = 0; k < cols.length; k++) {
                if (cols[k].dataset.path === srcDir) {
                    await refreshColumn(parseInt(cols[k].dataset.depth));
                    break;
                }
            }
            clipboard = { paths: [], mode: "" };
            clearCutStyle();
        }

        // 대상 컬럼 새로고침
        var cols2 = columnsEl.querySelectorAll(".column");
        for (var m = 0; m < cols2.length; m++) {
            if (cols2[m].dataset.path === destDir) {
                await refreshColumn(parseInt(cols2[m].dataset.depth));
                break;
            }
        }

        if (lastError) {
            statusbarEl.textContent = "완료 " + successCount + "개, 실패: " + lastError;
        } else {
            statusbarEl.textContent = "완료: " + successCount + "개 항목";
        }
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
        var items = getSelectedItems();
        if (items.length === 0) return;

        var msg;
        if (items.length === 1) {
            msg = items[0].dataset.name + '을(를) 휴지통으로 이동하시겠습니까?';
        } else {
            msg = items.length + '개 항목을 휴지통으로 이동하시겠습니까?';
        }
        if (!confirm(msg)) return;

        var col = items[0].parentElement;
        var depth = parseInt(col.dataset.depth);
        var hasDir = false;
        var successCount = 0;

        for (var i = 0; i < items.length; i++) {
            if (items[i].dataset.isDir === "true") hasDir = true;
            try {
                var result = await window.pywebview.api.delete_file(items[i].dataset.path);
                if (result.success) successCount++;
            } catch (e) {
                // continue
            }
        }

        if (hasDir) {
            while (columnsEl.children.length > (depth + 1) * 2) {
                columnsEl.removeChild(columnsEl.lastChild);
            }
            columnPaths = columnPaths.slice(0, depth + 1);
        }

        refreshColumn(depth);
        statusbarEl.textContent = '삭제됨: ' + successCount + '개 항목';
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
        var hasClipboard = clipboard.paths && clipboard.paths.length > 0;
        var multiSelected = false;

        if (hasTarget) {
            var col = contextTarget.parentElement;
            var selCount = col ? col.querySelectorAll(".selected").length : 0;
            multiSelected = selCount > 1;
        }

        var items = contextMenuEl.querySelectorAll(".ctx-item");
        for (var i = 0; i < items.length; i++) {
            var action = items[i].dataset.action;
            items[i].classList.remove("disabled");

            if (action === "open" && (!hasTarget || multiSelected)) {
                items[i].classList.add("disabled");
            }
            if ((action === "copy" || action === "cut") && !hasTarget) {
                items[i].classList.add("disabled");
            }
            if (action === "paste" && !hasClipboard) {
                items[i].classList.add("disabled");
            }
            if (action === "rename" && (!hasTarget || multiSelected)) {
                items[i].classList.add("disabled");
            }
            if (action === "delete" && !hasTarget) {
                items[i].classList.add("disabled");
            }
        }

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
