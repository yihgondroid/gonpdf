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

async function setupContinuousViewer(side) {
  const st = side === 'left' ? stateL : stateR;
  const e  = sideEls(side);
  await Viewer.renderAllPages(st.pdfJsDoc, e.viewerCanvasWrap, st.scale, function(pi) {
    st.currentPage = pi;
    Viewer.updatePageInfo(e.pageInfo, pi, PdfLoader.getPageCount(st.pdfJsDoc));
  });
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
  await setupContinuousViewer(side);
  selectPage(side, st.currentPage);
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
  var placeholder = $('viewer-placeholder-' + side);
  if (placeholder) placeholder.classList.add('hidden');
  e.thumbnailCount.textContent = PdfLoader.getPageCount(pdfJsDoc) + ' 페이지';
  Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { st.labels[pi] = label; });
  await setupContinuousViewer(side);
  selectPage(side, 0);
  enableButtons(true);
}

function selectPage(side, pageIndex) {
  const st = side === 'left' ? stateL : stateR;
  const e  = sideEls(side);
  st.currentPage = pageIndex;
  Viewer.scrollToPage(e.viewerCanvasWrap, pageIndex);
  Viewer.updatePageInfo(e.pageInfo, pageIndex, PdfLoader.getPageCount(st.pdfJsDoc));
  Thumbnail.setSelected(e.thumbnailList, pageIndex);
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
  await setupContinuousViewer(side);
  selectPage(side, st.currentPage);
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
  ['btn-delete','btn-split','btn-auto-classify','btn-auto-split','btn-auto-left','btn-auto-right','btn-auto-answer','btn-auto-all']
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
    if (st.currentPage > 0) selectPage(side, st.currentPage - 1);
  });
  e.btnNext.addEventListener('click', function() {
    if (st.pdfJsDoc && st.currentPage < st.pdfJsDoc.numPages - 1) selectPage(side, st.currentPage + 1);
  });

  e.zoomSlider.addEventListener('input', function(ev) {
    st.scale = Viewer.scaleFromSlider(Number(ev.target.value));
    Viewer.updateZoomInfo(e.zoomInfo, st.scale);
    if (!st.pdfJsDoc) return;
    clearTimeout(st._zoomTimer);
    st._zoomTimer = setTimeout(function() {
      Viewer.rerenderAllPages(e.viewerCanvasWrap, st.pdfJsDoc, st.scale);
    }, 120);
  });

  e.thumbZoomSlider.addEventListener('input', function(ev) {
    const size = ev.target.value;
    e.thumbnailList.style.setProperty('--thumb-size', size + 'px');
    e.thumbZoomLabel.textContent = size + 'px';
  });

  e.viewerCanvasWrap.addEventListener('wheel', function(ev) {
    if (!st.pdfJsDoc) return;
    if (splitMode) setActiveSide(side);
    if (ev.ctrlKey) {
      ev.preventDefault();
      const newVal = Math.max(50, Math.min(400, Number(e.zoomSlider.value) + (ev.deltaY < 0 ? 10 : -10)));
      e.zoomSlider.value = newVal;
      st.scale = newVal / 100;
      Viewer.updateZoomInfo(e.zoomInfo, st.scale);
      clearTimeout(st._zoomTimer);
      st._zoomTimer = setTimeout(function() {
        Viewer.rerenderAllPages(e.viewerCanvasWrap, st.pdfJsDoc, st.scale);
      }, 120);
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

/* ── 전체화면 ── */
$('btn-fullscreen').addEventListener('click', function() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', function() {
  const fs = !!document.fullscreenElement;
  document.body.classList.toggle('fullscreen-mode', fs);
  $('btn-fullscreen').classList.toggle('active', fs);
  $('btn-fullscreen').textContent = fs ? '⛶ 창모드' : '⛶ 전체화면';
  if (fs) {
    const toast = $('fullscreen-toast');
    toast.classList.add('visible');
    setTimeout(function() { toast.classList.remove('visible'); }, 2000);
  }
});

/* ── 키보드 단축키 ── */
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
  const st = activeState();
  if (!st.pdfJsDoc) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (st.currentPage > 0) selectPage(activeSide, st.currentPage - 1);
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (st.currentPage < st.pdfJsDoc.numPages - 1) selectPage(activeSide, st.currentPage + 1);
  }
});

/* ── 드래그앤드롭으로 파일 열기 ── */
function getDropSide(target) {
  if (!splitMode) return 'left';
  const rPanel = document.getElementById('viewer-panel-right');
  const rThumb = document.getElementById('thumbnail-panel-right');
  return (rPanel.contains(target) || rThumb.contains(target)) ? 'right' : 'left';
}

let _dropHighlight = null;
document.addEventListener('dragover', function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  if (splitMode) {
    const side = getDropSide(e.target);
    if (side !== _dropHighlight) {
      _dropHighlight = side;
      document.getElementById('viewer-panel-left').classList.toggle('drop-target', side === 'left');
      document.getElementById('viewer-panel-right').classList.toggle('drop-target', side === 'right');
    }
  }
});
document.addEventListener('dragleave', function(e) {
  if (!e.relatedTarget) {
    _dropHighlight = null;
    document.getElementById('viewer-panel-left').classList.remove('drop-target');
    document.getElementById('viewer-panel-right').classList.remove('drop-target');
  }
});
document.addEventListener('drop', async function(e) {
  e.preventDefault();
  _dropHighlight = null;
  document.getElementById('viewer-panel-left').classList.remove('drop-target');
  document.getElementById('viewer-panel-right').classList.remove('drop-target');
  const file = e.dataTransfer.files[0];
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;
  const side = getDropSide(e.target);
  await loadPdf(side, await file.arrayBuffer(), file.name);
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
  await setupContinuousViewer(side);
  selectPage(side, 0);
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

/* ── 자동분류 ── */
$('btn-auto-classify').addEventListener('click', async function() {
  const side = activeSide;
  const st = activeState();
  const e = sideEls(side);
  if (!st.pdfJsDoc) return;

  $('btn-auto-classify').disabled = true;
  $('btn-auto-classify').textContent = '⏳ 분류 중...';
  $('status-info').textContent = '자동분류 중...';

  const ANSWER_KEYWORDS = ['정답', '해설', '풀이'];
  const pageCount = st.pdfJsDoc.numPages;

  const pageData = [];
  for (let i = 0; i < pageCount; i++) {
    const page = await st.pdfJsDoc.getPage(i + 1);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(function(item) { return item.str; }).join('');
    let score = 0;
    ANSWER_KEYWORDS.forEach(function(kw) {
      const m = text.match(new RegExp(kw, 'g'));
      if (m) score += m.length;
    });
    pageData.push({ len: text.length, score: score });
  }

  const avgLen = pageData.reduce(function(s, d) { return s + d.len; }, 0) / pageCount;
  const otherThreshold = Math.max(50, avgLen * 0.15);

  let countQ = 0, countA = 0, countO = 0;
  for (let i = 0; i < pageCount; i++) {
    const { len, score } = pageData[i];
    if (len < otherThreshold) {
      st.labels[i] = 'other'; countO++;
    } else if (score >= 3) {
      st.labels[i] = 'answer'; countA++;
    } else {
      st.labels[i] = 'question'; countQ++;
    }
  }

  Thumbnail.updateAllBadges(e.thumbnailList, st.labels);
  $('btn-auto-classify').disabled = false;
  $('btn-auto-classify').textContent = '🤖 자동분류';

  if (avgLen < 10) {
    $('status-info').textContent = '텍스트를 인식할 수 없음 (스캔 PDF는 수동분류 필요)';
  } else {
    $('status-info').textContent = '자동분류 완료 — 문제 ' + countQ + '쪽 / 해설 ' + countA + '쪽 / 기타 ' + countO + '쪽';
  }
});

/* ── 자동화 버튼 ── */
async function saveDoc(doc, defaultName) {
  const bytes = await doc.save();
  await window.electronAPI.saveFile(bytes, defaultName);
}

function baseFilename(st) {
  return (st.filename || 'output').replace(/\.pdf$/i, '');
}

$('btn-auto-split').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  const files = [];
  const qDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'question');
  files.push({ name: base + '_문제.pdf', buffer: await qDoc.save() });
  try {
    const aDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
    files.push({ name: base + '_해설.pdf', buffer: await aDoc.save() });
  } catch (e) { /* 해설 미분류 시 문제만 저장 */ }
  await window.electronAPI.saveFiles(files);
  $('status-info').textContent = '저장 완료: ' + files.map(function(f) { return f.name; }).join(', ');
});

$('btn-auto-left').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  const files = [];
  const qDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'left');
  files.push({ name: base + '_문제.pdf', buffer: await qDoc.save() });
  try {
    const aDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
    files.push({ name: base + '_해설.pdf', buffer: await aDoc.save() });
  } catch (e) { /* 해설 미분류 시 문제만 저장 */ }
  await window.electronAPI.saveFiles(files);
  $('status-info').textContent = '저장 완료: ' + files.map(function(f) { return f.name; }).join(', ');
});

$('btn-auto-right').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  const files = [];
  const qDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'right');
  files.push({ name: base + '_문제.pdf', buffer: await qDoc.save() });
  try {
    const aDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
    files.push({ name: base + '_해설.pdf', buffer: await aDoc.save() });
  } catch (e) { /* 해설 미분류 시 문제만 저장 */ }
  await window.electronAPI.saveFiles(files);
  $('status-info').textContent = '저장 완료: ' + files.map(function(f) { return f.name; }).join(', ');
});

$('btn-auto-answer').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
  await saveDoc(doc, base + '_해설.pdf');
  $('status-info').textContent = base + '_해설.pdf 저장 완료';
});

$('btn-auto-all').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  $('status-info').textContent = '전체 분리 처리 중...';
  const outputs = await window.Automation.runAutomationAll(st.pdfLibDoc, st.labels);
  const suffixes = ['_문제_좌', '_문제_우', '_해설'];
  const files = [];
  for (let i = 0; i < outputs.length; i++) {
    files.push({ name: base + suffixes[i] + '.pdf', buffer: await outputs[i].doc.save() });
  }
  await window.electronAPI.saveFiles(files);
  $('status-info').textContent = '전체 분리 저장 완료 (파일 3개)';
});
