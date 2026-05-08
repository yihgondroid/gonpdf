// PDF 로드 / 저장 / 렌더링

async function fitViewerToWidth(side) {
  const st = sideState(side);
  if (!st.pdfJsDoc) return;
  const e = sideEls(side);
  try {
    const page = await st.pdfJsDoc.getPage(1);
    const naturalW = page.getViewport({ scale: 1.0 }).width;
    const availW = e.viewerCanvasWrap.clientWidth - 32;
    if (availW <= 0 || naturalW <= 0) return;
    const newScale = availW / naturalW;
    st.scale = newScale;
    e.zoomSlider.value = Math.max(50, Math.min(400, Math.round(newScale * 100)));
    window.Viewer.updateZoomInfo(e.zoomInfo, newScale);
    clearTimeout(st._zoomTimer);
    st._zoomTimer = setTimeout(function() {
      window.Viewer.rerenderAllPages(e.viewerCanvasWrap, st.pdfJsDoc, newScale);
    }, 120);
  } catch (_) {}
}

async function setupContinuousViewer(side) {
  const st = sideState(side);
  const e  = sideEls(side);
  await window.Viewer.renderAllPages(st.pdfJsDoc, e.viewerCanvasWrap, st.scale, function(pi) {
    st.currentPage = pi;
    window.Viewer.updatePageInfo(e.pageInfo, pi, window.PdfLoader.getPageCount(st.pdfJsDoc));
  });
}

function selectPage(side, pageIndex) {
  const st = sideState(side);
  const e  = sideEls(side);
  st.currentPage = pageIndex;
  window.Viewer.scrollToPage(e.viewerCanvasWrap, pageIndex);
  window.Viewer.updatePageInfo(e.pageInfo, pageIndex, window.PdfLoader.getPageCount(st.pdfJsDoc));
  window.Thumbnail.setSelected(e.thumbnailList, pageIndex);
}

async function loadPdf(side, buffer, name, filePath) {
  const tabs = side === 'left' ? tabsL : tabsR;
  let idx = side === 'left' ? activeTabL : activeTabR;

  if (tabs[idx].pdfJsDoc !== null) {
    tabs.push(createTab());
    idx = tabs.length - 1;
    if (side === 'left') activeTabL = idx;
    else activeTabR = idx;
  }

  const tab = tabs[idx];
  const e   = sideEls(side);

  try {
    const { pdfJsDoc, pdfLibDoc } = await window.PdfLoader.loadPdf(buffer);
    tab.pdfJsDoc         = pdfJsDoc;
    tab.pdfLibDoc        = pdfLibDoc;
    tab.currentPage      = 0;
    tab.labels           = {};
    tab.filename         = name;
    tab.undoStack.length = 0;
    tab.redoStack.length = 0;
    tab.dirty            = false;
    tab.classified       = false;

    // 뷰어 너비에 맞춰 초기 스케일 결정
    try {
      const firstPage = await pdfJsDoc.getPage(1);
      const naturalW = firstPage.getViewport({ scale: 1.0 }).width;
      const availW = e.viewerCanvasWrap.clientWidth - 32;
      if (availW > 0 && naturalW > 0) {
        tab.scale = availW / naturalW;
        e.zoomSlider.value = Math.max(50, Math.min(400, Math.round(tab.scale * 100)));
        window.Viewer.updateZoomInfo(e.zoomInfo, tab.scale);
      }
    } catch (_) {}

    const isScanned = await window.Viewer.isScannedPDF(pdfJsDoc);

    $('status-filename').textContent = name;
    const placeholder = $('viewer-placeholder-' + side);
    if (placeholder) placeholder.classList.add('hidden');
    e.thumbnailCount.textContent = window.PdfLoader.getPageCount(pdfJsDoc) + ' 페이지';

    if (isScanned) {
      window.Thumbnail.initContainer(
        e.thumbnailList,
        (oi, ni) => handleReorder(side, oi, ni),
        handleCrossReorder
      );
      await window.Viewer.renderAllPagesInterleaved(
        pdfJsDoc, e.viewerCanvasWrap, tab.scale,
        function(pi) {
          tab.currentPage = pi;
          window.Viewer.updatePageInfo(e.pageInfo, pi, window.PdfLoader.getPageCount(pdfJsDoc));
        },
        function(i) {
          return window.Thumbnail.addOneThumbnail(
            pdfJsDoc, e.thumbnailList, i,
            tab.labels[i],
            (pi) => selectPage(side, pi),
            (pi, label) => { tab.labels[pi] = label; }
          );
        }
      );
    } else {
      window.Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, tab.labels,
        (pi) => selectPage(side, pi),
        (oi, ni) => handleReorder(side, oi, ni),
        (pi, label) => { tab.labels[pi] = label; },
        handleCrossReorder);
      await setupContinuousViewer(side);
    }
    selectPage(side, 0);
    enableButtons(true, false);
    renderTabBar(side);
  } catch (err) {
    // 로드 실패 시 탭 롤백
    tabs.splice(idx, 1);
    if (tabs.length === 0) tabs.push(createTab());
    if (side === 'left') activeTabL = Math.min(activeTabL, tabs.length - 1);
    else activeTabR = Math.min(activeTabR, tabs.length - 1);
    showError('PDF를 열 수 없습니다: ' + (err.message || '손상된 파일'));
  }
}

async function openFile() {
  try {
    const result = await window.electronAPI.openFile();
    if (!result) return;
    await loadPdf(activeSide, result.buffer, result.name, result.filePath);
  } catch (err) {
    showError('파일 열기 실패: ' + err.message);
  }
}

async function saveActive(skipConfirm) {
  const st = activeState();
  if (!st.pdfLibDoc) return false;
  if (!skipConfirm) {
    const sideName = activeSide === 'left' ? '왼쪽' : '오른쪽';
    if (!confirm(sideName + ' PDF를 저장하시겠습니까?')) return false;
  }
  try {
    const bytes = await st.pdfLibDoc.save();
    const saved = await window.electronAPI.saveFile(bytes, st.filename);
    if (saved) {
      st.dirty = false;
      renderTabBar(activeSide);
      showSaveToast('✅ 저장 완료');
    }
    return saved;
  } catch (err) {
    showError('저장 실패: ' + err.message);
    return false;
  }
}

async function reloadSide(side) {
  const st = sideState(side);
  const e  = sideEls(side);
  try {
    const newBytes = await st.pdfLibDoc.save();
    const { pdfJsDoc, pdfLibDoc } = await window.PdfLoader.loadPdf(newBytes.buffer);
    st.pdfJsDoc    = pdfJsDoc;
    st.pdfLibDoc   = pdfLibDoc;
    st.currentPage = Math.min(st.currentPage, pdfJsDoc.numPages - 1);
    e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
    window.Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
      (pi) => selectPage(side, pi),
      (oi, ni) => handleReorder(side, oi, ni),
      (pi, label) => { st.labels[pi] = label; },
      handleCrossReorder);
    await setupContinuousViewer(side);
    selectPage(side, st.currentPage);
  } catch (err) {
    showError('PDF 새로고침 실패: ' + err.message);
  }
}

async function reloadPdf() {
  await reloadSide(activeSide);
}

async function handleReorder(side, oldIdx, newIdx) {
  const prevActive = activeSide;
  activeSide = side;
  await pushHistory();
  activeSide = prevActive;
  const st = sideState(side);
  window.Editor.reorderPages(st.pdfLibDoc, oldIdx, newIdx);
}

async function handleCrossReorder(fromContainer, toContainer, indices, toIndex) {
  const fromSide = fromContainer === sideEls('left').thumbnailList ? 'left' : 'right';
  const toSide   = fromSide === 'left' ? 'right' : 'left';
  const srcSt    = sideState(fromSide);
  const dstSt    = sideState(toSide);

  if (!srcSt.pdfLibDoc || !dstSt.pdfLibDoc) return;
  if (indices.length >= srcSt.pdfJsDoc.numPages) {
    showError('모든 페이지를 이동할 수 없습니다.');
    await reloadSide(fromSide);
    return;
  }

  try {
    const prevActive = activeSide;
    activeSide = fromSide; await pushHistory();
    activeSide = toSide;   await pushHistory();
    activeSide = prevActive;

    const movedLabels = indices.map(function(i) { return srcSt.labels[i]; });
    const removedSet  = new Set(indices);
    const copiedPages = await dstSt.pdfLibDoc.copyPages(srcSt.pdfLibDoc, indices);
    const srcPages    = srcSt.pdfLibDoc.getPages();
    const remaining   = srcPages.filter(function(_, i) { return !removedSet.has(i); });
    for (let i = srcPages.length - 1; i >= 0; i--) srcSt.pdfLibDoc.removePage(i);
    remaining.forEach(function(p) { srcSt.pdfLibDoc.addPage(p); });

    srcSt.labels = remapLabelsAfterRemove(srcSt.labels, removedSet, srcPages.length);

    const dstPages = dstSt.pdfLibDoc.getPages();
    const count    = copiedPages.length;
    const totalNew = dstPages.length + count;
    for (let i = dstPages.length - 1; i >= 0; i--) dstSt.pdfLibDoc.removePage(i);

    let ci = 0, di = 0;
    for (let i = 0; i < totalNew; i++) {
      if (i >= toIndex && ci < count) dstSt.pdfLibDoc.addPage(copiedPages[ci++]);
      else                             dstSt.pdfLibDoc.addPage(dstPages[di++]);
    }

    const newDstLabels = {};
    Object.keys(dstSt.labels).forEach(function(idx) {
      const n = Number(idx);
      newDstLabels[n >= toIndex ? n + count : n] = dstSt.labels[idx];
    });
    movedLabels.forEach(function(label, i) {
      if (label !== undefined) newDstLabels[toIndex + i] = label;
    });
    dstSt.labels = newDstLabels;

    await reloadSide(fromSide);
    await reloadSide(toSide);
  } catch (err) {
    showError('페이지 이동 실패: ' + err.message);
    try { await reloadSide(fromSide); } catch (_) {}
    try { await reloadSide(toSide);   } catch (_) {}
  }
}
