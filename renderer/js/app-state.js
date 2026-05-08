// 공유 상태 및 헬퍼

function createTab() {
  return {
    pdfJsDoc: null, pdfLibDoc: null, pdfUrl: null, currentPage: 0,
    scale: 1.0, labels: {}, filename: '', undoStack: [], redoStack: [], dirty: false,
    classified: false
  };
}

// 페이지 제거 후 레이블 인덱스 재매핑
function remapLabelsAfterRemove(labels, removedSet, totalPages) {
  const newLabels = {};
  let shift = 0;
  for (let i = 0; i < totalPages; i++) {
    if (removedSet.has(i)) { shift++; continue; }
    if (labels[i] !== undefined) newLabels[i - shift] = labels[i];
  }
  return newLabels;
}

const tabsL = [createTab()];
const tabsR = [createTab()];
let activeTabL = 0;
let activeTabR = 0;
let activeSide = 'left';
let splitMode  = false;

function $(id) { return document.getElementById(id); }

function sideState(side) {
  return side === 'left' ? tabsL[activeTabL] : tabsR[activeTabR];
}
function activeState() { return sideState(activeSide); }
function activeUndo()  { return activeState().undoStack; }
function activeRedo()  { return activeState().redoStack; }

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

function enableButtons(hasFile, classified) {
  ['btn-delete', 'btn-auto-classify']
    .forEach(function(id) { $(id).disabled = !hasFile; });
  ['btn-auto-split','btn-auto-left','btn-auto-right','btn-auto-answer']
    .forEach(function(id) { $(id).disabled = !hasFile || !classified; });
}

function setActiveSide(side) {
  activeSide = side;
  document.getElementById('viewer-panel-left').classList.toggle('active', side === 'left');
  document.getElementById('viewer-panel-right').classList.toggle('active', side === 'right');
}

function showError(msg) {
  $('status-info').textContent = '⚠ ' + msg;
  console.error('[PDF Editor]', msg);
}
