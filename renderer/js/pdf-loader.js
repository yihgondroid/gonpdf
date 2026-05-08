// pdf-loader.js
const _workerReady = fetch('../node_modules/pdfjs-dist/build/pdf.worker.js')
  .then(r => r.blob())
  .then(blob => { pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob); });

// PDFWorker 인스턴스 재사용 — 매 로드마다 새 워커 생성 방지
let _pdfWorker = null;
function _getWorker() {
  if (!_pdfWorker || _pdfWorker.destroyed) {
    _pdfWorker = new pdfjsLib.PDFWorker({ name: 'pdf-worker' });
  }
  return _pdfWorker;
}

async function loadPdf(arrayBuffer) {
  await _workerReady;
  const bytes = new Uint8Array(arrayBuffer);
  const pdfJsDoc = await pdfjsLib.getDocument({
    cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '../node_modules/pdfjs-dist/standard_fonts/',
    worker: _getWorker(),
    verbosity: 0,
    data: bytes.slice(),
  }).promise;

  const pdfLibDoc = await PDFLib.PDFDocument.load(bytes.slice());
  return { pdfJsDoc, pdfLibDoc };
}

function getPageCount(pdfJsDoc) {
  return pdfJsDoc.numPages;
}

window.PdfLoader = { loadPdf, getPageCount };
if (typeof module !== 'undefined') module.exports = { loadPdf, getPageCount };
