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
