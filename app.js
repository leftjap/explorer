// PROJECT: explorer
// Miller Columns 파일 탐색기 — 메인 로직

(function () {
    "use strict";

    const columnsEl = document.getElementById("columns");
    const breadcrumbEl = document.getElementById("breadcrumb");
    const statusbarEl = document.getElementById("statusbar");

    // 상태: 현재 열린 경로 배열. columns[0] = 루트, columns[1] = 루트에서 선택한 폴더, ...
    let columnPaths = [];
    let rootPath = "";

    // --- 초기화 ---

    async function init() {
        rootPath = await window.pywebview.api.get_root();
        await loadColumn(rootPath, 0);
    }

    // pywebview ready 이벤트 대기
    window.addEventListener("pywebviewready", function () {
        init();
    });

    // --- 컬럼 로드 ---

    async function loadColumn(path, depth) {
        // depth 이후의 컬럼 모두 제거
        while (columnsEl.children.length > depth) {
            columnsEl.removeChild(columnsEl.lastChild);
        }
        columnPaths = columnPaths.slice(0, depth);
        columnPaths.push(path);

        const result = await window.pywebview.api.list_dir(path);

        if (result.error) {
            statusbarEl.textContent = "오류: " + result.error;
            return;
        }

        const col = document.createElement("div");
        col.className = "column";
        col.dataset.depth = depth;
        col.dataset.path = path;

        if (result.items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "column-item";
            empty.style.color = "#666";
            empty.textContent = "(비어 있음)";
            col.appendChild(empty);
        } else {
            result.items.forEach(function (item) {
                const row = document.createElement("div");
                row.className = "column-item";
                row.dataset.name = item.name;
                row.dataset.isDir = item.is_dir;
                row.dataset.path = path + "\\" + item.name;

                const icon = document.createElement("span");
                icon.className = "icon";
                icon.textContent = item.is_dir ? "📁" : "📄";

                const name = document.createElement("span");
                name.className = "name";
                name.textContent = item.name;

                row.appendChild(icon);
                row.appendChild(name);

                if (item.is_dir) {
                    const arrow = document.createElement("span");
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

        // 새 컬럼이 보이도록 가로 스크롤
        columnsEl.scrollLeft = columnsEl.scrollWidth;

        updateBreadcrumb();
        updateStatusbar(result.items.length);
    }

    // --- 클릭 핸들러 ---

    function handleItemClick(row, depth) {
        // 같은 컬럼의 기존 선택 해제
        const col = row.parentElement;
        const prevSelected = col.querySelector(".selected");
        if (prevSelected) {
            prevSelected.classList.remove("selected");
        }

        row.classList.add("selected");

        if (row.dataset.isDir === "true") {
            loadColumn(row.dataset.path, depth + 1);
        } else {
            // 파일 선택: depth 이후 컬럼 제거
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
        const result = await window.pywebview.api.open_file(path);
        if (result.error) {
            statusbarEl.textContent = "오류: " + result.error;
        } else {
            statusbarEl.textContent = "열림: " + path;
        }
    }

    // --- 브레드크럼 ---

    function updateBreadcrumb() {
        breadcrumbEl.innerHTML = "";

        // 현재 선택 경로 구성
        var fullPath = rootPath;
        var segments = [];

        // 루트
        segments.push({ label: rootPath.split("\\").pop() || rootPath, path: rootPath });

        // 각 컬럼에서 선택된 항목
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
                // 해당 깊이까지 되돌리기
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
