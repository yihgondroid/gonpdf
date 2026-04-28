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
