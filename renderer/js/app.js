// 진입점 — IPC, 툴바, 종료 처리

window.electronAPI.onMenuOpen(openFile);
window.electronAPI.onMenuSave(saveActive);
window.electronAPI.onMenuUndo(undo);
window.electronAPI.onMenuRedo(redo);

$('btn-open').addEventListener('click', openFile);
$('btn-save').addEventListener('click', saveActive);

$('btn-delete').addEventListener('click', async function() {
  const st = activeState();
  if (!st.pdfLibDoc || st.pdfJsDoc.numPages <= 1) return;
  try {
    await pushHistory();
    window.Editor.deletePage(st.pdfLibDoc, st.currentPage);
    await reloadPdf();
  } catch (err) {
    showError('페이지 삭제 실패: ' + err.message);
  }
});

async function imageToPdfBuffer(buffer) {
  const blob = new Blob([buffer]);
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise(function(resolve, reject) {
      const im = new Image();
      im.onload = function() { resolve(im); };
      im.onerror = reject;
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const pngBuf = await new Promise(function(resolve) {
      canvas.toBlob(function(b) { b.arrayBuffer().then(resolve); }, 'image/png');
    });
    const pdfDoc = await PDFLib.PDFDocument.create();
    const pngImg = await pdfDoc.embedPng(pngBuf);
    const page = pdfDoc.addPage([pngImg.width, pngImg.height]);
    page.drawImage(pngImg, { x: 0, y: 0, width: pngImg.width, height: pngImg.height });
    const bytes = await pdfDoc.save();
    return bytes.buffer;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const IMAGE_EXTS = /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i;

$('btn-merge').addEventListener('click', async function() {
  const targetSide = activeSide;
  try {
    const ordered = await showMergeOrderDialog();
    if (!ordered || ordered.length === 0) return;
    const docs = [];
    for (const f of ordered) {
      const buf = IMAGE_EXTS.test(f.name) ? await imageToPdfBuffer(f.buffer) : f.buffer;
      const { pdfJsDoc: tmpDoc, pdfLibDoc } = await window.PdfLoader.loadPdf(buf);
      tmpDoc.destroy();
      docs.push(pdfLibDoc);
    }
    const merged   = await window.Editor.mergeDocuments(docs);
    const newBytes = await merged.save();
    await loadPdf(targetSide, newBytes.buffer, 'merged.pdf');
    $('status-info').textContent = '합치기 완료 (' + merged.getPageCount() + ' 페이지)';
  } catch (err) {
    showError('합치기 실패: ' + err.message);
  }
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
  try {
    const splitDoc = await window.Editor.splitDocument(st.pdfLibDoc, start, count);
    const bytes = await splitDoc.save();
    await window.electronAPI.saveFile(bytes, 'split_p' + (start + 1) + '-' + (start + count) + '.pdf');
    $('status-info').textContent = '나누기 저장 완료 (' + count + ' 페이지)';
  } catch (err) {
    showError('나누기 실패: ' + err.message);
  }
});

// 앱 종료 처리
window.electronAPI.onWillClose(async function() {
  const allTabs = [
    ...tabsL.map(function(t, i) { return { tab: t, side: 'left', idx: i }; }),
    ...tabsR.map(function(t, i) { return { tab: t, side: 'right', idx: i }; }),
  ].filter(function(e) { return e.tab.pdfJsDoc && e.tab.dirty; });

  for (const entry of allTabs) {
    const result = await showConfirmDialog(entry.tab.filename || '새 파일');
    if (result === 2) return;
    if (result === 0) {
      try {
        const bytes = await entry.tab.pdfLibDoc.save();
        const saved = await window.electronAPI.saveFileFromClose(bytes, entry.tab.filename);
        if (!saved) return;
        entry.tab.dirty = false;
        renderTabBar(entry.side);
      } catch (err) {
        showError('저장 실패: ' + err.message);
        return;
      }
    }
  }

  window.electronAPI.closeApp();
});

initTabSortable();
