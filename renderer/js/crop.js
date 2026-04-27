// crop.js
function cropPage(pdfLibDoc, pageIndex, rect) {
  const page = pdfLibDoc.getPage(pageIndex);
  page.setCropBox(rect.x, rect.y, rect.width, rect.height);
}

function cropPages(pdfLibDoc, pageIndices, rect) {
  for (let i = 0; i < pageIndices.length; i++) {
    cropPage(pdfLibDoc, pageIndices[i], rect);
  }
}

function canvasRectToPdfRect(canvasRect, pdfPage, canvasEl) {
  const pdfWidth = pdfPage.getWidth();
  const pdfHeight = pdfPage.getHeight();
  const scaleX = pdfWidth / canvasEl.width;
  const scaleY = pdfHeight / canvasEl.height;
  return {
    x: canvasRect.x * scaleX,
    y: pdfHeight - (canvasRect.y + canvasRect.height) * scaleY,
    width: canvasRect.width * scaleX,
    height: canvasRect.height * scaleY,
  };
}

if (typeof window !== 'undefined') window.Crop = { cropPage, cropPages, canvasRectToPdfRect };
if (typeof module !== 'undefined') module.exports = { cropPage, cropPages, canvasRectToPdfRect };
