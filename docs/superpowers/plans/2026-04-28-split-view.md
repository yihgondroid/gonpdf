# 양면분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF 편집기에 양면분할 모드 추가 — 뷰어 2개 + 썸네일 2개 양끝, 툴바 토글 버튼, 포커스 사이드 기반 편집/저장

**Architecture:** 기존 `state` → `stateL`/`stateR` 분리, `activeSide` 변수로 포커스 관리. `activeState()` 헬퍼가 모든 편집/저장 함수에서 활성 사이드 state를 반환. HTML/CSS는 `#main-area.split-mode` 클래스 토글로 오른쪽 패널 표시 제어.

**Tech Stack:** Electron, pdf.js, pdf-lib, Sortable.js (기존 스택 그대로)

---

## 파일 변경 목록

| 파일 | 변경 내용 |
|------|-----------|
| `renderer/js/thumbnail.js` | 모듈 레벨 `_selectedSet`/`_anchor` → 컨테이너별 WeakMap |
| `renderer/js/viewer.js` | 모듈 레벨 `_currentTask` → 캔버스별 추적 |
| `renderer/index.html` | 기존 ID에 `-left` suffix, 오른쪽 패널 HTML 추가, 툴바 버튼 |
| `renderer/css/main.css` | split-mode CSS, 포커스 border, 버튼 active 스타일 |
| `renderer/js/app.js` | stateL/stateR, activeState(), sideEls(), 이벤트 전체 업데이트 |

---

## Task 1: thumbnail.js — 컨테이너별 상태 분리

두 썸네일 패널이 선택 상태를 공유하지 않도록 WeakMap으로 분리.

**Files:**
- Modify: `renderer/js/thumbnail.js`

- [ ] **Step 1: `_selectedSet`과 `_anchor`를 WeakMap으로 교체**

`renderer/js/thumbnail.js` 파일을 다음으로 전체 교체:

```js
// thumbnail.js
const THUMB_WIDTH = 160;

const _selectedSets = new WeakMap();
const _anchors = new WeakMap();

function _getSel(container) {
  if (!_selectedSets.has(container)) _selectedSets.set(container, new Set());
  return _selectedSets.get(container);
}
function _getAnchor(container) {
  return _anchors.has(container) ? _anchors.get(container) : 0;
}

function _refreshVisuals(container) {
  const sel = _getSel(container);
  container.querySelectorAll('.thumbnail-item').forEach(function(el) {
    el.classList.toggle('selected', sel.has(Number(el.dataset.pageIndex)));
  });
}

function renderThumbnails(pdfJsDoc, container, labels, onSelect, onReorder, onLabelChange) {
  if (!labels) labels = {};
  _selectedSets.set(container, new Set());
  _anchors.set(container, 0);
  container.innerHTML = '';

  for (let i = 0; i < pdfJsDoc.numPages; i++) {
    const item = createThumbnailItem(i, pdfJsDoc, labels[i] || 'unknown', container, onSelect, onLabelChange);
    container.appendChild(item);
  }

  window.Sortable.create(container, {
    animation: 150,
    onEnd: function(evt) {
      if (evt.oldIndex !== evt.newIndex) {
        onReorder(evt.oldIndex, evt.newIndex);
      }
    },
  });
}

const LABEL_CYCLE = ['unknown', 'question', 'answer'];

function createThumbnailItem(pageIndex, pdfJsDoc, label, container, onSelect, onLabelChange) {
  const item = document.createElement('div');
  item.className = 'thumbnail-item';
  item.dataset.pageIndex = pageIndex;

  const canvas = document.createElement('canvas');
  item.appendChild(canvas);

  const badge = createBadge(label, pageIndex);
  if (onLabelChange) {
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      const cur = LABEL_CYCLE.indexOf(badge.dataset.label || 'unknown');
      const next = LABEL_CYCLE[(cur + 1) % LABEL_CYCLE.length];
      badge.dataset.label = next;
      updateBadge(badge, next);
      onLabelChange(pageIndex, next);
    });
  }
  item.appendChild(badge);

  const pageNum = document.createElement('div');
  pageNum.className = 'thumbnail-page-num';
  pageNum.textContent = pageIndex + 1;
  item.appendChild(pageNum);

  item.addEventListener('click', function(e) {
    const sel = _getSel(container);
    const anchor = _getAnchor(container);
    if (e.ctrlKey || e.metaKey) {
      if (sel.has(pageIndex)) sel.delete(pageIndex);
      else sel.add(pageIndex);
      _anchors.set(container, pageIndex);
    } else if (e.shiftKey && anchor >= 0) {
      const min = Math.min(anchor, pageIndex);
      const max = Math.max(anchor, pageIndex);
      sel.clear();
      for (let i = min; i <= max; i++) sel.add(i);
    } else {
      sel.clear();
      sel.add(pageIndex);
      _anchors.set(container, pageIndex);
    }
    _refreshVisuals(container);
    onSelect(pageIndex);
  });
  renderThumbCanvas(pdfJsDoc, pageIndex, canvas);
  return item;
}

async function renderThumbCanvas(pdfJsDoc, pageIndex, canvas) {
  const page = await pdfJsDoc.getPage(pageIndex + 1);
  const dpr = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: 1 });
  const scale = (THUMB_WIDTH / viewport.width) * dpr;
  const scaledViewport = page.getViewport({ scale: scale });
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
  const img = document.createElement('img');
  img.src = canvas.toDataURL();
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';
  if (canvas.parentNode) canvas.parentNode.replaceChild(img, canvas);
}

function createBadge(label, pageIndex) {
  const badge = document.createElement('div');
  badge.className = 'thumbnail-badge';
  badge.dataset.pageIndex = pageIndex;
  badge.dataset.label = label || 'unknown';
  updateBadge(badge, label);
  return badge;
}

function updateBadge(badgeEl, label) {
  badgeEl.className = 'thumbnail-badge';
  if (label === 'question') {
    badgeEl.classList.add('badge-question');
    badgeEl.textContent = '🔵 문제';
  } else if (label === 'answer') {
    badgeEl.classList.add('badge-answer');
    badgeEl.textContent = '🟠 해설';
  } else {
    badgeEl.classList.add('badge-unknown');
    badgeEl.textContent = '❓';
  }
}

function setSelected(container, pageIndex) {
  _selectedSets.set(container, new Set([pageIndex]));
  _anchors.set(container, pageIndex);
  _refreshVisuals(container);
}

function getSelectedIndices(container) {
  return Array.from(_getSel(container)).sort(function(a, b) { return a - b; });
}

function updateAllBadges(container, labels) {
  container.querySelectorAll('.thumbnail-badge').forEach(function(badge) {
    const idx = Number(badge.dataset.pageIndex);
    updateBadge(badge, labels[idx] || 'unknown');
  });
}

window.Thumbnail = { renderThumbnails, setSelected, updateAllBadges, getSelectedIndices };
if (typeof module !== 'undefined') module.exports = { renderThumbnails, setSelected, updateAllBadges, getSelectedIndices };
```

- [ ] **Step 2: 앱 실행 후 썸네일 기존 동작 확인**

`npm start`로 앱 실행. PDF 열어서 썸네일 클릭, Ctrl+클릭 다중 선택, Shift+클릭 범위 선택이 정상 동작하는지 확인.

---

## Task 2: viewer.js — 캔버스별 렌더 태스크

두 뷰어가 각자 독립적으로 렌더링하도록 모듈 레벨 `_currentTask`를 캔버스 프로퍼티로 이동.

**Files:**
- Modify: `renderer/js/viewer.js`

- [ ] **Step 1: viewer.js 전체 교체**

```js
// viewer.js
window.Viewer = (function() {

  async function renderPage(pdfJsDoc, pageIndex, canvas, scale) {
    if (!pdfJsDoc) return;
    if (canvas._renderTask) { canvas._renderTask.cancel(); canvas._renderTask = null; }
    const page = await pdfJsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: scale });
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    canvas._renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
    try {
      await canvas._renderTask.promise;
    } catch(e) {
      if (e && e.name !== 'RenderingCancelledException') console.error('render:', e);
    }
    canvas._renderTask = null;
  }

  function updatePageInfo(el, pageIndex, total) {
    if (el) el.textContent = (pageIndex + 1) + ' / ' + total;
  }

  function updateZoomInfo(el, scale) {
    if (el) el.textContent = '🔍 ' + Math.round(scale * 100) + '%';
  }

  function scaleFromSlider(value) {
    return value / 100;
  }

  return { renderPage, updatePageInfo, updateZoomInfo, scaleFromSlider };
})();

if (typeof module !== 'undefined') module.exports = window.Viewer;
```

- [ ] **Step 2: 앱 실행 후 뷰어 렌더링 확인**

PDF 열어서 페이지 이동, 줌 슬라이더 동작 확인.

---

## Task 3: index.html — ID rename + 오른쪽 패널 추가

**Files:**
- Modify: `renderer/index.html`

- [ ] **Step 1: index.html 전체 교체**

기존 ID에 `-left` suffix 추가, 오른쪽 패널 HTML 추가, 툴바에 양면분할 버튼 추가:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src blob: file:; img-src 'self' data: blob:;" />
  <title>PDF 편집 툴</title>
  <link rel="stylesheet" href="css/main.css" />
</head>
<body>

  <div id="toolbar">
    <div class="toolbar-group">
      <button id="btn-open">📂 열기</button>
      <button id="btn-save">💾 저장</button>
    </div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-group">
      <button id="btn-delete" disabled>🗑️ 삭제</button>
      <button id="btn-merge">🔗 합치기</button>
      <button id="btn-split" disabled>✂️ 나누기</button>
    </div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-group automation">
      <button id="btn-auto-left" disabled>📘 문제 좌</button>
      <button id="btn-auto-right" disabled>📗 문제 우</button>
      <button id="btn-auto-answer" disabled>📙 해설만</button>
      <button id="btn-auto-all" disabled>📦 전체분리</button>
    </div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-group">
      <button id="btn-split-view">📄 양면분할</button>
    </div>
  </div>

  <div id="main-area">

    <!-- 왼쪽 썸네일 -->
    <div id="thumbnail-panel-left">
      <div id="thumbnail-footer-left">
        <span>🔍</span>
        <input type="range" id="thumb-zoom-slider-left" min="60" max="300" value="120" step="10" />
        <span id="thumb-zoom-label-left">120px</span>
      </div>
      <div id="thumbnail-count-left"></div>
      <div id="thumbnail-list-left"></div>
    </div>

    <div id="panel-resizer-left"></div>

    <!-- 왼쪽 뷰어 -->
    <div id="viewer-panel-left">
      <div id="viewer-canvas-wrap-left">
        <canvas id="viewer-canvas-left"></canvas>
      </div>
      <div id="viewer-controls-left">
        <button id="btn-prev-left">◀</button>
        <span id="viewer-page-info-left">— / —</span>
        <button id="btn-next-left">▶</button>
        <span id="viewer-zoom-info-left">🔍 100%</span>
        <input type="range" id="zoom-slider-left" min="50" max="400" value="100" step="10" />
      </div>
    </div>

    <!-- 오른쪽 뷰어 -->
    <div id="viewer-panel-right">
      <div id="viewer-canvas-wrap-right">
        <canvas id="viewer-canvas-right"></canvas>
      </div>
      <div id="viewer-controls-right">
        <button id="btn-prev-right">◀</button>
        <span id="viewer-page-info-right">— / —</span>
        <button id="btn-next-right">▶</button>
        <span id="viewer-zoom-info-right">🔍 100%</span>
        <input type="range" id="zoom-slider-right" min="50" max="400" value="100" step="10" />
      </div>
    </div>

    <div id="panel-resizer-right"></div>

    <!-- 오른쪽 썸네일 -->
    <div id="thumbnail-panel-right">
      <div id="thumbnail-footer-right">
        <span>🔍</span>
        <input type="range" id="thumb-zoom-slider-right" min="60" max="300" value="120" step="10" />
        <span id="thumb-zoom-label-right">120px</span>
      </div>
      <div id="thumbnail-count-right"></div>
      <div id="thumbnail-list-right"></div>
    </div>

  </div>

  <div id="statusbar">
    <span id="status-filename">파일을 열어주세요</span>
    <span id="status-info"></span>
  </div>

  <script src="../node_modules/pdfjs-dist/build/pdf.js"></script>
  <script src="../node_modules/pdf-lib/dist/pdf-lib.min.js"></script>
  <script src="../node_modules/sortablejs/Sortable.min.js"></script>
  <script src="../node_modules/tesseract.js/dist/tesseract.min.js"></script>
  <script src="js/pdf-loader.js"></script>
  <script src="js/thumbnail.js"></script>
  <script src="js/viewer.js"></script>
  <script src="js/editor.js"></script>
  <script src="js/automation.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

---

## Task 4: main.css — 분할 모드 스타일

**Files:**
- Modify: `renderer/css/main.css`

- [ ] **Step 1: 기존 ID 참조 rename + split-mode 스타일 추가**

`main.css` 파일에서 다음을 수정/추가:

1. `#thumbnail-panel` → `#thumbnail-panel-left`로 rename (replace all)
2. `#panel-resizer` → `#panel-resizer-left`로 rename (replace all)
3. `#viewer-panel` → `#viewer-panel-left`로 rename (replace all)
4. `#viewer-canvas-wrap` → `#viewer-canvas-wrap-left`로 rename (replace all)
5. `#viewer-canvas` → `#viewer-canvas-left`로 rename (replace all)
6. `#viewer-controls` → `#viewer-controls-left`로 rename (replace all)
7. `#viewer-page-info, #viewer-zoom-info` → `#viewer-page-info-left, #viewer-zoom-info-left`로 rename
8. `#zoom-slider` → `#zoom-slider-left`로 rename
9. `#thumb-zoom-slider` → `#thumb-zoom-slider-left`로 rename
10. `#thumb-zoom-label` → `#thumb-zoom-label-left`로 rename
11. `#thumbnail-footer` → `#thumbnail-footer-left`로 rename
12. `#thumbnail-count` → `#thumbnail-count-left`로 rename
13. `#thumbnail-list` → `#thumbnail-list-left`로 rename

그런 다음 파일 맨 끝에 다음 블록 추가:

```css
/* ── 양면분할 ── */
#viewer-panel-right,
#panel-resizer-right,
#thumbnail-panel-right { display: none; }

#main-area.split-mode #viewer-panel-right,
#main-area.split-mode #panel-resizer-right,
#main-area.split-mode #thumbnail-panel-right { display: flex; }

/* viewer-panel-left는 단일/양면 모두 표시 — display:flex는 기존 #viewer-panel 스타일에서 옴 */
#viewer-panel-right {
  flex: 1;
  background: #f5f8fb;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
}

#viewer-canvas-wrap-right {
  flex: 1;
  overflow: auto;
  width: 100%;
  padding: 16px;
  text-align: center;
  cursor: grab;
}
#viewer-canvas-right {
  display: inline-block;
  box-shadow: 0 4px 16px rgba(160,180,200,0.4);
  border-radius: 4px;
  border: 1px solid #dce8f0;
}
#viewer-controls-right {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 16px;
  border-top: 1px solid #dce8f0;
  background: #e8f0f7;
  width: 100%;
  flex-shrink: 0;
}
#viewer-controls-right button {
  background: #c8d8e8;
  color: #445;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
#viewer-controls-right button:disabled { opacity: 0.4; cursor: default; }
#viewer-page-info-right, #viewer-zoom-info-right { color: #889; font-size: 12px; }
#zoom-slider-right { cursor: pointer; flex: 1; max-width: 160px; }

#panel-resizer-right {
  width: 5px;
  cursor: col-resize;
  background: #c0d0dc;
  flex-shrink: 0;
  transition: background 0.1s;
}
#panel-resizer-right:hover, #panel-resizer-right.dragging { background: #8ab4d4; }

#thumbnail-panel-right {
  width: 180px;
  min-width: 80px;
  background: #dce8f0;
  border-left: 1px solid #c0d0dc;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#thumbnail-footer-right {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid #c0d0dc;
  background: #d0dce8;
  flex-shrink: 0;
}
#thumbnail-footer-right span { font-size: 10px; color: #789; white-space: nowrap; }
#thumb-zoom-slider-right { flex: 1; cursor: pointer; }
#thumb-zoom-label-right { font-size: 10px; color: #789; min-width: 34px; text-align: right; }
#thumbnail-count-right { padding: 6px; font-size: 11px; color: #789; text-align: center; border-bottom: 1px solid #c0d0dc; }
#thumbnail-list-right {
  flex: 1;
  overflow-y: auto;
  padding: 8px 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: start;
  align-items: start;
}

/* 포커스 표시 */
#viewer-panel-left.active { border-top: 2px solid #8ab4d4; }
#viewer-panel-right.active { border-top: 2px solid #8ab4d4; }

/* 양면분할 버튼 활성 */
#btn-split-view { background: #c8d8e8; }
#btn-split-view.active { background: #8ab4d4; font-weight: bold; }
```

- [ ] **Step 2: 앱 실행 — 단일 모드 레이아웃 확인**

`npm start`. 오른쪽 패널이 숨겨진 상태로 기존 레이아웃이 그대로인지 확인.

---

## Task 5: app.js — State 분리 + 헬퍼 함수

**Files:**
- Modify: `renderer/js/app.js`

- [ ] **Step 1: app.js 상단 state/undo/redo 선언부 교체**

기존 `const state = {...}`, `const undoStack = []`, `const redoStack = []` 블록을 다음으로 교체:

```js
const stateL = { pdfJsDoc: null, pdfLibDoc: null, currentPage: 0, scale: 1.0, labels: {}, filename: '' };
const stateR = { pdfJsDoc: null, pdfLibDoc: null, currentPage: 0, scale: 1.0, labels: {}, filename: '' };
let activeSide = 'left';
let splitMode  = false;

const undoStackL = [], redoStackL = [];
const undoStackR = [], redoStackR = [];

function activeState() { return activeSide === 'left' ? stateL : stateR; }
function activeUndo()  { return activeSide === 'left' ? undoStackL : undoStackR; }
function activeRedo()  { return activeSide === 'left' ? redoStackL : redoStackR; }

function sideEls(side) {
  const s = side || activeSide;
  return {
    thumbnailPanel:   document.getElementById('thumbnail-panel-' + s),
    thumbnailList:    document.getElementById('thumbnail-list-' + s),
    thumbnailCount:   document.getElementById('thumbnail-count-' + s),
    viewerPanel:      document.getElementById('viewer-panel-' + s),
    viewerCanvasWrap: document.getElementById('viewer-canvas-wrap-' + s),
    viewerCanvas:     document.getElementById('viewer-canvas-' + s),
    pageInfo:         document.getElementById('viewer-page-info-' + s),
    zoomInfo:         document.getElementById('viewer-zoom-info-' + s),
    zoomSlider:       document.getElementById('zoom-slider-' + s),
    btnPrev:          document.getElementById('btn-prev-' + s),
    btnNext:          document.getElementById('btn-next-' + s),
    thumbZoomSlider:  document.getElementById('thumb-zoom-slider-' + s),
    thumbZoomLabel:   document.getElementById('thumb-zoom-label-' + s),
  };
}
```

- [ ] **Step 2: `pushHistory` / `restoreFromBytes` / `undo` / `redo` 함수 업데이트**

기존 4개 함수를 다음으로 교체:

```js
async function pushHistory() {
  const st = activeState();
  if (!st.pdfLibDoc) return;
  const bytes = await st.pdfLibDoc.save();
  activeUndo().push(bytes);
  activeRedo().length = 0;
}

async function restoreFromBytes(saved, side) {
  const st   = side === 'left' ? stateL : stateR;
  const e    = sideEls(side);
  const ab   = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(ab);
  st.pdfJsDoc    = pdfJsDoc;
  st.pdfLibDoc   = pdfLibDoc;
  st.currentPage = Math.min(st.currentPage, pdfJsDoc.numPages - 1);
  st.labels      = {};
  e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  Thumbnail.setSelected(e.thumbnailList, st.currentPage);
  await selectPage(side, st.currentPage);
}

async function undo() {
  const undoStack = activeUndo();
  const redoStack = activeRedo();
  if (undoStack.length === 0) return;
  const current = await activeState().pdfLibDoc.save();
  redoStack.push(current);
  await restoreFromBytes(undoStack.pop(), activeSide);
}

async function redo() {
  const undoStack = activeUndo();
  const redoStack = activeRedo();
  if (redoStack.length === 0) return;
  const current = await activeState().pdfLibDoc.save();
  undoStack.push(current);
  await restoreFromBytes(redoStack.pop(), activeSide);
}
```

---

## Task 6: app.js — 핵심 PDF 함수 업데이트

**Files:**
- Modify: `renderer/js/app.js`

- [ ] **Step 1: `openFile`, `loadPdf`, `selectPage`, `reloadPdf`, `handleReorder`, `enableButtons` 교체**

```js
async function openFile() {
  const result = await window.electronAPI.openFile();
  if (!result) return;
  await loadPdf(activeSide, result.buffer, result.name);
}

async function loadPdf(side, buffer, name) {
  const st  = side === 'left' ? stateL : stateR;
  const e   = sideEls(side);
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(buffer);
  st.pdfJsDoc    = pdfJsDoc;
  st.pdfLibDoc   = pdfLibDoc;
  st.currentPage = 0;
  st.labels      = {};
  st.filename    = name;
  const undoStack = side === 'left' ? undoStackL : undoStackR;
  const redoStack = side === 'left' ? redoStackL : redoStackR;
  undoStack.length = 0;
  redoStack.length = 0;
  $('status-filename').textContent = name;
  e.thumbnailCount.textContent = PdfLoader.getPageCount(pdfJsDoc) + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  Thumbnail.setSelected(e.thumbnailList, 0);
  await selectPage(side, 0);
  enableButtons(true);
}

async function selectPage(side, pageIndex) {
  const st = side === 'left' ? stateL : stateR;
  const e  = sideEls(side);
  st.currentPage = pageIndex;
  await Viewer.renderPage(st.pdfJsDoc, pageIndex, e.viewerCanvas, st.scale);
  Viewer.updatePageInfo(e.pageInfo, pageIndex, PdfLoader.getPageCount(st.pdfJsDoc));
}

async function reloadPdf() {
  const side = activeSide;
  const st   = activeState();
  const e    = sideEls(side);
  const newBytes = await st.pdfLibDoc.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  st.pdfJsDoc    = pdfJsDoc;
  st.pdfLibDoc   = pdfLibDoc;
  st.currentPage = Math.min(st.currentPage, pdfJsDoc.numPages - 1);
  e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  Thumbnail.setSelected(e.thumbnailList, st.currentPage);
  await selectPage(side, st.currentPage);
}

async function handleReorder(side, oldIdx, newIdx) {
  const prevActive = activeSide;
  activeSide = side;
  await pushHistory();
  activeSide = prevActive;
  const st = side === 'left' ? stateL : stateR;
  window.Editor.reorderPages(st.pdfLibDoc, oldIdx, newIdx);
}

function enableButtons(hasFile) {
  ['btn-delete','btn-split','btn-auto-left','btn-auto-right','btn-auto-answer','btn-auto-all']
    .forEach(id => { $(id).disabled = !hasFile; });
}
```

---

## Task 7: app.js — 저장 + IPC 핸들러

**Files:**
- Modify: `renderer/js/app.js`

- [ ] **Step 1: IPC 핸들러 + 저장 함수 업데이트**

기존 IPC 핸들러 블록 전체를 다음으로 교체:

```js
async function saveActive() {
  const st = activeState();
  if (!st.pdfLibDoc) return;
  const sideName = activeSide === 'left' ? '왼쪽' : '오른쪽';
  if (!confirm(sideName + ' PDF를 저장하시겠습니까?')) return;
  const bytes = await st.pdfLibDoc.save();
  await window.electronAPI.saveFile(bytes, st.filename);
}

window.electronAPI.onMenuOpen(openFile);
window.electronAPI.onMenuSave(saveActive);
window.electronAPI.onMenuUndo(undo);
window.electronAPI.onMenuRedo(redo);
```

- [ ] **Step 2: 툴바 저장 버튼 업데이트**

기존 `$('btn-save').addEventListener(...)` 핸들러를 다음으로 교체:

```js
$('btn-save').addEventListener('click', saveActive);
```

---

## Task 8: app.js — 양면분할 버튼 + 포커스 전환

**Files:**
- Modify: `renderer/js/app.js`

- [ ] **Step 1: setActiveSide 함수 + 양면분할 버튼 핸들러 추가**

기존 `$('btn-open')` 핸들러 바로 위에 추가:

```js
function setActiveSide(side) {
  activeSide = side;
  document.getElementById('viewer-panel-left').classList.toggle('active', side === 'left');
  document.getElementById('viewer-panel-right').classList.toggle('active', side === 'right');
}

$('btn-split-view').addEventListener('click', function() {
  splitMode = !splitMode;
  $('main-area').classList.toggle('split-mode', splitMode);
  $('btn-split-view').classList.toggle('active', splitMode);
  if (splitMode) {
    setActiveSide('left');
    document.getElementById('viewer-panel-left').classList.add('active');
  } else {
    document.getElementById('viewer-panel-left').classList.remove('active');
    document.getElementById('viewer-panel-right').classList.remove('active');
    activeSide = 'left';
  }
});
```

- [ ] **Step 2: 클릭으로 포커스 전환 핸들러 추가**

```js
['viewer-panel-left', 'thumbnail-panel-left', 'viewer-canvas-wrap-left', 'thumbnail-list-left'].forEach(function(id) {
  document.getElementById(id).addEventListener('mousedown', function() {
    if (splitMode) setActiveSide('left');
  });
});
['viewer-panel-right', 'thumbnail-panel-right', 'viewer-canvas-wrap-right', 'thumbnail-list-right'].forEach(function(id) {
  document.getElementById(id).addEventListener('mousedown', function() {
    if (splitMode) setActiveSide('right');
  });
});
```

- [ ] **Step 3: 앱 실행 — 양면분할 버튼 토글 확인**

`npm start`. 양면분할 버튼 클릭 시 오른쪽 패널 표시/숨김, 버튼 활성 스타일, 좌우 클릭 시 파란 테두리 전환 확인.

---

## Task 9: app.js — 좌우 컨트롤 이벤트 (nav, zoom, resizer, wheel, drag)

**Files:**
- Modify: `renderer/js/app.js`

- [ ] **Step 1: 좌/우 공통 컨트롤 바인딩 헬퍼 함수 작성 + 호출**

기존 개별 컨트롤 이벤트 핸들러(btn-prev, btn-next, zoom-slider, thumb-zoom-slider, panel-resizer, viewer-canvas-wrap 휠, viewer-canvas-wrap 드래그)를 모두 제거하고, 아래 함수와 호출로 대체:

```js
function bindSideControls(side) {
  const e = sideEls(side);
  const st = side === 'left' ? stateL : stateR;

  // 페이지 이동
  e.btnPrev.addEventListener('click', function() {
    if (st.currentPage > 0) {
      Thumbnail.setSelected(e.thumbnailList, st.currentPage - 1);
      selectPage(side, st.currentPage - 1);
    }
  });
  e.btnNext.addEventListener('click', function() {
    if (st.pdfJsDoc && st.currentPage < st.pdfJsDoc.numPages - 1) {
      Thumbnail.setSelected(e.thumbnailList, st.currentPage + 1);
      selectPage(side, st.currentPage + 1);
    }
  });

  // 뷰어 줌 슬라이더
  e.zoomSlider.addEventListener('input', async function(ev) {
    st.scale = Viewer.scaleFromSlider(Number(ev.target.value));
    Viewer.updateZoomInfo(e.zoomInfo, st.scale);
    if (st.pdfJsDoc) await Viewer.renderPage(st.pdfJsDoc, st.currentPage, e.viewerCanvas, st.scale);
  });

  // 썸네일 줌 슬라이더
  e.thumbZoomSlider.addEventListener('input', function(ev) {
    const size = ev.target.value;
    e.thumbnailList.style.setProperty('--thumb-size', size + 'px');
    e.thumbZoomLabel.textContent = size + 'px';
  });

  // 뷰어 휠: Ctrl+휠=줌, 경계에서 페이지 이동
  e.viewerCanvasWrap.addEventListener('wheel', async function(ev) {
    if (!st.pdfJsDoc) return;
    if (splitMode) setActiveSide(side);
    if (ev.ctrlKey) {
      ev.preventDefault();
      const newVal = Math.max(50, Math.min(400, Number(e.zoomSlider.value) + (ev.deltaY < 0 ? 10 : -10)));
      e.zoomSlider.value = newVal;
      st.scale = newVal / 100;
      Viewer.updateZoomInfo(e.zoomInfo, st.scale);
      await Viewer.renderPage(st.pdfJsDoc, st.currentPage, e.viewerCanvas, st.scale);
      return;
    }
    const atTop    = e.viewerCanvasWrap.scrollTop <= 0;
    const atBottom = e.viewerCanvasWrap.scrollTop + e.viewerCanvasWrap.clientHeight >= e.viewerCanvasWrap.scrollHeight - 1;
    if (ev.deltaY < 0 && atTop && st.currentPage > 0) {
      ev.preventDefault();
      await selectPage(side, st.currentPage - 1);
      Thumbnail.setSelected(e.thumbnailList, st.currentPage);
      e.viewerCanvasWrap.scrollTop = e.viewerCanvasWrap.scrollHeight;
    } else if (ev.deltaY > 0 && atBottom && st.currentPage < st.pdfJsDoc.numPages - 1) {
      ev.preventDefault();
      await selectPage(side, st.currentPage + 1);
      Thumbnail.setSelected(e.thumbnailList, st.currentPage);
      e.viewerCanvasWrap.scrollTop = 0;
    }
  }, { passive: false });

  // 뷰어 드래그 패닝
  (function() {
    const wrap = e.viewerCanvasWrap;
    let isDragging = false, startX, startY, scrollLeft, scrollTop;
    wrap.addEventListener('mousedown', function(ev) {
      if (ev.button !== 0) return;
      isDragging = true;
      startX = ev.clientX; startY = ev.clientY;
      scrollLeft = wrap.scrollLeft; scrollTop = wrap.scrollTop;
      wrap.style.cursor = 'grabbing';
      ev.preventDefault();
    });
    document.addEventListener('mousemove', function(ev) {
      if (!isDragging) return;
      wrap.scrollLeft = scrollLeft - (ev.clientX - startX);
      wrap.scrollTop  = scrollTop  - (ev.clientY - startY);
    });
    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      wrap.style.cursor = 'grab';
    });
    wrap.style.cursor = 'grab';
  })();
}

bindSideControls('left');
bindSideControls('right');
```

- [ ] **Step 2: 좌/우 리사이저 바인딩 헬퍼 추가**

기존 패널 리사이저 IIFE를 제거하고 다음으로 교체:

```js
function bindResizer(resizerId, panelId, direction) {
  const resizer = $(resizerId);
  const panel   = $(panelId);
  let startX, startWidth;
  resizer.addEventListener('mousedown', function(e) {
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', function(e) {
    if (!resizer.classList.contains('dragging')) return;
    const delta = direction === 'right' ? e.clientX - startX : startX - e.clientX;
    const newWidth = Math.max(80, Math.min(window.innerWidth - 200, startWidth + delta));
    panel.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', function() {
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

bindResizer('panel-resizer-left',  'thumbnail-panel-left',  'right');
bindResizer('panel-resizer-right', 'thumbnail-panel-right', 'left');
```

- [ ] **Step 3: 앱 실행 — 좌우 컨트롤 전체 확인**

`npm start`. 양면분할 모드에서:
- 좌/우 페이지 이동 버튼 동작
- 좌/우 줌 슬라이더 독립 동작
- 좌/우 썸네일 줌 슬라이더 독립 동작
- 좌/우 리사이저 드래그 동작
- 휠 스크롤로 페이지 이동 (각 뷰어 독립)
확인.

---

## Task 10: app.js — 열기 버튼 + 편집 버튼 + undo/redo + 키보드 + 드래그앤드롭

**Files:**
- Modify: `renderer/js/app.js`

- [ ] **Step 1: btn-open 핸들러**

```js
$('btn-open').addEventListener('click', openFile);
```

- [ ] **Step 2: 편집 버튼들 업데이트**

기존 `btn-delete`, `btn-merge`, `btn-split` 핸들러를 다음으로 교체 (activeState() 사용):

```js
$('btn-delete').addEventListener('click', async function() {
  const st = activeState();
  if (!st.pdfLibDoc || st.pdfJsDoc.numPages <= 1) return;
  await pushHistory();
  window.Editor.deletePage(st.pdfLibDoc, st.currentPage);
  await reloadPdf();
});

$('btn-merge').addEventListener('click', async function() {
  const st   = activeState();
  const side = activeSide;
  const e    = sideEls(side);
  const result = await window.electronAPI.openFile();
  if (!result) return;
  await pushHistory();
  const { pdfLibDoc: doc2 } = await PdfLoader.loadPdf(result.buffer);
  const merged   = await window.Editor.mergeDocuments([st.pdfLibDoc, doc2]);
  const newBytes = await merged.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  st.pdfJsDoc = pdfJsDoc; st.pdfLibDoc = pdfLibDoc;
  st.currentPage = 0; st.labels = {};
  e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  await selectPage(side, 0);
  $('status-info').textContent = '합치기 완료 (' + pdfJsDoc.numPages + ' 페이지)';
});

$('btn-split').addEventListener('click', async function() {
  const st = activeState();
  if (!st.pdfLibDoc) return;
  const total = st.pdfJsDoc.numPages;
  const input = prompt('나누기: 시작-끝 페이지 입력 (예: 1-3, 전체 ' + total + '페이지)');
  if (!input) return;
  const parts = input.split('-');
  const start = parseInt(parts[0], 10) - 1;
  const count = parseInt(parts[1], 10) - start;
  if (isNaN(start) || isNaN(count) || count <= 0) return;
  const splitDoc = await window.Editor.splitDocument(st.pdfLibDoc, start, count);
  const bytes = await splitDoc.save();
  await window.electronAPI.saveFile(bytes, 'split_p' + (start+1) + '-' + (start+count) + '.pdf');
  $('status-info').textContent = '나누기 저장 완료 (' + count + ' 페이지)';
});
```

- [ ] **Step 3: 자동화 버튼 업데이트**

기존 자동화 버튼 핸들러 4개를 다음으로 교체:

```js
async function saveDoc(doc, defaultName) {
  const bytes = await doc.save();
  await window.electronAPI.saveFile(bytes, defaultName);
}

$('btn-auto-left').addEventListener('click', async function() {
  const st = activeState();
  const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'left');
  await saveDoc(doc, '문제_좌.pdf');
  $('status-info').textContent = '문제_좌.pdf 저장 완료';
});

$('btn-auto-right').addEventListener('click', async function() {
  const st = activeState();
  const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'right');
  await saveDoc(doc, '문제_우.pdf');
  $('status-info').textContent = '문제_우.pdf 저장 완료';
});

$('btn-auto-answer').addEventListener('click', async function() {
  const st = activeState();
  const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
  await saveDoc(doc, '해설.pdf');
  $('status-info').textContent = '해설.pdf 저장 완료';
});

$('btn-auto-all').addEventListener('click', async function() {
  const st = activeState();
  $('status-info').textContent = '전체 분리 처리 중...';
  const outputs = await window.Automation.runAutomationAll(st.pdfLibDoc, st.labels);
  const files = [];
  for (let i = 0; i < outputs.length; i++) {
    files.push({ name: outputs[i].name, buffer: await outputs[i].doc.save() });
  }
  await window.electronAPI.saveFiles(files);
  $('status-info').textContent = '전체 분리 저장 완료 (파일 3개)';
});
```

- [ ] **Step 4: 키보드 단축키 업데이트**

기존 keydown 핸들러를 다음으로 교체:

```js
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
  const st = activeState();
  const e2 = sideEls();
  if (!st.pdfJsDoc) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (st.currentPage > 0) { selectPage(activeSide, st.currentPage - 1); Thumbnail.setSelected(e2.thumbnailList, st.currentPage); }
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (st.currentPage < st.pdfJsDoc.numPages - 1) { selectPage(activeSide, st.currentPage + 1); Thumbnail.setSelected(e2.thumbnailList, st.currentPage); }
  }
});
```

- [ ] **Step 5: 드래그앤드롭 업데이트**

기존 drop 핸들러를 다음으로 교체:

```js
document.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
document.addEventListener('drop', async function(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
  await loadPdf(activeSide, await file.arrayBuffer(), file.name);
});
```

- [ ] **Step 6: 최종 통합 테스트**

`npm start`. 다음 시나리오 순서대로 확인:

1. PDF 열기 → 단일 모드 정상 동작
2. 양면분할 버튼 → 오른쪽 패널 표시
3. 오른쪽 뷰어 클릭 → 파란 테두리 오른쪽으로 이동
4. 오른쪽에서 열기 → 다른 PDF 로드
5. 각각 독립적으로 페이지 이동, 줌 동작
6. 왼쪽 클릭 후 삭제 → 왼쪽 PDF에만 적용
7. 저장 버튼 → "왼쪽 PDF를 저장하시겠습니까?" 다이얼로그
8. 양면분할 버튼 다시 클릭 → 단일 모드 복귀, 기존 상태 유지
9. Ctrl+Z undo → 활성 사이드에만 적용
