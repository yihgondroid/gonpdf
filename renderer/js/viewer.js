// viewer.js
window.Viewer = (function() {

  async function _renderToCanvas(pdfJsDoc, pageIndex, canvas, scale) {
    if (canvas._renderTask) { canvas._renderTask.cancel(); canvas._renderTask = null; }
    const page = await pdfJsDoc.getPage(pageIndex + 1);
    const dpr = window.devicePixelRatio || 1;
    // 줌이 낮을수록 추가 배율을 올려 항상 2x 이상 픽셀 밀도를 유지
    const sharp = Math.max(1, Math.min(2, 2 / scale));
    const viewport = page.getViewport({ scale: scale * dpr * sharp });
    const buf = document.createElement('canvas');
    buf.width  = viewport.width;
    buf.height = viewport.height;
    canvas._renderTask = page.render({ canvasContext: buf.getContext('2d'), viewport: viewport });
    try {
      await canvas._renderTask.promise;
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width  = (viewport.width  / dpr / sharp) + 'px';
      canvas.style.height = (viewport.height / dpr / sharp) + 'px';
      canvas.style.display = 'inline-block';
      canvas.getContext('2d').drawImage(buf, 0, 0);
      // 부모 div의 minHeight를 캔버스 실제 높이로 동기화
      if (canvas.parentElement) canvas.parentElement.style.minHeight = canvas.style.height;
    } catch(e) {
      if (e && e.name !== 'RenderingCancelledException') console.error('render:', e);
    }
    canvas._renderTask = null;
  }

  async function renderAllPages(pdfJsDoc, wrap, scale, onCurrentPage) {
    if (wrap._pageScrollHandler) wrap.removeEventListener('scroll', wrap._pageScrollHandler);
    if (wrap._renderObserver) wrap._renderObserver.disconnect();
    wrap.innerHTML = '';

    // 첫 페이지 높이로 placeholder 크기 결정
    const firstPage = await pdfJsDoc.getPage(1);
    const dpr = window.devicePixelRatio || 1;
    const firstViewport = firstPage.getViewport({ scale: scale * dpr });
    const phHeight = Math.round(firstViewport.height / dpr) + 'px';

    for (var i = 0; i < pdfJsDoc.numPages; i++) {
      var pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.dataset.pageIndex = i;
      pageDiv.style.minHeight = phHeight;
      var canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      pageDiv.appendChild(canvas);
      wrap.appendChild(pageDiv);
    }

    // 뷰포트 근처 페이지만 렌더링
    wrap._currentScale = scale;

    var renderObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !entry.target._rendered) {
          entry.target._rendered = true;
          var c = entry.target.querySelector('.pdf-page-canvas');
          var idx = Number(entry.target.dataset.pageIndex);
          _renderToCanvas(pdfJsDoc, idx, c, wrap._currentScale);
        }
      });
    }, { root: wrap, rootMargin: '400px 0px' });

    wrap.querySelectorAll('.pdf-page').forEach(function(p) { renderObserver.observe(p); });
    wrap._renderObserver = renderObserver;

    // 스크롤 위치로 현재 페이지 추적
    function onScroll() {
      var center = wrap.scrollTop + wrap.clientHeight / 2;
      var pages = wrap.querySelectorAll('.pdf-page');
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

  function rerenderAllPages(wrap, pdfJsDoc, scale) {
    var prevScale = wrap._currentScale || scale;
    wrap._currentScale = scale;

    // 스케일 변경 시 모든 페이지의 크기를 비율에 맞게 즉시 조정 (간격 일정 유지)
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

    wrap.querySelectorAll('.pdf-page').forEach(function(pageDiv) {
      pageDiv._rendered = false;
    });
    var scrollTop = wrap.scrollTop;
    var scrollBottom = scrollTop + wrap.clientHeight;
    wrap.querySelectorAll('.pdf-page').forEach(function(pageDiv) {
      var top = pageDiv.offsetTop;
      var bottom = top + pageDiv.offsetHeight;
      if (bottom >= scrollTop - 400 && top <= scrollBottom + 400) {
        pageDiv._rendered = true;
        var canvas = pageDiv.querySelector('.pdf-page-canvas');
        var idx = Number(pageDiv.dataset.pageIndex);
        _renderToCanvas(pdfJsDoc, idx, canvas, scale);
      }
    });
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

  // 하위 호환 유지
  async function renderPage(pdfJsDoc, pageIndex, canvas, scale) {
    await _renderToCanvas(pdfJsDoc, pageIndex, canvas, scale);
  }

  return { renderPage, renderAllPages, scrollToPage, rerenderAllPages, updatePageInfo, updateZoomInfo, scaleFromSlider };
})();

if (typeof module !== 'undefined') module.exports = window.Viewer;
