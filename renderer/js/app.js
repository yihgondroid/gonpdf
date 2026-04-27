// app.js
const PdfLoader = window.PdfLoader;
const Thumbnail = window.Thumbnail;
const Viewer = window.Viewer;

const state = {
  pdfJsDoc: null,
  pdfLibDoc: null,
  currentPage: 0,
  scale: 1.0,
  labels: {},
  ocrResults: null,
  filename: '',
};

function $(id) { return document.getElementById(id); }

async function openFile() {
  const result = await window.electronAPI.openFile();
  if (!result) return;
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(result.buffer);
  state.pdfJsDoc = pdfJsDoc;
  state.pdfLibDoc = pdfLibDoc;
  state.currentPage = 0;
  state.labels = {};
  state.ocrResults = null;
  state.filename = result.name;
  $('status-filename').textContent = result.name;
  $('thumbnail-count').textContent = PdfLoader.getPageCount(pdfJsDoc) + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder);
  await selectPage(0);
  enableButtons(true);
}

async function selectPage(pageIndex) {
  state.currentPage = pageIndex;
  Thumbnail.setSelected($('thumbnail-list'), pageIndex);
  await Viewer.renderPage(state.pdfJsDoc, pageIndex, $('viewer-canvas'), state.scale);
  Viewer.updatePageInfo($('viewer-page-info'), pageIndex, PdfLoader.getPageCount(state.pdfJsDoc));
}

async function reloadPdf() {
  const newBytes = await state.pdfLibDoc.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  state.pdfJsDoc = pdfJsDoc;
  state.pdfLibDoc = pdfLibDoc;
  state.currentPage = Math.min(state.currentPage, pdfJsDoc.numPages - 1);
  $('thumbnail-count').textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder);
  await selectPage(state.currentPage);
}

function handleReorder(oldIdx, newIdx) {
  window.Editor.reorderPages(state.pdfLibDoc, oldIdx, newIdx);
}

function enableButtons(hasFile) {
  ['btn-delete','btn-crop','btn-split','btn-ocr',
   'btn-auto-left','btn-auto-right','btn-auto-answer','btn-auto-all'].forEach(function(id) {
    $(id).disabled = !hasFile;
  });
}

$('btn-open').addEventListener('click', openFile);

$('btn-save').addEventListener('click', async function() {
  if (!state.pdfLibDoc) return;
  const bytes = await state.pdfLibDoc.save();
  await window.electronAPI.saveFile(bytes, state.filename);
});

$('btn-prev').addEventListener('click', function() {
  if (state.currentPage > 0) selectPage(state.currentPage - 1);
});
$('btn-next').addEventListener('click', function() {
  if (state.pdfJsDoc && state.currentPage < state.pdfJsDoc.numPages - 1)
    selectPage(state.currentPage + 1);
});

$('zoom-slider').addEventListener('input', async function(e) {
  state.scale = Viewer.scaleFromSlider(Number(e.target.value));
  Viewer.updateZoomInfo($('viewer-zoom-info'), state.scale);
  if (state.pdfJsDoc) await Viewer.renderPage(state.pdfJsDoc, state.currentPage, $('viewer-canvas'), state.scale);
});

$('btn-delete').addEventListener('click', async function() {
  if (!state.pdfLibDoc || state.pdfJsDoc.numPages <= 1) return;
  window.Editor.deletePage(state.pdfLibDoc, state.currentPage);
  await reloadPdf();
});

$('btn-merge').addEventListener('click', async function() {
  const result = await window.electronAPI.openFile();
  if (!result) return;
  const { pdfLibDoc: doc2 } = await PdfLoader.loadPdf(result.buffer);
  const merged = await window.Editor.mergeDocuments([state.pdfLibDoc, doc2]);
  const newBytes = await merged.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  state.pdfJsDoc = pdfJsDoc;
  state.pdfLibDoc = pdfLibDoc;
  state.currentPage = 0;
  state.labels = {};
  $('thumbnail-count').textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder);
  await selectPage(0);
  $('status-info').textContent = '합치기 완료 (' + pdfJsDoc.numPages + ' 페이지)';
});

$('btn-split').addEventListener('click', async function() {
  if (!state.pdfLibDoc) return;
  const total = state.pdfJsDoc.numPages;
  const input = prompt('나누기: 시작-끝 페이지 입력 (예: 1-3, 전체 ' + total + '페이지)');
  if (!input) return;
  const parts = input.split('-');
  const start = parseInt(parts[0], 10) - 1;
  const count = parseInt(parts[1], 10) - start;
  if (isNaN(start) || isNaN(count) || count <= 0) return;
  const splitDoc = await window.Editor.splitDocument(state.pdfLibDoc, start, count);
  const bytes = await splitDoc.save();
  await window.electronAPI.saveFile(bytes, 'split_p' + (start+1) + '-' + (start+count) + '.pdf');
  $('status-info').textContent = '나누기 저장 완료 (' + count + ' 페이지)';
});

$('btn-ocr').addEventListener('click', async function() {
  if (!state.pdfJsDoc) return;
  $('status-info').textContent = 'OCR 진행 중...';
  const results = await window.Ocr.ocrAllPages(state.pdfJsDoc, function(done, total) {
    $('status-info').textContent = 'OCR ' + done + '/' + total;
  });
  state.ocrResults = results;
  $('status-info').textContent = 'OCR 완료';
  $('btn-classify').disabled = false;
});

$('btn-classify').addEventListener('click', function() {
  if (!state.ocrResults) return;
  state.labels = window.Classifier.classifyPages(state.ocrResults, { minConsecutive: 2 });
  Thumbnail.updateAllBadges($('thumbnail-list'), state.labels);
  $('status-info').textContent = '자동 분류 완료';
  ['btn-auto-left','btn-auto-right','btn-auto-answer','btn-auto-all'].forEach(function(id) {
    $(id).disabled = false;
  });
});

async function saveDoc(doc, defaultName) {
  const bytes = await doc.save();
  await window.electronAPI.saveFile(bytes, defaultName);
}

$('btn-auto-left').addEventListener('click', async function() {
  const doc = await window.Automation.buildAutomationOutput(state.pdfLibDoc, state.labels, 'left');
  await saveDoc(doc, '문제_좌.pdf');
  $('status-info').textContent = '문제_좌.pdf 저장 완료';
});

$('btn-auto-right').addEventListener('click', async function() {
  const doc = await window.Automation.buildAutomationOutput(state.pdfLibDoc, state.labels, 'right');
  await saveDoc(doc, '문제_우.pdf');
  $('status-info').textContent = '문제_우.pdf 저장 완료';
});

$('btn-auto-answer').addEventListener('click', async function() {
  const doc = await window.Automation.buildAutomationOutput(state.pdfLibDoc, state.labels, 'answer');
  await saveDoc(doc, '해설.pdf');
  $('status-info').textContent = '해설.pdf 저장 완료';
});

$('btn-auto-all').addEventListener('click', async function() {
  $('status-info').textContent = '전체 분리 처리 중...';
  const outputs = await window.Automation.runAutomationAll(state.pdfLibDoc, state.labels);
  const files = [];
  for (let i = 0; i < outputs.length; i++) {
    files.push({ name: outputs[i].name, buffer: await outputs[i].doc.save() });
  }
  await window.electronAPI.saveFiles(files);
  $('status-info').textContent = '전체 분리 저장 완료 (파일 3개)';
});
