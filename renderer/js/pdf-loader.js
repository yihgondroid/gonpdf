// pdf-loader.js
pdfjsLib.GlobalWorkerOptions.workerSrc =
  '../node_modules/pdfjs-dist/build/pdf.worker.mjs';

async function loadPdf(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const pdfJsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pdfLibDoc = await PDFLib.PDFDocument.load(bytes.slice());
  return { pdfJsDoc, pdfLibDoc };
}

function getPageCount(pdfJsDoc) {
  return pdfJsDoc.numPages;
}

window.PdfLoader = { loadPdf, getPageCount };
if (typeof module !== 'undefined') module.exports = { loadPdf, getPageCount };
