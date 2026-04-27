const { PDFDocument } = require('pdf-lib');
const { deletePage, reorderPages, mergeDocuments, splitDocument } = require('../renderer/js/editor.js');

async function makeDoc(pageCount) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([200, 200]);
  return doc;
}

test('deletePage removes correct page', async () => {
  const doc = await makeDoc(3);
  deletePage(doc, 1);
  expect(doc.getPageCount()).toBe(2);
});

test('reorderPages moves page correctly', async () => {
  const doc = await makeDoc(3);
  const pages = doc.getPages();
  pages[0].setMediaBox(0, 0, 100, 100);
  pages[1].setMediaBox(0, 0, 200, 200);
  reorderPages(doc, 0, 1);
  expect(doc.getPage(0).getMediaBox().width).toBe(200);
});

test('mergeDocuments combines pages', async () => {
  const doc1 = await makeDoc(2);
  const doc2 = await makeDoc(3);
  const merged = await mergeDocuments([doc1, doc2]);
  expect(merged.getPageCount()).toBe(5);
});

test('splitDocument extracts page range', async () => {
  const doc = await makeDoc(5);
  const split = await splitDocument(doc, 1, 3);
  expect(split.getPageCount()).toBe(3);
});
