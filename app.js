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

    // --- 초기화 ---

    async function init() {
        rootPath = await window.pywebview.api.get_root();
        await loadColumn(rootPath, 0);
        document.addEventListener("keydown", handleKeydown);
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
                    handleItemClick(row, depth);
                });

                row.addEventListener("dblclick", function () {
                    handleItemDblClick(row);
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
                    handleItemClick(row, depth);
                });

                row.addEventListener("dblclick", function () {
                    handleItemDblClick(row);
                });

                col.appendChild(row);
            });
        }

        updateStatusbar(result.items.length);
    }

    // --- 클릭 핸들러 ---

    function handleItemClick(row, depth) {
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

    function handleItemDblClick(row) {
        if (row.dataset.isDir === "false") {
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
        // Ctrl+C: 복사
        if (e.ctrlKey && e.key === "c") {
            e.preventDefault();
            handleCopy();
            return;
        }
        // Ctrl+X: 잘라내기
        if (e.ctrlKey && e.key === "x") {
            e.preventDefault();
            handleCut();
            return;
        }
        // Ctrl+V: 붙여넣기
        if (e.ctrlKey && e.key === "v") {
            e.preventDefault();
            handlePaste();
            return;
        }

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

    function handleCopy() {
        var sel = getSelectedItem();
        if (!sel) {
            statusbarEl.textContent = "복사할 항목을 선택하세요";
            return;
        }
        clipboard.path = sel.dataset.path;
        clipboard.mode = "copy";
        statusbarEl.textContent = "복사: " + sel.dataset.name;

        // cut 스타일 초기화
        clearCutStyle();
    }

    function handleCut() {
        var sel = getSelectedItem();
        if (!sel) {
            statusbarEl.textContent = "잘라낼 항목을 선택하세요";
            return;
        }
        clipboard.path = sel.dataset.path;
        clipboard.mode = "cut";
        statusbarEl.textContent = "잘라내기: " + sel.dataset.name;

        // cut 스타일 적용
        clearCutStyle();
        sel.classList.add("cut");
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
})();
