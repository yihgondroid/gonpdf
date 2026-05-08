# Render Worker 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF 렌더링을 전용 Web Worker(render-worker.js)로 이전해 메인 스레드 UI 블로킹을 제거한다.

**Architecture:** render-worker.js가 PDF.js를 내부 로드하여 OffscreenCanvas로 페이지를 렌더링하고 ImageBitmap을 메인 스레드로 전달한다. viewer.js는 worker 메시지를 보내고 받아 drawImage()만 실행한다. pdfUrl이 null인 편집 후 reload 케이스는 기존 main-thread 렌더로 fallback한다.

**Tech Stack:** Electron, PDF.js (pdfjs-dist), OffscreenCanvas, Web Worker, ImageBitmap

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `renderer/render-worker.js` | **신규** — PDF.js 로드, OffscreenCanvas 렌더, ImageBitmap 전송 |
| `renderer/js/viewer.js` | **수정** — Worker 생성·연동, `_renderToCanvas()` 교체, API에 pdfUrl 파라미터 추가 |
| `renderer/js/pdf-loader.js` | **수정** — `loadPdf()` 반환값에 `pdfUrl` 추가 |
| `renderer/js/app-pdf.js` | **수정** — `tab.pdfUrl` 저장, viewer 호출 시 pdfUrl 전달 |

---

## Task 1: pdf-loader.js — pdfUrl 반환

**Files:**
- Modify: `renderer/js/pdf-loader.js`

- [ ] **Step 1: 변경 내용 적용**

`loadPdf()` 함수에서 `pdfUrl` 변수를 추출해 반환값에 포함한다.

`renderer/js/pdf-loader.js` 전체를 아래로 교체:

```js
// pdf-loader.js
const _workerReady = fetch('../node_modules/pdfjs-dist/build/pdf.worker.js')
  .then(r => r.blob())
  .then(blob => { pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob); });

let _pdfWorker = null;
function _getWorker() {
  if (!_pdfWorker || _pdfWorker.destroyed) {
    _pdfWorker = new pdfjsLib.PDFWorker({ name: 'pdf-worker' });
  }
  return _pdfWorker;
}

async function loadPdf(arrayBuffer, filePath) {
  await _workerReady;
  const bytes = new Uint8Array(arrayBuffer);
  const commonParams = {
    cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '../node_modules/pdfjs-dist/standard_fonts/',
    worker: _getWorker(),
    verbosity: 0,
  };

  let pdfJsDoc;
  let pdfUrl = null;

  if (filePath) {
    pdfUrl = 'pdffile://' + encodeURIComponent(filePath);
    pdfJsDoc = await pdfjsLib.getDocument({
      ...commonParams,
      url: pdfUrl,
      disableRange: false,
      disableStream: false,
    }).promise;
  } else {
    pdfJsDoc = await pdfjsLib.getDocument({
      ...commonParams,
      data: bytes.slice(),
    }).promise;
  }

  const pdfLibDoc = await PDFLib.PDFDocument.load(bytes.slice());
  return { pdfJsDoc, pdfLibDoc, pdfUrl };
}

function getPageCount(pdfJsDoc) {
  return pdfJsDoc.numPages;
}

window.PdfLoader = { loadPdf, getPageCount };
if (typeof module !== 'undefined') module.exports = { loadPdf, getPageCount };
```

- [ ] **Step 2: 앱 실행 후 기본 동작 확인**

```
npm start
```

PDF 파일을 열어 렌더링이 정상인지 확인한다. (아직 worker 미연결이므로 기존과 동일하게 동작해야 함)

- [ ] **Step 3: 커밋**

```bash
git add renderer/js/pdf-loader.js
git commit -m "feat: loadPdf()에 pdfUrl 반환값 추가"
```

---

## Task 2: render-worker.js 생성

**Files:**
- Create: `renderer/render-worker.js`

- [ ] **Step 1: 파일 생성**

`renderer/render-worker.js` 를 아래 내용으로 생성:

```js
// render-worker.js
importScripts('../node_modules/pdfjs-dist/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.js';

const _pdfCache = new Map();  // pdfUrl → PDFDocumentProxy
const _cancelled = new Set(); // 취소된 reqId

self.onmessage = function(e) {
  const msg = e.data;
  if (msg.type === 'cancel') {
    _cancelled.add(msg.id);
  } else if (msg.type === 'render') {
    _handleRender(msg);
  }
};

async function _handleRender({ id, pdfUrl, pageIndex, scale, dpr }) {
  try {
    let doc = _pdfCache.get(pdfUrl);
    if (!doc) {
      doc = await pdfjsLib.getDocument({
        url: pdfUrl,
        cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '../node_modules/pdfjs-dist/standard_fonts/',
        verbosity: 0,
      }).promise;
      _pdfCache.set(pdfUrl, doc);
    }

    const page = await doc.getPage(pageIndex + 1);
    const sharp = Math.max(1.5, Math.min(2, 2 / scale));
    const highVp = page.getViewport({ scale: scale * dpr * sharp });
    const displayW = Math.round(highVp.width / dpr / sharp);
    const displayH = Math.round(highVp.height / dpr / sharp);

    // ── 1단계: 저화질 ──
    const lowVp = page.getViewport({ scale: scale * dpr * 0.5 });
    const lowCanvas = new OffscreenCanvas(Math.round(lowVp.width), Math.round(lowVp.height));
    const lowCtx = lowCanvas.getContext('2d');
    lowCtx.fillStyle = '#ffffff';
    lowCtx.fillRect(0, 0, lowCanvas.width, lowCanvas.height);
    const lowTask = page.render({ canvasContext: lowCtx, viewport: lowVp });
    await lowTask.promise;

    if (_cancelled.has(id)) { _cancelled.delete(id); return; }

    const lowBitmap = await createImageBitmap(lowCanvas);
    self.postMessage({ id, phase: 'low', bitmap: lowBitmap, displayW, displayH }, [lowBitmap]);

    if (_cancelled.has(id)) { _cancelled.delete(id); return; }

    // ── 2단계: 고화질 ──
    const highCanvas = new OffscreenCanvas(Math.round(highVp.width), Math.round(highVp.height));
    const highCtx = highCanvas.getContext('2d');
    highCtx.fillStyle = '#ffffff';
    highCtx.fillRect(0, 0, highCanvas.width, highCanvas.height);
    const highTask = page.render({ canvasContext: highCtx, viewport: highVp });
    await highTask.promise;

    if (_cancelled.has(id)) { _cancelled.delete(id); return; }

    const highBitmap = await createImageBitmap(highCanvas);
    self.postMessage({ id, phase: 'high', bitmap: highBitmap, displayW, displayH }, [highBitmap]);

    _cancelled.delete(id);
  } catch (err) {
    if (err && err.name !== 'RenderingCancelledException') {
      self.postMessage({ id, phase: 'error', error: err.message });
    }
    _cancelled.delete(id);
  }
}
```

- [ ] **Step 2: worker가 로드되는지 확인**

앱을 실행하기 전, DevTools Console에서 확인할 수 있도록 임시 로그를 추가해두지 않아도 된다 — Task 3 이후 연결 시 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add renderer/render-worker.js
git commit -m "feat: render-worker.js 생성 (OffscreenCanvas + ImageBitmap)"
```

---

## Task 3: viewer.js — Worker 연동

**Files:**
- Modify: `renderer/js/viewer.js`

- [ ] **Step 1: viewer.js 전체 교체**

`renderer/js/viewer.js`를 아래 내용으로 교체한다:

```js
// viewer.js
window.Viewer = (function() {

  // ── 렌더링 캐시 ──
  const _pageCache = new WeakMap();
  const _CACHE_MAX = 50;

  function _cacheGet(doc, idx, scale) {
    const m = _pageCache.get(doc);
    return m ? m.get(idx + '_' + Math.round(scale * 100)) : null;
  }

  function _cacheSet(doc, idx, scale, bitmap) {
    if (!_pageCache.has(doc)) _pageCache.set(doc, new Map());
    const m = _pageCache.get(doc);
    m.set(idx + '_' + Math.round(scale * 100), bitmap);
    if (m.size > _CACHE_MAX) m.delete(m.keys().next().value);
  }

  // ── Render Worker ──
  const _renderWorker = new Worker('render-worker.js');
  let _reqId = 0;
  const _pendingRenders = new Map(); // reqId → { canvas, pdfJsDoc, pageIndex, scale }

  _renderWorker.onmessage = function(e) {
    const { id, phase, bitmap, displayW, displayH, error } = e.data;
    const pending = _pendingRenders.get(id);
    if (!pending) { if (bitmap) bitmap.close(); return; }

    const { canvas, pdfJsDoc, pageIndex, scale } = pending;

    if (phase === 'error') {
      console.error('render-worker:', error);
      _pendingRenders.delete(id);
      return;
    }

    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    canvas.style.width   = displayW + 'px';
    canvas.style.height  = displayH + 'px';
    canvas.style.display = 'inline-block';
    canvas.classList.remove('skeleton');
    if (canvas.parentElement) canvas.parentElement.style.minHeight = displayH + 'px';

    if (phase === 'high') {
      createImageBitmap(canvas).then(function(bmp) {
        _cacheSet(pdfJsDoc, pageIndex, scale, bmp);
      });
      _pendingRenders.delete(id);
      canvas._renderTask = null;
    }
  };

  // ── 페이지 렌더링 ──
  async function _renderToCanvas(pdfJsDoc, pageIndex, canvas, scale, pdfUrl) {
    // 기존 렌더 취소
    if (canvas._renderTask) {
      if (typeof canvas._renderTask === 'number') {
        _renderWorker.postMessage({ type: 'cancel', id: canvas._renderTask });
        _pendingRenders.delete(canvas._renderTask);
      } else {
        canvas._renderTask.cancel();
      }
      canvas._renderTask = null;
    }

    // 캐시 히트
    const cached = _cacheGet(pdfJsDoc, pageIndex, scale);
    if (cached) {
      const dpr   = window.devicePixelRatio || 1;
      const sharp = Math.max(1.5, Math.min(2, 2 / scale));
      canvas.width  = cached.width;
      canvas.height = cached.height;
      canvas.style.width   = (cached.width  / dpr / sharp) + 'px';
      canvas.style.height  = (cached.height / dpr / sharp) + 'px';
      canvas.style.display = 'inline-block';
      canvas.getContext('2d').drawImage(cached, 0, 0);
      canvas.classList.remove('skeleton');
      if (canvas.parentElement) canvas.parentElement.style.minHeight = canvas.style.height;
      return;
    }

    // Worker 경로 (pdfUrl 있음)
    if (pdfUrl) {
      const id  = ++_reqId;
      const dpr = window.devicePixelRatio || 1;
      canvas._renderTask = id;
      _pendingRenders.set(id, { canvas, pdfJsDoc, pageIndex, scale });
      _renderWorker.postMessage({ type: 'render', id, pdfUrl, pageIndex, scale, dpr });
      return;
    }

    // Fallback: main-thread 렌더 (편집 후 reload 등 pdfUrl 없는 경우)
    const page  = await pdfJsDoc.getPage(pageIndex + 1);
    const dpr   = window.devicePixelRatio || 1;
    const sharp = Math.max(1.5, Math.min(2, 2 / scale));
    const fullVp  = page.getViewport({ scale: scale * dpr * sharp });
    const displayW = (fullVp.width  / dpr / sharp) + 'px';
    const displayH = (fullVp.height / dpr / sharp) + 'px';

    const lowVp  = page.getViewport({ scale: scale * dpr * 0.5 });
    const lowBuf = document.createElement('canvas');
    lowBuf.width  = lowVp.width;
    lowBuf.height = lowVp.height;
    const lowTask = page.render({ canvasContext: lowBuf.getContext('2d'), viewport: lowVp });
    canvas._renderTask = lowTask;

    try {
      await lowTask.promise;
      canvas.width  = lowBuf.width;
      canvas.height = lowBuf.height;
      canvas.style.width   = displayW;
      canvas.style.height  = displayH;
      canvas.style.display = 'inline-block';
      canvas.getContext('2d').drawImage(lowBuf, 0, 0);
      canvas.classList.remove('skeleton');
      if (canvas.parentElement) canvas.parentElement.style.minHeight = displayH;
    } catch (e) {
      if (e && e.name !== 'RenderingCancelledException') console.error('render-low:', e);
      canvas._renderTask = null;
      return;
    }

    const highBuf = document.createElement('canvas');
    highBuf.width  = fullVp.width;
    highBuf.height = fullVp.height;
    const highTask = page.render({ canvasContext: highBuf.getContext('2d'), viewport: fullVp });
    canvas._renderTask = highTask;

    try {
      await highTask.promise;
      canvas.width  = highBuf.width;
      canvas.height = highBuf.height;
      canvas.style.width   = displayW;
      canvas.style.height  = displayH;
      canvas.getContext('2d').drawImage(highBuf, 0, 0);
      createImageBitmap(highBuf).then(function(bmp) { _cacheSet(pdfJsDoc, pageIndex, scale, bmp); });
    } catch (e) {
      if (e && e.name !== 'RenderingCancelledException') console.error('render-high:', e);
    }

    canvas._renderTask = null;
  }

  // ── IntersectionObserver ──
  function _makeObserver(pdfJsDoc, wrap) {
    return new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !entry.target._rendered) {
          entry.target._rendered = true;
          var c   = entry.target.querySelector('.pdf-page-canvas');
          var idx = Number(entry.target.dataset.pageIndex);
          _renderToCanvas(pdfJsDoc, idx, c, wrap._currentScale, wrap._pdfUrl);
        }
      });
    }, { root: wrap, rootMargin: '300px 0px' });
  }

  // ── 전체 페이지 초기 렌더 ──
  async function renderAllPages(pdfJsDoc, wrap, scale, onCurrentPage, pdfUrl) {
    if (wrap._pageScrollHandler) wrap.removeEventListener('scroll', wrap._pageScrollHandler);
    if (wrap._renderObserver)    wrap._renderObserver.disconnect();
    wrap._generation = (wrap._generation || 0) + 1;
    wrap.innerHTML   = '';
    wrap._pdfUrl     = pdfUrl || null;

    const firstPage = await pdfJsDoc.getPage(1);
    const dpr       = window.devicePixelRatio || 1;
    const sharp     = Math.max(1.5, Math.min(2, 2 / scale));
    const fvp       = firstPage.getViewport({ scale: scale * dpr * sharp });
    const phH = Math.round(fvp.height / dpr / sharp) + 'px';
    const phW = Math.round(fvp.width  / dpr / sharp) + 'px';

    for (var i = 0; i < pdfJsDoc.numPages; i++) {
      var pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.dataset.pageIndex = i;
      pageDiv.style.minHeight = phH;
      var canvas = document.createElement('canvas');
      canvas.className     = 'pdf-page-canvas skeleton';
      canvas.style.width   = phW;
      canvas.style.height  = phH;
      canvas.style.display = 'inline-block';
      pageDiv.appendChild(canvas);
      wrap.appendChild(pageDiv);
    }

    wrap._currentScale = scale;

    var firstDiv = wrap.querySelector('[data-page-index="0"]');
    if (firstDiv) {
      firstDiv._rendered = true;
      await _renderToCanvas(pdfJsDoc, 0, firstDiv.querySelector('.pdf-page-canvas'), scale, pdfUrl);
    }

    var observer = _makeObserver(pdfJsDoc, wrap);
    wrap.querySelectorAll('.pdf-page').forEach(function(p) { observer.observe(p); });
    wrap._renderObserver = observer;

    function onScroll() {
      var center  = wrap.scrollTop + wrap.clientHeight / 2;
      var pages   = wrap.querySelectorAll('.pdf-page');
      var current = 0;
      for (var i = 0; i < pages.length; i++) {
        if (pages[i].offsetTop <= center) current = i;
        else break;
      }
      if (onCurrentPage) onCurrentPage(current);
    }
    wrap.addEventListener('scroll', onScroll);
    wrap._pageScrollHandler = onScroll;
  }

  function scrollToPage(wrap, pageIndex) {
    var pageDiv = wrap.querySelector('[data-page-index="' + pageIndex + '"]');
    if (pageDiv) wrap.scrollTop = pageDiv.offsetTop;
  }

  // ── 확대/축소 후 재렌더 ──
  function rerenderAllPages(wrap, pdfJsDoc, scale) {
    var prevScale = wrap._currentScale || scale;
    wrap._currentScale = scale;

    if (prevScale > 0 && prevScale !== scale) {
      var ratio = scale / prevScale;
      wrap.querySelectorAll('.pdf-page').forEach(function(pageDiv) {
        var mh = parseFloat(pageDiv.style.minHeight);
        if (mh > 0) pageDiv.style.minHeight = Math.round(mh * ratio) + 'px';
        var c = pageDiv.querySelector('.pdf-page-canvas');
        if (c) {
          var h = parseFloat(c.style.height), w = parseFloat(c.style.width);
          if (h > 0) c.style.height = Math.round(h * ratio) + 'px';
          if (w > 0) c.style.width  = Math.round(w * ratio) + 'px';
        }
      });
    }

    wrap.querySelectorAll('.pdf-page').forEach(function(p) { p._rendered = false; });

    var scrollTop    = wrap.scrollTop;
    var scrollBottom = scrollTop + wrap.clientHeight;
    wrap.querySelectorAll('.pdf-page').forEach(function(pageDiv) {
      var top    = pageDiv.offsetTop;
      var bottom = top + pageDiv.offsetHeight;
      if (bottom >= scrollTop - 400 && top <= scrollBottom + 400) {
        pageDiv._rendered = true;
        _renderToCanvas(pdfJsDoc, Number(pageDiv.dataset.pageIndex),
          pageDiv.querySelector('.pdf-page-canvas'), scale, wrap._pdfUrl);
      }
    });

    if (wrap._renderObserver) {
      wrap._renderObserver.disconnect();
      var observer = _makeObserver(pdfJsDoc, wrap);
      wrap.querySelectorAll('.pdf-page').forEach(function(p) { observer.observe(p); });
      wrap._renderObserver = observer;
    }
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

  async function renderPage(pdfJsDoc, pageIndex, canvas, scale, pdfUrl) {
    await _renderToCanvas(pdfJsDoc, pageIndex, canvas, scale, pdfUrl);
  }

  return { renderPage, renderAllPages, scrollToPage, rerenderAllPages, updatePageInfo, updateZoomInfo, scaleFromSlider };
})();

if (typeof module !== 'undefined') module.exports = window.Viewer;
```

- [ ] **Step 2: 앱 실행 후 DevTools 확인**

```
npm start
```

DevTools > Console에 에러가 없는지 확인한다. PDF를 열었을 때 Network 탭에서 `render-worker.js`가 200으로 로드되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add renderer/js/viewer.js
git commit -m "feat: viewer.js에 render-worker 연동 (Worker 경로 + main-thread fallback)"
```

---

## Task 4: app-pdf.js — pdfUrl 전달

**Files:**
- Modify: `renderer/js/app-pdf.js`

- [ ] **Step 1: tab에 pdfUrl 저장**

`loadPdf` 함수 내 `const { pdfJsDoc, pdfLibDoc } = ...` 줄을 수정한다:

```js
// 변경 전
const { pdfJsDoc, pdfLibDoc } = await window.PdfLoader.loadPdf(buffer, filePath);

// 변경 후
const { pdfJsDoc, pdfLibDoc, pdfUrl } = await window.PdfLoader.loadPdf(buffer, filePath);
```

그 다음 `tab.classified = false;` 줄 바로 다음에 추가:

```js
tab.pdfUrl = pdfUrl;
```

- [ ] **Step 2: setupContinuousViewer에 pdfUrl 전달**

`setupContinuousViewer` 함수를 아래로 교체:

```js
async function setupContinuousViewer(side) {
  const st = sideState(side);
  const e  = sideEls(side);
  await window.Viewer.renderAllPages(st.pdfJsDoc, e.viewerCanvasWrap, st.scale, function(pi) {
    st.currentPage = pi;
    window.Viewer.updatePageInfo(e.pageInfo, pi, window.PdfLoader.getPageCount(st.pdfJsDoc));
  }, st.pdfUrl);
}
```

- [ ] **Step 3: 새 탭(createTab) 초기값에 pdfUrl 추가**

`createTab` 함수를 찾아 `pdfUrl: null`을 추가한다. (app-state.js 또는 app-tabs.js에 위치할 수 있음)

`app-state.js`와 `app-tabs.js`를 확인 후 `createTab()` 반환 객체에 `pdfUrl: null` 추가:

```js
// createTab() 반환값 예시 (기존 필드 유지하고 추가)
function createTab() {
  return {
    pdfJsDoc: null,
    pdfLibDoc: null,
    pdfUrl: null,       // ← 추가
    currentPage: 0,
    scale: 1.0,
    labels: {},
    filename: '',
    undoStack: [],
    redoStack: [],
    dirty: false,
    classified: false,
  };
}
```

- [ ] **Step 4: 앱 실행 후 전체 동작 검증**

```
npm start
```

아래 시나리오를 순서대로 테스트한다:

1. PDF 파일 열기 → 1페이지가 즉시 렌더, 이후 스크롤 시 페이지가 부드럽게 로드되는지 확인
2. DevTools Console에 에러 없는지 확인
3. 줌인/아웃 슬라이더 조작 → 재렌더가 정상인지 확인
4. 페이지 삭제 후 저장 → 리로드(편집 후 fallback 경로)가 정상인지 확인
5. 양면 분할 모드에서 양쪽 PDF 로드 → 양쪽 모두 정상 렌더인지 확인

- [ ] **Step 5: 커밋**

```bash
git add renderer/js/app-pdf.js
git commit -m "feat: pdfUrl을 tab에 저장하고 viewer에 전달"
```

---

## 완료 후 확인 항목

- [ ] `render-worker.js`가 DevTools > Sources에서 보임
- [ ] 스크롤 중 메인 스레드 CPU 사용률이 이전보다 낮아짐 (DevTools > Performance)
- [ ] 편집(삭제/추가) 후 reload 시 흰색 배경으로 정상 렌더
- [ ] 썸네일 배경 흰색 유지 (Task 0에서 이미 적용됨)
