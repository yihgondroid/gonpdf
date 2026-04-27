// pdf-loader.js
// fetch worker and create blob URL to bypass CSP file: restriction
const _workerReady = fetch('../node_modules/pdfjs-dist/build/pdf.worker.js')
  .then(r => r.blob())
  .then(blob => { pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob); });

async function loadPdf(arrayBuffer) {
  await _workerReady;
  const bytes = new Uint8Array(arrayBuffer);
  const pdfJsDoc = await pdfjsLib.getDocument({
    data: bytes.slice(),
    cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '../node_modules/pdfjs-dist/standard_fonts/',
  }).promise;
  const pdfLibDoc = await PDFLib.PDFDocument.load(bytes.slice());
  return { pdfJsDoc, pdfLibDoc };
}

function getPageCount(pdfJsDoc) {
  return pdfJsDoc.numPages;
}

window.PdfLoader = { loadPdf, getPageCount };
if (typeof module !== 'undefined') module.exports = { loadPdf, getPageCount };
