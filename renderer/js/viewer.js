// viewer.js
window.Viewer = (function() {

  // ── 렌더링 캐시 (WeakMap<pdfJsDoc, Map<"idx_scale", ImageBitmap>>) ──
  const _pageCache = new WeakMap();
  const _CACHE_MAX = 50;

  function _cacheGet(doc, idx, scale) {
    const m = _pageCache.get(doc);
    const dpr = window.devicePixelRatio || 1;
    return m ? m.get(idx + '_' + Math.round(scale * 100) + '_' + dpr) : null;
  }

  function _cacheSet(doc, idx, scale, bitmap) {
    if (!_pageCache.has(doc)) _pageCache.set(doc, new Map());
    const m = _pageCache.get(doc);
    const dpr = window.devicePixelRatio || 1;
    m.set(idx + '_' + Math.round(scale * 100) + '_' + dpr, bitmap);
    if (m.size > _CACHE_MAX) m.delete(m.keys().next().value);
  }

  // ── Render Worker ──
  const _renderWorker = new Worker('render-worker.js');
  let _reqId = 0;
  const _pendingRenders = new Map(); // reqId → { canvas, pdfJsDoc, pageIndex, scale }

  // ── Doc Registry ──
  const _docRegistry = new WeakMap(); // pdfJsDoc → docId
  let _docIdCounter = 0;

  function registerDoc(pdfJsDoc, buffer) {
    if (_docRegistry.has(pdfJsDoc)) return;
    const docId = ++_docIdCounter;
    _docRegistry.set(pdfJsDoc, docId);
    const copy = buffer instanceof ArrayBuffer
      ? buffer.slice()
      : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    _renderWorker.postMessage({ type: 'load', docId, buffer: copy }, [copy]);
  }

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

  // ── 페이지 렌더링 (저화질 → 고화질 점진) ──
  async function _renderToCanvas(pdfJsDoc, pageIndex, canvas, scale) {
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

    // 캐시 히트: 즉시 표시
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

    const docId = _docRegistry.get(pdfJsDoc);
    if (docId !== undefined) {
      // Worker 경로
      const id  = ++_reqId;
      const dpr = window.devicePixelRatio || 1;
      canvas._renderTask = id;
      _pendingRenders.set(id, { canvas, pdfJsDoc, pageIndex, scale });
      _renderWorker.postMessage({ type: 'render', id, docId, pageIndex, scale, dpr });
      return;
    }

    // Fallback: main-thread 렌더 (registerDoc 미호출 시)
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

  // ── IntersectionObserver 생성 (재사용) ──
  function _makeObserver(pdfJsDoc, wrap) {
    const margin = Math.round(wrap.clientHeight * 1.5) + 'px';
    return new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !entry.target._rendered) {
          entry.target._rendered = true;
          var c   = entry.target.querySelector('.pdf-page-canvas');
          var idx = Number(entry.target.dataset.pageIndex);
          _renderToCanvas(pdfJsDoc, idx, c, wrap._currentScale);
        }
      });
    }, { root: wrap, rootMargin: margin + ' 0px' });
  }

  // ── 전체 페이지 초기 렌더 ──
  async function renderAllPages(pdfJsDoc, wrap, scale, onCurrentPage) {
    if (wrap._pageScrollHandler) wrap.removeEventListener('scroll', wrap._pageScrollHandler);
    if (wrap._renderObserver)    wrap._renderObserver.disconnect();
    wrap._generation = (wrap._generation || 0) + 1;
    wrap.innerHTML   = '';

    // 플레이스홀더 크기 계산
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

    // 1페이지 즉시 렌더링
    var firstDiv = wrap.querySelector('[data-page-index="0"]');
    if (firstDiv) {
      firstDiv._rendered = true;
      await _renderToCanvas(pdfJsDoc, 0, firstDiv.querySelector('.pdf-page-canvas'), scale);
    }

    // IntersectionObserver: 보이는 페이지만 렌더링
    var observer = _makeObserver(pdfJsDoc, wrap);
    wrap.querySelectorAll('.pdf-page').forEach(function(p) { observer.observe(p); });
    wrap._renderObserver = observer;

    // 스크롤 현재 페이지 추적
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

    // CSS 크기를 비율로 즉시 조정 (렌더 전 레이아웃 유지)
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

    // 모든 페이지 렌더 상태 초기화
    wrap.querySelectorAll('.pdf-page').forEach(function(p) { p._rendered = false; });

    // 뷰포트 ±400px 범위 즉시 재렌더
    var scrollTop    = wrap.scrollTop;
    var scrollBottom = scrollTop + wrap.clientHeight;
    wrap.querySelectorAll('.pdf-page').forEach(function(pageDiv) {
      var top    = pageDiv.offsetTop;
      var bottom = top + pageDiv.offsetHeight;
      if (bottom >= scrollTop - 400 && top <= scrollBottom + 400) {
        pageDiv._rendered = true;
        _renderToCanvas(pdfJsDoc, Number(pageDiv.dataset.pageIndex),
          pageDiv.querySelector('.pdf-page-canvas'), scale);
      }
    });

    // Observer 재연결
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

  async function renderPage(pdfJsDoc, pageIndex, canvas, scale) {
    await _renderToCanvas(pdfJsDoc, pageIndex, canvas, scale);
  }

  return { registerDoc, renderPage, renderAllPages, scrollToPage, rerenderAllPages, updatePageInfo, updateZoomInfo, scaleFromSlider };
})();

if (typeof module !== 'undefined') module.exports = window.Viewer;
