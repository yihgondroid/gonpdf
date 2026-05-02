// UI 바인딩 — 사이드 컨트롤, 리사이저, 분할뷰, 전체화면, 키보드, 드래그앤드롭

function bindSideControls(side) {
  const e = sideEls(side);

  e.btnPrev.addEventListener('click', function() {
    const st = sideState(side);
    if (st.currentPage > 0) selectPage(side, st.currentPage - 1);
  });
  e.btnNext.addEventListener('click', function() {
    const st = sideState(side);
    if (st.pdfJsDoc && st.currentPage < st.pdfJsDoc.numPages - 1) selectPage(side, st.currentPage + 1);
  });

  e.zoomSlider.addEventListener('input', function(ev) {
    const st = sideState(side);
    st.scale = window.Viewer.scaleFromSlider(Number(ev.target.value));
    window.Viewer.updateZoomInfo(e.zoomInfo, st.scale);
    if (!st.pdfJsDoc) return;
    clearTimeout(st._zoomTimer);
    st._zoomTimer = setTimeout(function() {
      window.Viewer.rerenderAllPages(e.viewerCanvasWrap, st.pdfJsDoc, st.scale);
    }, 120);
  });

  e.thumbZoomSlider.addEventListener('input', function(ev) {
    const size = ev.target.value;
    e.thumbnailList.style.setProperty('--thumb-size', size + 'px');
    e.thumbZoomLabel.textContent = size + 'px';
  });

  e.viewerCanvasWrap.addEventListener('wheel', function(ev) {
    const st = sideState(side);
    if (!st.pdfJsDoc) return;
    if (splitMode) setActiveSide(side);
    if (ev.ctrlKey) {
      ev.preventDefault();
      const newVal = Math.max(50, Math.min(400, Number(e.zoomSlider.value) + (ev.deltaY < 0 ? 10 : -10)));
      e.zoomSlider.value = newVal;
      st.scale = newVal / 100;
      window.Viewer.updateZoomInfo(e.zoomInfo, st.scale);
      clearTimeout(st._zoomTimer);
      st._zoomTimer = setTimeout(function() {
        window.Viewer.rerenderAllPages(e.viewerCanvasWrap, st.pdfJsDoc, st.scale);
      }, 120);
    }
  }, { passive: false });

  // 드래그 패닝 (ESC로 취소)
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
      const flipX = (splitMode && side === 'left') ? -1 : 1;
      wrap.scrollLeft = scrollLeft - flipX * (ev.clientX - startX);
      wrap.scrollTop  = scrollTop  - (ev.clientY - startY);
    });
    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      wrap.style.cursor = 'grab';
    });
    document.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape' && isDragging) {
        isDragging = false;
        wrap.scrollLeft = scrollLeft;
        wrap.scrollTop  = scrollTop;
        wrap.style.cursor = 'grab';
      }
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
    const wasDragging = resizer.classList.contains('dragging');
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (wasDragging) {
      fitViewerToWidth('left');
      if (splitMode) fitViewerToWidth('right');
    }
  });
}

bindSideControls('left');
bindSideControls('right');
bindResizer('panel-resizer-left',  'thumbnail-panel-left',  'right');
bindResizer('panel-resizer-right', 'thumbnail-panel-right', 'left');

// 분할뷰
$('btn-split-view').addEventListener('click', function() {
  splitMode = !splitMode;
  $('main-area').classList.toggle('split-mode', splitMode);
  document.body.classList.toggle('split-mode', splitMode);
  $('btn-split-view').classList.toggle('active', splitMode);
  renderTabBar('left');
  renderTabBar('right');
  if (splitMode) {
    setActiveSide('left');
    document.getElementById('viewer-panel-left').classList.add('active');
  } else {
    document.getElementById('viewer-panel-left').classList.remove('active');
    document.getElementById('viewer-panel-right').classList.remove('active');
    activeSide = 'left';
    tabsR.filter(function(t) { return t.pdfJsDoc !== null; })
         .forEach(function(t) { tabsL.push(t); });
    tabsR.length = 0;
    tabsR.push(createTab());
    activeTabR = 0;
    renderTabBar('left');
  }
});

// 활성 사이드 마우스다운 바인딩
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

// 전체화면
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

// 키보드 단축키
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
  if (e.key === 'Escape') {
    hideContextMenu();
    window.Thumbnail.clearSelection(sideEls('left').thumbnailList);
    if (splitMode) window.Thumbnail.clearSelection(sideEls('right').thumbnailList);
  }
  const st = activeState();
  if (!st.pdfJsDoc) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (st.currentPage > 0) selectPage(activeSide, st.currentPage - 1);
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (st.currentPage < st.pdfJsDoc.numPages - 1) selectPage(activeSide, st.currentPage + 1);
  }
});

// 드래그앤드롭으로 파일 열기
function getDropSide(target) {
  if (!splitMode) return 'left';
  const rPanel = document.getElementById('viewer-panel-right');
  const rThumb = document.getElementById('thumbnail-panel-right');
  return (rPanel.contains(target) || rThumb.contains(target)) ? 'right' : 'left';
}

// 창 크기 변경 시 뷰어 너비 맞춤
let _winResizeTimer;
window.addEventListener('resize', function() {
  clearTimeout(_winResizeTimer);
  _winResizeTimer = setTimeout(function() {
    fitViewerToWidth('left');
    if (splitMode) fitViewerToWidth('right');
  }, 150);
});

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
  const side = getDropSide(e.target);
  const files = Array.from(e.dataTransfer.files).filter(function(f) {
    return f.name.toLowerCase().endsWith('.pdf');
  });
  for (const file of files) {
    try {
      await loadPdf(side, await file.arrayBuffer(), file.name);
    } catch (err) {
      showError('드롭 파일 열기 실패: ' + err.message);
    }
  }
});
