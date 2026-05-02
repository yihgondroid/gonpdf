// 히스토리 (실행취소 / 다시실행)

const MAX_HISTORY = 20;

async function pushHistory() {
  const st = activeState();
  if (!st.pdfLibDoc) return;
  try {
    const bytes = await st.pdfLibDoc.save();
    activeUndo().push(bytes);
    if (activeUndo().length > MAX_HISTORY) activeUndo().shift();
    activeRedo().length = 0;
    st.dirty = true;
    renderTabBar(activeSide);
  } catch (err) {
    showError('히스토리 저장 실패: ' + err.message);
  }
}

async function restoreFromBytes(saved, side) {
  const st = sideState(side);
  const e  = sideEls(side);
  try {
    const ab = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength);
    const { pdfJsDoc, pdfLibDoc } = await window.PdfLoader.loadPdf(ab);
    st.pdfJsDoc    = pdfJsDoc;
    st.pdfLibDoc   = pdfLibDoc;
    st.currentPage = Math.min(st.currentPage, pdfJsDoc.numPages - 1);
    st.labels      = {};
    e.thumbnailCount.textContent = pdfJsDoc.numPages + ' 페이지';
    window.Thumbnail.renderThumbnails(pdfJsDoc, e.thumbnailList, st.labels,
      (pi) => selectPage(side, pi),
      (oi, ni) => handleReorder(side, oi, ni),
      (pi, label) => { st.labels[pi] = label; },
      handleCrossReorder);
    await setupContinuousViewer(side);
    selectPage(side, st.currentPage);
  } catch (err) {
    showError('PDF 복원 실패: ' + err.message);
  }
}

async function undo() {
  const undoStack = activeUndo();
  const redoStack = activeRedo();
  if (undoStack.length === 0) return;
  try {
    const current = await activeState().pdfLibDoc.save();
    redoStack.push(current);
    await restoreFromBytes(undoStack.pop(), activeSide);
  } catch (err) {
    showError('실행취소 실패: ' + err.message);
  }
}

async function redo() {
  const undoStack = activeUndo();
  const redoStack = activeRedo();
  if (redoStack.length === 0) return;
  try {
    const current = await activeState().pdfLibDoc.save();
    undoStack.push(current);
    await restoreFromBytes(redoStack.pop(), activeSide);
  } catch (err) {
    showError('다시실행 실패: ' + err.message);
  }
}
