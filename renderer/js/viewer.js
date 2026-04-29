// viewer.js
window.Viewer = (function() {

  async function renderPage(pdfJsDoc, pageIndex, canvas, scale) {
    if (!pdfJsDoc) return;
    if (canvas._renderTask) { canvas._renderTask.cancel(); canvas._renderTask = null; }
    const page = await pdfJsDoc.getPage(pageIndex + 1);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * dpr });

    // offscreen 캔버스에 렌더링 — 완료 전까지 기존 화면 유지
    const buf = document.createElement('canvas');
    buf.width  = viewport.width;
    buf.height = viewport.height;
    canvas._renderTask = page.render({ canvasContext: buf.getContext('2d'), viewport: viewport });
    try {
      await canvas._renderTask.promise;
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width  = (viewport.width  / dpr) + 'px';
      canvas.style.height = (viewport.height / dpr) + 'px';
      canvas.style.display = 'inline-block';
      canvas.getContext('2d').drawImage(buf, 0, 0);
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
