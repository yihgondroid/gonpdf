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

function bindSideControls(side) {
  const e = sideEls(side);
  const st = side === 'left' ? stateL : stateR;

  e.btnPrev.addEventListener('click', function() {
    if (st.currentPage > 0) {
      Thumbnail.setSelected(e.thumbnailList, st.currentPage - 1);
      selectPage(side, st.currentPage - 1);
    }
  });
  e.btnNext.addEventListener('click', function() {
    if (st.pdfJsDoc && st.currentPage < st.pdfJsDoc.numPages - 1) {
      Thumbnail.setSelected(e.thumbnailList, st.currentPage + 1);
      selectPage(side, st.currentPage + 1);
    }
  });

  e.zoomSlider.addEventListener('input', async function(ev) {
    st.scale = Viewer.scaleFromSlider(Number(ev.target.value));
    Viewer.updateZoomInfo(e.zoomInfo, st.scale);
    if (st.pdfJsDoc) await Viewer.renderPage(st.pdfJsDoc, st.currentPage, e.viewerCanvas, st.scale);
  });

  e.thumbZoomSlider.addEventListener('input', function(ev) {
    const size = ev.target.value;
    e.thumbnailList.style.setProperty('--thumb-size', size + 'px');
    e.thumbZoomLabel.textContent = size + 'px';
  });

  e.viewerCanvasWrap.addEventListener('wheel', async function(ev) {
    if (!st.pdfJsDoc) return;
    if (splitMode) setActiveSide(side);
    if (ev.ctrlKey) {
      ev.preventDefault();
      const newVal = Math.max(50, Math.min(400, Number(e.zoomSlider.value) + (ev.deltaY < 0 ? 10 : -10)));
      e.zoomSlider.value = newVal;
      st.scale = newVal / 100;
      Viewer.updateZoomInfo(e.zoomInfo, st.scale);
      await Viewer.renderPage(st.pdfJsDoc, st.currentPage, e.viewerCanvas, st.scale);
      return;
    }
    const atTop    = e.viewerCanvasWrap.scrollTop <= 0;
    const atBottom = e.viewerCanvasWrap.scrollTop + e.viewerCanvasWrap.clientHeight >= e.viewerCanvasWrap.scrollHeight - 1;
    if (ev.deltaY < 0 && atTop && st.currentPage > 0) {
      ev.preventDefault();
      await selectPage(side, st.currentPage - 1);
      Thumbnail.setSelected(e.thumbnailList, st.currentPage);
      e.viewerCanvasWrap.scrollTop = e.viewerCanvasWrap.scrollHeight;
    } else if (ev.deltaY > 0 && atBottom && st.currentPage < st.pdfJsDoc.numPages - 1) {
      ev.preventDefault();
      await selectPage(side, st.currentPage + 1);
      Thumbnail.setSelected(e.thumbnailList, st.currentPage);
      e.viewerCanvasWrap.scrollTop = 0;
    }
  }, { passive: false });

  (function() {
    const wrap = e.viewerCanvasWrap;
    let isDragging = false, startX, startY, scrollLeft, scrollTop;
    wrap.addEventListener('mousedown', function(ev) {
      if (ev.button !== 0) return;
      isDragging = true;
      startX = ev.clientX; startY = ev.clientY;
      scrollLeft = wrap.scrollLeft; scrollTop = wrap.scrollTop;
      wrap.style.cursor = 'grabbing';
      ev.preventDefault();
    });
    document.addEventListener('mousemove', function(ev) {
      if (!isDragging) return;
      wrap.scrollLeft = scrollLeft - (ev.clientX - startX);
      wrap.scrollTop  = scrollTop  - (ev.clientY - startY);
    });
    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      wrap.style.cursor = 'grab';
    });
  })();
}

function bindResizer(resizerId, panelId, direction) {
  const resizer = $(resizerId);
  const panel   = $(panelId);
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
    const delta = direction === 'right' ? e.clientX - startX : startX - e.clientX;
    const newWidth = Math.max(80, Math.min(window.innerWidth - 200, startWidth + delta));
    panel.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', function() {
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

bindSideControls('left');
bindSideControls('right');
bindResizer('panel-resizer-left',  'thumbnail-panel-left',  'right');
bindResizer('panel-resizer-right', 'thumbnail-panel-right', 'left');

/* ── 키보드 단축키 ── */
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
  const st = activeState();
  const e2 = sideEls();
  if (!st.pdfJsDoc) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (st.currentPage > 0) { selectPage(activeSide, st.currentPage - 1); Thumbnail.setSelected(e2.thumbnailList, st.currentPage); }
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (st.currentPage < st.pdfJsDoc.numPages - 1) { selectPage(activeSide, st.currentPage + 1); Thumbnail.setSelected(e2.thumbnailList, st.currentPage); }
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
  await loadPdf(activeSide, await file.arrayBuffer(), file.name);
});

/* ── 편집 버튼 ── */
$('btn-delete').addEventListener('click', async function() {
  const st = activeState();
  if (!st.pdfLibDoc || st.pdfJsDoc.numPages <= 1) return;
  await pushHistory();
  window.Editor.deletePage(st.pdfLibDoc, st.currentPage);
  await reloadPdf();
});

$('btn-merge').addEventListener('click', async function() {
  const st   = activeState();
  const side = activeSide;
  const e    = sideEls(side);
  const result = await window.electronAPI.openFile();
  if (!result) return;
  await pushHistory();
  const { pdfLibDoc: doc2 } = await PdfLoader.loadPdf(result.buffer);
  const merged   = await window.Editor.mergeDocuments([st.pdfLibDoc, doc2]);
  const newBytes = await merged.save();
  const { pdfJsDoc, pdfLibDoc } = await PdfLoader.loadPdf(newBytes.buffer);
  st.pdfJsDoc = pdfJsDoc; st.pdfLibDoc = pdfLibDoc;
  st.currentPage = 0; st.labels = {};
  e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  await selectPage(side, 0);
  $('status-info').textContent = '합치기 완료 (' + pdfJsDoc.numPages + ' 페이지)';
});

$('btn-split').addEventListener('click', async function() {
  const st = activeState();
  if (!st.pdfLibDoc) return;
  const total = st.pdfJsDoc.numPages;
  const input = prompt('나누기: 시작-끝 페이지 입력 (예: 1-3, 전체 ' + total + '페이지)');
  if (!input) return;
  const parts = input.split('-');
  const start = parseInt(parts[0], 10) - 1;
  const count = parseInt(parts[1], 10) - start;
  if (isNaN(start) || isNaN(count) || count <= 0) return;
  const splitDoc = await window.Editor.splitDocument(st.pdfLibDoc, start, count);
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
  const st = activeState();
  const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'left');
  await saveDoc(doc, '문제_좌.pdf');
  $('status-info').textContent = '문제_좌.pdf 저장 완료';
});

$('btn-auto-right').addEventListener('click', async function() {
  const st = activeState();
  const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'right');
  await saveDoc(doc, '문제_우.pdf');
  $('status-info').textContent = '문제_우.pdf 저장 완료';
});

$('btn-auto-answer').addEventListener('click', async function() {
  const st = activeState();
  const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
  await saveDoc(doc, '해설.pdf');
  $('status-info').textContent = '해설.pdf 저장 완료';
});

$('btn-auto-all').addEventListener('click', async function() {
  const st = activeState();
  $('status-info').textContent = '전체 분리 처리 중...';
  const outputs = await window.Automation.runAutomationAll(st.pdfLibDoc, st.labels);
  const files = [];
  for (let i = 0; i < outputs.length; i++) {
    files.push({ name: outputs[i].name, buffer: await outputs[i].doc.save() });
  }
  await window.electronAPI.saveFiles(files);
  $('status-info').textContent = '전체 분리 저장 완료 (파일 3개)';
});
