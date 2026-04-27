// editor.js
const PDFDocument = (typeof PDFLib !== 'undefined' ? PDFLib : require('pdf-lib')).PDFDocument;

function deletePage(pdfLibDoc, pageIndex) {
  pdfLibDoc.removePage(pageIndex);
}

function reorderPages(pdfLibDoc, fromIndex, toIndex) {
  const pages = pdfLibDoc.getPages();
  const moved = pages.splice(fromIndex, 1)[0];
  pages.splice(toIndex, 0, moved);
  const count = pdfLibDoc.getPageCount();
  for (let i = count - 1; i >= 0; i--) pdfLibDoc.removePage(i);
  for (let i = 0; i < pages.length; i++) pdfLibDoc.addPage(pages[i]);
}

async function mergeDocuments(pdfLibDocs) {
  const merged = await PDFDocument.create();
  for (let d = 0; d < pdfLibDocs.length; d++) {
    const doc = pdfLibDocs[d];
    const indices = Array.from({ length: doc.getPageCount() }, function(_, i) { return i; });
    const copied = await merged.copyPages(doc, indices);
    copied.forEach(function(p) { merged.addPage(p); });
  }
  return merged;
}

async function splitDocument(pdfLibDoc, startIndex, pageCount) {
  const result = await PDFDocument.create();
  const indices = [];
  for (let i = 0; i < pageCount; i++) indices.push(startIndex + i);
  const copied = await result.copyPages(pdfLibDoc, indices);
  copied.forEach(function(p) { result.addPage(p); });
  return result;
}

if (typeof window !== 'undefined') window.Editor = { deletePage, reorderPages, mergeDocuments, splitDocument };
if (typeof module !== 'undefined') module.exports = { deletePage, reorderPages, mergeDocuments, splitDocument };
