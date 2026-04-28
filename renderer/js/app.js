// app.js
const PdfLoader = window.PdfLoader;
const Thumbnail = window.Thumbnail;
const Viewer    = window.Viewer;

const stateL = { pdfJsDoc: null, pdfLibDoc: null, currentPage: 0, scale: 1.0, labels: {}, filename: '' };
const stateR = { pdfJsDoc: null, pdfLibDoc: null, currentPage: 0, scale: 1.0, labels: {}, filename: '' };
let activeSide = 'left';
let splitMode  = false;

const undoStackL = [], redoStackL = [];
const undoStackR = [], redoStackR = [];

function activeState() { return activeSide === 'left' ? stateL : stateR; }
function activeUndo()  { return activeSide === 'left' ? undoStackL : undoStackR; }
function activeRedo()  { return activeSide === 'left' ? redoStackL : redoStackR; }

function sideEls(side) {
  const s = side || activeSide;
  return {
    thumbnailPanel:   document.getElementById('thumbnail-panel-' + s),
    thumbnailList:    document.getElementById('thumbnail-list-' + s),
    thumbnailCount:   document.getElementById('thumbnail-count-' + s),
    viewerPanel:      document.getElementById('viewer-panel-' + s),
    viewerCanvasWrap: document.getElementById('viewer-canvas-wrap-' + s),
    viewerCanvas:     document.getElementById('viewer-canvas-' + s),
    pageInfo:         document.getElementById('viewer-page-info-' + s),
    zoomInfo:         document.getElementById('viewer-zoom-info-' + s),
    zoomSlider:       document.getElementById('zoom-slider-' + s),
    btnPrev:          document.getElementById('btn-prev-' + s),
    btnNext:          document.getElementById('btn-next-' + s),
    thumbZoomSlider:  document.getElementById('thumb-zoom-slider-' + s),
    thumbZoomLabel:   document.getElementById('thumb-zoom-label-' + s),
  };
}

async function pushHistory() {
  const st = activeState();
  if (!st.pdfLibDoc) return;
  const bytes = await st.pdfLibDoc.save();
  activeUndo().push(bytes);
  activeRedo().length = 0;
}

async function restoreFromBytes(saved, side) {
  const st   = side === 'left' ? stateL : stateR;
  const e    = sideEls(side);
  const ab   = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(ab);
  st.pdfJsDoc    = pdfJsDoc;
  st.pdfLibDoc   = pdfLibDoc;
  st.currentPage = Math.min(st.currentPage, pdfJsDoc.numPages - 1);
  st.labels      = {};
  e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  Thumbnail.setSelected(e.thumbnailList, st.currentPage);
  await selectPage(side, st.currentPage);
}

async function undo() {
  const undoStack = activeUndo();
  const redoStack = activeRedo();
  if (undoStack.length === 0) return;
  const current = await activeState().pdfLibDoc.save();
  redoStack.push(current);
  await restoreFromBytes(undoStack.pop(), activeSide);
}

async function redo() {
  const undoStack = activeUndo();
  const redoStack = activeRedo();
  if (redoStack.length === 0) return;
  const current = await activeState().pdfLibDoc.save();
  undoStack.push(current);
  await restoreFromBytes(redoStack.pop(), activeSide);
}

function $(id) { return document.getElementById(id); }

/* ── 파일 열기 ── */
async function openFile() {
  const result = await window.electronAPI.openFile();
  if (!result) return;
  await loadPdf(activeSide, result.buffer, result.name);
}

async function loadPdf(side, buffer, name) {
  const st  = side === 'left' ? stateL : stateR;
  const e   = sideEls(side);
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(buffer);
  st.pdfJsDoc    = pdfJsDoc;
  st.pdfLibDoc   = pdfLibDoc;
  st.currentPage = 0;
  st.labels      = {};
  st.filename    = name;
  const undoStack = side === 'left' ? undoStackL : undoStackR;
  const redoStack = side === 'left' ? redoStackL : redoStackR;
  undoStack.length = 0;
  redoStack.length = 0;
  $('status-filename').textContent = name;
  e.thumbnailCount.textContent = PdfLoader.getPageCount(pdfJsDoc) + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  Thumbnail.setSelected(e.thumbnailList, 0);
  await selectPage(side, 0);
  enableButtons(true);
}

async function selectPage(side, pageIndex) {
  const st = side === 'left' ? stateL : stateR;
  const e  = sideEls(side);
  st.currentPage = pageIndex;
  await Viewer.renderPage(st.pdfJsDoc, pageIndex, e.viewerCanvas, st.scale);
  Viewer.updatePageInfo(e.pageInfo, pageIndex, PdfLoader.getPageCount(st.pdfJsDoc));
}

async function reloadPdf() {
  const side = activeSide;
  const st   = activeState();
  const e    = sideEls(side);
  const newBytes = await st.pdfLibDoc.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  st.pdfJsDoc    = pdfJsDoc;
  st.pdfLibDoc   = pdfLibDoc;
  st.currentPage = Math.min(st.currentPage, pdfJsDoc.numPages - 1);
  e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  Thumbnail.setSelected(e.thumbnailList, st.currentPage);
  await selectPage(side, st.currentPage);
}

async function handleReorder(side, oldIdx, newIdx) {
  const prevActive = activeSide;
  activeSide = side;
  await pushHistory();
  activeSide = prevActive;
  const st = side === 'left' ? stateL : stateR;
  window.Editor.reorderPages(st.pdfLibDoc, oldIdx, newIdx);
}

function enableButtons(hasFile) {
  ['btn-delete','btn-split','btn-auto-left','btn-auto-right','btn-auto-answer','btn-auto-all']
    .forEach(id => { $(id).disabled = !hasFile; });
}

async function saveActive() {
  const st = activeState();
  if (!st.pdfLibDoc) return;
  const sideName = activeSide === 'left' ? '왼쪽' : '오른쪽';
  if (!confirm(sideName + ' PDF를 저장하시겠습니까?')) return;
  const bytes = await st.pdfLibDoc.save();
  await window.electronAPI.saveFile(bytes, st.filename);
}

/* ── IPC (메뉴) ── */
window.electronAPI.onMenuOpen(openFile);
window.electronAPI.onMenuSave(saveActive);
window.electronAPI.onMenuUndo(undo);
window.electronAPI.onMenuRedo(redo);

/* ── 툴바 ── */
$('btn-open').addEventListener('click', openFile);

function setActiveSide(side) {
  activeSide = side;
  document.getElementById('viewer-panel-left').classList.toggle('active', side === 'left');
  document.getElementById('viewer-panel-right').classList.toggle('active', side === 'right');
}

$('btn-split-view').addEventListener('click', function() {
  splitMode = !splitMode;
  $('main-area').classList.toggle('split-mode', splitMode);
  $('btn-split-view').classList.toggle('active', splitMode);
  if (splitMode) {
    setActiveSide('left');
    document.getElementById('viewer-panel-left').classList.add('active');
  } else {
    document.getElementById('viewer-panel-left').classList.remove('active');
    document.getElementById('viewer-panel-right').classList.remove('active');
    activeSide = 'left';
  }
});

['viewer-panel-left', 'thumbnail-panel-left', 'viewer-canvas-wrap-left', 'thumbnail-list-left'].forEach(function(id) {
  document.getElementById(id).addEventListener('mousedown', function() {
    if (splitMode) setActiveSide('left');
  });
});
['viewer-panel-right', 'thumbnail-panel-right', 'viewer-canvas-wrap-right', 'thumbnail-list-right'].forEach(function(id) {
  document.getElementById(id).addEventListener('mousedown', function() {
    if (splitMode) setActiveSide('right');
  });
});

$('btn-save').addEventListener('click', saveActive);

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

/* ── 줌 슬라이더 ── */
$('zoom-slider').addEventListener('input', async function(e) {
  state.scale = Viewer.scaleFromSlider(Number(e.target.value));
  Viewer.updateZoomInfo($('viewer-zoom-info'), state.scale);
  if (state.pdfJsDoc) await Viewer.renderPage(state.pdfJsDoc, state.currentPage, $('viewer-canvas'), state.scale);
});

/* ── 뷰어 휠: Ctrl+휠=줌, 경계에서 페이지 이동 ── */
$('viewer-canvas-wrap').addEventListener('wheel', async function(e) {
  if (!state.pdfJsDoc) return;
  if (e.ctrlKey) {
    e.preventDefault();
    const slider = $('zoom-slider');
    const newVal = Math.max(50, Math.min(400, Number(slider.value) + (e.deltaY < 0 ? 10 : -10)));
    slider.value = newVal;
    state.scale  = newVal / 100;
    Viewer.updateZoomInfo($('viewer-zoom-info'), state.scale);
    await Viewer.renderPage(state.pdfJsDoc, state.currentPage, $('viewer-canvas'), state.scale);
    return;
  }
  const wrap    = $('viewer-canvas-wrap');
  const atTop   = wrap.scrollTop <= 0;
  const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1;
  if (e.deltaY < 0 && atTop && state.currentPage > 0) {
    e.preventDefault();
    await selectPage(state.currentPage - 1);
    Thumbnail.setSelected($('thumbnail-list'), state.currentPage);
    wrap.scrollTop = wrap.scrollHeight;
  } else if (e.deltaY > 0 && atBottom && state.currentPage < state.pdfJsDoc.numPages - 1) {
    e.preventDefault();
    await selectPage(state.currentPage + 1);
    Thumbnail.setSelected($('thumbnail-list'), state.currentPage);
    wrap.scrollTop = 0;
  }
}, { passive: false });

/* ── 뷰어 드래그 패닝 ── */
(function() {
  const wrap = $('viewer-canvas-wrap');
  let isDragging = false, startX, startY, scrollLeft, scrollTop;
  wrap.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX; startY = e.clientY;
    scrollLeft = wrap.scrollLeft; scrollTop = wrap.scrollTop;
    wrap.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    wrap.scrollLeft = scrollLeft - (e.clientX - startX);
    wrap.scrollTop  = scrollTop  - (e.clientY - startY);
  });
  document.addEventListener('mouseup', function() {
    if (!isDragging) return;
    isDragging = false;
    wrap.style.cursor = 'grab';
  });
  wrap.style.cursor = 'grab';
})();

/* ── 썸네일 패널 리사이저 ── */
(function() {
  const resizer = $('panel-resizer');
  const panel   = $('thumbnail-panel');
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
    const newWidth = Math.max(80, Math.min(window.innerWidth - 200, startWidth + e.clientX - startX));
    panel.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', function() {
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

/* ── 썸네일 줌 슬라이더 ── */
$('thumb-zoom-slider').addEventListener('input', function(e) {
  const size = e.target.value;
  $('thumbnail-list').style.setProperty('--thumb-size', size + 'px');
  $('thumb-zoom-label').textContent = size + 'px';
});

/* ── 키보드 단축키 ── */
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
  if (!state.pdfJsDoc) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (state.currentPage > 0) { selectPage(state.currentPage - 1); Thumbnail.setSelected($('thumbnail-list'), state.currentPage); }
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (state.currentPage < state.pdfJsDoc.numPages - 1) { selectPage(state.currentPage + 1); Thumbnail.setSelected($('thumbnail-list'), state.currentPage); }
  }
});

/* ── 드래그앤드롭으로 파일 열기 ── */
document.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
document.addEventListener('drop', async function(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
  await loadPdf(await file.arrayBuffer(), file.name);
});

/* ── 편집 버튼 ── */
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
  const merged   = await window.Editor.mergeDocuments([state.pdfLibDoc, doc2]);
  const newBytes = await merged.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  state.pdfJsDoc = pdfJsDoc; state.pdfLibDoc = pdfLibDoc;
  state.currentPage = 0; state.labels = {};
  $('thumbnail-count').textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, $('thumbnail-list'), state.labels, selectPage, handleReorder,
    function(pi, label) { state.labels[pi] = label; });
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

/* ── 자동화 버튼 ── */
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
