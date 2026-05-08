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

  // ── 페이지 렌더링 (저화질 → 고화질 점진) ──
  async function _renderToCanvas(pdfJsDoc, pageIndex, canvas, scale, isScanned) {
    // 기존 렌더 취소
    if (canvas._renderTask) {
      canvas._renderTask.cancel();
      canvas._renderTask = null;
    }

    // 캐시 히트: 즉시 표시
    const cached = _cacheGet(pdfJsDoc, pageIndex, scale);
    if (cached) {
      const dpr   = window.devicePixelRatio || 1;
      const sharp = isScanned ? 1.0 : Math.max(1.5, Math.min(2, 2 / scale));
      canvas.width  = cached.width;
      canvas.height = cached.height;
      canvas.style.width   = (cached.width  / dpr / sharp) + 'px';
      canvas.style.height  = (cached.height / dpr / sharp) + 'px';
      canvas.style.display = 'inline-block';
      canvas.getContext('2d').drawImage(cached, 0, 0);
      if (canvas.parentElement) canvas.parentElement.style.minHeight = canvas.style.height;
      return;
    }

    const page  = await pdfJsDoc.getPage(pageIndex + 1);
    const dpr   = window.devicePixelRatio || 1;
    const sharp = isScanned ? 1.0 : Math.max(1.5, Math.min(2, 2 / scale));
    const fullVp  = page.getViewport({ scale: scale * dpr * sharp });
    const displayW = (fullVp.width  / dpr / sharp) + 'px';
    const displayH = (fullVp.height / dpr / sharp) + 'px';

    const lowVp  = page.getViewport({ scale: scale * dpr * 0.5 });
    const lowBuf = document.createElement('canvas');
    lowBuf.width  = Math.round(lowVp.width);
    lowBuf.height = Math.round(lowVp.height);
    lowBuf.getContext('2d').fillStyle = '#ffffff';
    lowBuf.getContext('2d').fillRect(0, 0, lowBuf.width, lowBuf.height);
    const _type    = isScanned ? '스캔' : '일반';
    const _lowLbl  = 'p' + pageIndex + ' low  [' + _type + ']';
    const _highLbl = 'p' + pageIndex + ' high [' + _type + ']';

    const lowTask = page.render({ canvasContext: lowBuf.getContext('2d'), viewport: lowVp });
    canvas._renderTask = lowTask;

    console.time(_lowLbl);
    try {
      await lowTask.promise;
      canvas.width  = lowBuf.width;
      canvas.height = lowBuf.height;
      canvas.style.width   = displayW;
      canvas.style.height  = displayH;
      canvas.style.display = 'inline-block';
      canvas.getContext('2d').drawImage(lowBuf, 0, 0);
      if (canvas.parentElement) canvas.parentElement.style.minHeight = displayH;
    } catch (e) {
      console.timeEnd(_lowLbl);
      if (e && e.name !== 'RenderingCancelledException') console.error('render-low:', e);
      canvas._renderTask = null;
      return;
    }
    console.timeEnd(_lowLbl);

    const highBuf = document.createElement('canvas');
    highBuf.width  = Math.round(fullVp.width);
    highBuf.height = Math.round(fullVp.height);
    highBuf.getContext('2d').fillStyle = '#ffffff';
    highBuf.getContext('2d').fillRect(0, 0, highBuf.width, highBuf.height);
    const highTask = page.render({ canvasContext: highBuf.getContext('2d'), viewport: fullVp });
    canvas._renderTask = highTask;

    console.time(_highLbl);
    try {
      await highTask.promise;
      canvas.width  = highBuf.width;
      canvas.height = highBuf.height;
      canvas.style.width   = displayW;
      canvas.style.height  = displayH;
      canvas.getContext('2d').drawImage(highBuf, 0, 0);
      createImageBitmap(highBuf).then(function(bmp) { _cacheSet(pdfJsDoc, pageIndex, scale, bmp); });
    } catch (e) {
      console.timeEnd(_highLbl);
      if (e && e.name !== 'RenderingCancelledException') console.error('render-high:', e);
    }
    console.timeEnd(_highLbl);

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
          _renderToCanvas(pdfJsDoc, idx, c, wrap._currentScale, wrap._isScanned);
        }
      });
    }, { root: wrap, rootMargin: margin + ' 0px' });
  }

  // ── 스캔 PDF 감지 (첫 3페이지에 텍스트 없으면 스캔으로 판단) ──
  async function isScannedPDF(pdfJsDoc) {
    var sampleCount = Math.min(3, pdfJsDoc.numPages);
    for (var i = 0; i < sampleCount; i++) {
      var page    = await pdfJsDoc.getPage(i + 1);
      var content = await page.getTextContent();
      if (content.items.some(function(item) { return item.str && item.str.trim().length > 0; })) {
        return false;
      }
    }
    return true;
  }

  // ── 전체 페이지 초기 렌더 ──
  async function renderAllPages(pdfJsDoc, wrap, scale, onCurrentPage) {
    if (wrap._pageScrollHandler) wrap.removeEventListener('scroll', wrap._pageScrollHandler);
    if (wrap._renderObserver)    wrap._renderObserver.disconnect();
    wrap._generation = (wrap._generation || 0) + 1;

    wrap.innerHTML = '';

    // 스캔 PDF 감지 및 sharp 결정
    var isScanned = await isScannedPDF(pdfJsDoc);
    wrap._isScanned = isScanned;
    var dpr   = window.devicePixelRatio || 1;
    var sharp = isScanned ? 1.0 : Math.max(1.5, Math.min(2, 2 / scale));

    var _initLbl = 'renderAllPages [' + (isScanned ? '스캔' : '일반') + '] ' + pdfJsDoc.numPages + 'p';
    console.time(_initLbl);

    // 각 페이지별 플레이스홀더 크기 계산
    var allPages = await Promise.all(
      Array.from({ length: pdfJsDoc.numPages }, function(_, i) { return pdfJsDoc.getPage(i + 1); })
    );

    for (var i = 0; i < pdfJsDoc.numPages; i++) {
      var vp  = allPages[i].getViewport({ scale: scale * dpr * sharp });
      var phH = Math.round(vp.height / dpr / sharp) + 'px';
      var phW = Math.round(vp.width  / dpr / sharp) + 'px';

      var pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.dataset.pageIndex = i;
      pageDiv.style.minHeight = phH;
      var canvas = document.createElement('canvas');
      canvas.className     = 'pdf-page-canvas';
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
      await _renderToCanvas(pdfJsDoc, 0, firstDiv.querySelector('.pdf-page-canvas'), scale, isScanned);
    }
    console.timeEnd(_initLbl);

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
          pageDiv.querySelector('.pdf-page-canvas'), scale, wrap._isScanned);
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

  return { renderPage, renderAllPages, scrollToPage, rerenderAllPages, updatePageInfo, updateZoomInfo, scaleFromSlider };
})();

if (typeof module !== 'undefined') module.exports = window.Viewer;
