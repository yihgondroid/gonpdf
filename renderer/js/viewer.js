// viewer.js
let _currentScale = 1.0;

async function renderPage(pdfJsDoc, pageIndex, canvas, scale) {
  if (scale !== undefined) _currentScale = scale;
  const page = await pdfJsDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: _currentScale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
}

function updatePageInfo(infoEl, current, total) {
  infoEl.textContent = (current + 1) + ' / ' + total;
}

function updateZoomInfo(zoomEl, scale) {
  zoomEl.textContent = '🔍 ' + Math.round(scale * 100) + '%';
}

function scaleFromSlider(sliderValue) {
  return sliderValue / 100;
}

window.Viewer = { renderPage, updatePageInfo, updateZoomInfo, scaleFromSlider };
if (typeof module !== 'undefined') module.exports = { renderPage, updatePageInfo, updateZoomInfo, scaleFromSlider };
