const { PDFDocument } = require('pdf-lib');
const { cropPage } = require('../renderer/js/crop.js');

test('cropPage sets CropBox on specified page', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  cropPage(doc, 0, { x: 100, y: 100, width: 200, height: 400 });
  const cropBox = doc.getPage(0).getCropBox();
  expect(Math.round(cropBox.x)).toBe(100);
  expect(Math.round(cropBox.width)).toBe(200);
});

test('cropPageLeft crops left half', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  cropPage(doc, 0, { x: 0, y: 0, width: 300, height: 800 });
  const cropBox = doc.getPage(0).getCropBox();
  expect(Math.round(cropBox.width)).toBe(300);
});
