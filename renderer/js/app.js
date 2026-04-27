// app.js
const PdfLoader = window.PdfLoader;
const Thumbnail = window.Thumbnail;
const Viewer = window.Viewer;

const undoStack = [];
const redoStack = [];

async function pushHistory() {
  if (!state.pdfLibDoc) return;
  const bytes = await state.pdfLibDoc.save();
  undoStack.push(bytes);
  redoStack.length = 0;
  updateUndoRedoUI();
}

async function restoreFromBytes(saved) {
  const ab = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(ab);
  state.pdfJsDoc = pdfJsDoc;
  state.pdfLibDoc = pdfLibDoc;
  state.currentPage = Math.min(state.currentPage, pdfJsDoc.numPages - 1);
  state.labels = {};
  $('thumbnail-count').textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder, function(pageIndex, label) { state.labels[pageIndex] = label; });
  Thumbnail.setSelected($('thumbnail-list'), state.currentPage);
  await selectPage(state.currentPage);
}

async function undo() {
  if (undoStack.length === 0) return;
  const current = await state.pdfLibDoc.save();
  redoStack.push(current);
  await restoreFromBytes(undoStack.pop());
  updateUndoRedoUI();
}

async function redo() {
  if (redoStack.length === 0) return;
  const current = await state.pdfLibDoc.save();
  undoStack.push(current);
  await restoreFromBytes(redoStack.pop());
  updateUndoRedoUI();
}

function updateUndoRedoUI() {
  $('menu-undo').classList.toggle('disabled', undoStack.length === 0);
  $('menu-redo').classList.toggle('disabled', redoStack.length === 0);
}

const state = {
  pdfJsDoc: null,
  pdfLibDoc: null,
  currentPage: 0,
  scale: 1.0,
  labels: {},
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
  state.filename = result.name;
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoRedoUI();
  $('status-filename').textContent = result.name;
  $('thumbnail-count').textContent = PdfLoader.getPageCount(pdfJsDoc) + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder, function(pageIndex, label) { state.labels[pageIndex] = label; });
  Thumbnail.setSelected($('thumbnail-list'), 0);
  await selectPage(0);
  enableButtons(true);
}

async function selectPage(pageIndex) {
  state.currentPage = pageIndex;
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
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder, function(pageIndex, label) { state.labels[pageIndex] = label; });
  Thumbnail.setSelected($('thumbnail-list'), state.currentPage);
  await selectPage(state.currentPage);
}

async function handleReorder(oldIdx, newIdx) {
  await pushHistory();
  window.Editor.reorderPages(state.pdfLibDoc, oldIdx, newIdx);
}

function enableButtons(hasFile) {
  ['btn-delete','btn-split',
   'btn-auto-left','btn-auto-right','btn-auto-answer','btn-auto-all'].forEach(function(id) {
    $(id).disabled = !hasFile;
  });
}

$('menu-undo').addEventListener('click', function() { if (!$('menu-undo').classList.contains('disabled')) undo(); });
$('menu-redo').addEventListener('click', function() { if (!$('menu-redo').classList.contains('disabled')) redo(); });

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
});

$('btn-open').addEventListener('click', openFile);

$('btn-save').addEventListener('click', async function() {
  if (!state.pdfLibDoc) return;
  const bytes = await state.pdfLibDoc.save();
  await window.electronAPI.saveFile(bytes, state.filename);
});

$('btn-prev').addEventListener('click', function() {
  if (state.currentPage > 0) {
    Thumbnail.setSelected($('thumbnail-list'), state.currentPage - 1);
    selectPage(state.currentPage - 1);
  }
});
$('btn-next').addEventListener('click', function() {
  if (state.pdfJsDoc && state.currentPage < state.pdfJsDoc.numPages - 1) {
    Thumbnail.setSelected($('thumbnail-list'), state.currentPage + 1);
    selectPage(state.currentPage + 1);
  }
});

// 뷰어 스크롤: Ctrl+휠=확대/축소, 일반 휠=페이지 이동
$('viewer-canvas-wrap').addEventListener('wheel', async function(e) {
  if (!state.pdfJsDoc) return;
  if (e.ctrlKey) {
    e.preventDefault();
    const slider = $('zoom-slider');
    const step = e.deltaY < 0 ? 10 : -10;
    const newVal = Math.max(50, Math.min(400, Number(slider.value) + step));
    slider.value = newVal;
    state.scale = newVal / 100;
    Viewer.updateZoomInfo($('viewer-zoom-info'), state.scale);
    await Viewer.renderPage(state.pdfJsDoc, state.currentPage, $('viewer-canvas'), state.scale);
    return;
  }
  const wrap = $('viewer-canvas-wrap');
  const atTop = wrap.scrollTop === 0;
  const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1;
  if (e.deltaY < 0 && atTop && state.currentPage > 0) {
    e.preventDefault();
    selectPage(state.currentPage - 1);
    wrap.scrollTop = wrap.scrollHeight;
  } else if (e.deltaY > 0 && atBottom && state.currentPage < state.pdfJsDoc.numPages - 1) {
    e.preventDefault();
    selectPage(state.currentPage + 1);
    wrap.scrollTop = 0;
  }
}, { passive: false });

$('zoom-slider').addEventListener('input', async function(e) {
  state.scale = Viewer.scaleFromSlider(Number(e.target.value));
  Viewer.updateZoomInfo($('viewer-zoom-info'), state.scale);
  if (state.pdfJsDoc) await Viewer.renderPage(state.pdfJsDoc, state.currentPage, $('viewer-canvas'), state.scale);
});

$('btn-delete').addEventListener('click', async function() {
  if (!state.pdfLibDoc || state.pdfJsDoc.numPages <= 1) return;
  await pushHistory();
  window.Editor.deletePage(state.pdfLibDoc, state.currentPage);
  await reloadPdf();
});

$('btn-merge').addEventListener('click', async function() {
  const result = await window.electronAPI.openFile();
  if (!result) return;
  await pushHistory();
  const { pdfLibDoc: doc2 } = await PdfLoader.loadPdf(result.buffer);
  const merged = await window.Editor.mergeDocuments([state.pdfLibDoc, doc2]);
  const newBytes = await merged.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  state.pdfJsDoc = pdfJsDoc;
  state.pdfLibDoc = pdfLibDoc;
  state.currentPage = 0;
  state.labels = {};
  $('thumbnail-count').textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder, function(pageIndex, label) { state.labels[pageIndex] = label; });
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

// 뷰어 드래그 패닝
(function() {
  const wrap = $('viewer-canvas-wrap');
  let isDragging = false, startX, startY, scrollLeft, scrollTop;

  wrap.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    scrollLeft = wrap.scrollLeft;
    scrollTop = wrap.scrollTop;
    wrap.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    wrap.scrollLeft = scrollLeft - (e.clientX - startX);
    wrap.scrollTop = scrollTop - (e.clientY - startY);
  });

  document.addEventListener('mouseup', function() {
    if (!isDragging) return;
    isDragging = false;
    wrap.style.cursor = 'grab';
  });

  wrap.style.cursor = 'grab';
})();

// 썸네일 패널 리사이저
(function() {
  const resizer = $('panel-resizer');
  const panel = $('thumbnail-panel');
  let startX, startWidth;

  resizer.addEventListener('mousedown', function(e) {
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function(e) {
    if (!resizer.classList.contains('dragging')) return;
    const newWidth = Math.max(80, Math.min(400, startWidth + e.clientX - startX));
    panel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', function() {
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

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
