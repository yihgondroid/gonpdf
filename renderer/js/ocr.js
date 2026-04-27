// ocr.js
async function extractTextFromCanvas(canvas, tesseractLib) {
  if (!tesseractLib) tesseractLib = Tesseract;
  const worker = await tesseractLib.createWorker('kor');
  const result = await worker.recognize(canvas);
  await worker.terminate();
  return result.data.text;
}

async function ocrAllPages(pdfJsDoc, onProgress) {
  const results = [];
  const total = pdfJsDoc.numPages;
  for (let i = 0; i < total; i++) {
    const page = await pdfJsDoc.getPage(i + 1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
    const text = await extractTextFromCanvas(canvas);
    results.push({ pageIndex: i, text: text });
    if (onProgress) onProgress(i + 1, total);
  }
  return results;
}

if (typeof window !== 'undefined') window.Ocr = { extractTextFromCanvas, ocrAllPages };
if (typeof module !== 'undefined') module.exports = { extractTextFromCanvas, ocrAllPages };
