// 클립보드 & 컨텍스트 메뉴

window.pageClipboard = null;
let _ctxSide = null;
let _ctxPageIndex = null;

async function cutPagesSide(side) {
  const st = sideState(side);
  if (!st.pdfLibDoc) return;
  const e = sideEls(side);
  const indices = window.Thumbnail.getSelectedIndices(e.thumbnailList);
  if (indices.length === 0) return;
  if (indices.length >= st.pdfJsDoc.numPages) {
    showError('모든 페이지를 잘라낼 수 없습니다.');
    return;
  }

  try {
    const tempDoc = await PDFLib.PDFDocument.create();
    const copied = await tempDoc.copyPages(st.pdfLibDoc, indices);
    copied.forEach(function(p) { tempDoc.addPage(p); });
    window.pageClipboard = { type: 'cut', tempDoc: tempDoc, count: indices.length };

    const prevActive = activeSide;
    activeSide = side;
    await pushHistory();
    activeSide = prevActive;

    const removedSet = new Set(indices);
    const pages = st.pdfLibDoc.getPages();
    const remaining = pages.filter(function(_, i) { return !removedSet.has(i); });
    for (let i = pages.length - 1; i >= 0; i--) st.pdfLibDoc.removePage(i);
    remaining.forEach(function(p) { st.pdfLibDoc.addPage(p); });

    st.labels = remapLabelsAfterRemove(st.labels, removedSet, pages.length);

    await reloadSide(side);
    $('status-info').textContent = indices.length + '페이지 잘라냄';
  } catch (err) {
    showError('잘라내기 실패: ' + err.message);
  }
}

async function deletePagesSide(side) {
  const st = sideState(side);
  if (!st.pdfLibDoc) return;
  const e = sideEls(side);
  const indices = window.Thumbnail.getSelectedIndices(e.thumbnailList);
  if (indices.length === 0) return;
  if (indices.length >= st.pdfJsDoc.numPages) {
    showError('모든 페이지를 삭제할 수 없습니다.');
    return;
  }

  try {
    const prevActive = activeSide;
    activeSide = side;
    await pushHistory();
    activeSide = prevActive;

    const removedSet = new Set(indices);
    const pages = st.pdfLibDoc.getPages();
    const remaining = pages.filter(function(_, i) { return !removedSet.has(i); });
    for (let i = pages.length - 1; i >= 0; i--) st.pdfLibDoc.removePage(i);
    remaining.forEach(function(p) { st.pdfLibDoc.addPage(p); });

    st.labels = remapLabelsAfterRemove(st.labels, removedSet, pages.length);

    await reloadSide(side);
    $('status-info').textContent = indices.length + '페이지 삭제됨';
  } catch (err) {
    showError('삭제 실패: ' + err.message);
  }
}

async function copyPagesSide(side) {
  const st = sideState(side);
  if (!st.pdfLibDoc) return;
  const e = sideEls(side);
  const indices = window.Thumbnail.getSelectedIndices(e.thumbnailList);
  if (indices.length === 0) return;

  try {
    const tempDoc = await PDFLib.PDFDocument.create();
    const copied = await tempDoc.copyPages(st.pdfLibDoc, indices);
    copied.forEach(function(p) { tempDoc.addPage(p); });
    window.pageClipboard = { type: 'copy', tempDoc: tempDoc, count: indices.length };
    $('status-info').textContent = indices.length + '페이지 복사됨';
  } catch (err) {
    showError('복사 실패: ' + err.message);
  }
}

async function pastePagesSide(side, targetPageIndex, position) {
  const st = sideState(side);
  if (!st.pdfLibDoc || !window.pageClipboard) return;

  const clipDoc     = window.pageClipboard.tempDoc;
  const count       = window.pageClipboard.count;
  const insertIndex = position === 'above' ? targetPageIndex : targetPageIndex + 1;

  try {
    const prevActive = activeSide;
    activeSide = side;
    await pushHistory();
    activeSide = prevActive;

    const clipIndices   = Array.from({ length: count }, function(_, i) { return i; });
    const clipPages     = await st.pdfLibDoc.copyPages(clipDoc, clipIndices);
    const existingPages = st.pdfLibDoc.getPages();
    const totalNew      = existingPages.length + count;
    for (let i = existingPages.length - 1; i >= 0; i--) st.pdfLibDoc.removePage(i);

    let ci = 0, ei = 0;
    for (let i = 0; i < totalNew; i++) {
      if (i >= insertIndex && ci < count) st.pdfLibDoc.addPage(clipPages[ci++]);
      else                                st.pdfLibDoc.addPage(existingPages[ei++]);
    }

    const newLabels = {};
    Object.keys(st.labels).forEach(function(idx) {
      const n = Number(idx);
      newLabels[n >= insertIndex ? n + count : n] = st.labels[idx];
    });
    st.labels = newLabels;

    await reloadSide(side);
    $('status-info').textContent = count + '페이지 붙여넣기 완료';
  } catch (err) {
    showError('붙여넣기 실패: ' + err.message);
  }
}

async function saveAndDeletePagesSide(side) {
  const st = sideState(side);
  if (!st.pdfLibDoc) return;
  const e = sideEls(side);
  const indices = window.Thumbnail.getSelectedIndices(e.thumbnailList);
  if (indices.length === 0) return;
  if (indices.length >= st.pdfJsDoc.numPages) {
    showError('모든 페이지를 삭제할 수 없습니다.');
    return;
  }

  try {
    const saveDoc = await PDFLib.PDFDocument.create();
    const copied = await saveDoc.copyPages(st.pdfLibDoc, indices);
    copied.forEach(function(p) { saveDoc.addPage(p); });
    const bytes = await saveDoc.save();

    const base = st.filename ? st.filename.replace(/\.pdf$/i, '') : 'extracted';
    const pageRange = indices.length === 1
      ? 'p' + (indices[0] + 1)
      : 'p' + (indices[0] + 1) + '-' + (indices[indices.length - 1] + 1);
    const saved = await window.electronAPI.saveFile(bytes, base + '_' + pageRange + '.pdf');
    if (!saved) return;

    const prevActive = activeSide;
    activeSide = side;
    await pushHistory();
    activeSide = prevActive;

    const removedSet = new Set(indices);
    const pages = st.pdfLibDoc.getPages();
    const remaining = pages.filter(function(_, i) { return !removedSet.has(i); });
    for (let i = pages.length - 1; i >= 0; i--) st.pdfLibDoc.removePage(i);
    remaining.forEach(function(p) { st.pdfLibDoc.addPage(p); });

    st.labels = remapLabelsAfterRemove(st.labels, removedSet, pages.length);

    await reloadSide(side);
    $('status-info').textContent = indices.length + '페이지 저장 후 삭제 완료';
  } catch (err) {
    showError('삭제 후 저장 실패: ' + err.message);
  }
}

async function saveAndKeepPagesSide(side) {
  const st = sideState(side);
  if (!st.pdfLibDoc) return;
  const e = sideEls(side);
  const indices = window.Thumbnail.getSelectedIndices(e.thumbnailList);
  if (indices.length === 0) return;

  try {
    const saveDoc = await PDFLib.PDFDocument.create();
    const copied = await saveDoc.copyPages(st.pdfLibDoc, indices);
    copied.forEach(function(p) { saveDoc.addPage(p); });
    const bytes = await saveDoc.save();

    const base = st.filename ? st.filename.replace(/\.pdf$/i, '') : 'extracted';
    const pageRange = indices.length === 1
      ? 'p' + (indices[0] + 1)
      : 'p' + (indices[0] + 1) + '-' + (indices[indices.length - 1] + 1);
    const saved = await window.electronAPI.saveFile(bytes, base + '_' + pageRange + '.pdf');
    if (!saved) return;

    $('status-info').textContent = indices.length + '페이지 저장 완료';
  } catch (err) {
    showError('보존 후 저장 실패: ' + err.message);
  }
}

function showContextMenu(e, side, pageIndex) {
  e.preventDefault();
  _ctxSide = side;
  _ctxPageIndex = pageIndex;

  const menu = $('context-menu');
  const has = !!window.pageClipboard;
  $('ctx-paste-above').classList.toggle('disabled', !has);
  $('ctx-paste-below').classList.toggle('disabled', !has);

  menu.style.left = e.clientX + 'px';
  menu.style.top  = e.clientY + 'px';
  menu.classList.add('visible');

  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  menu.style.left = (e.clientX - rect.width)  + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top  = (e.clientY - rect.height) + 'px';
}

function hideContextMenu() {
  $('context-menu').classList.remove('visible');
}

// 컨텍스트 메뉴 이벤트 바인딩
['left', 'right'].forEach(function(side) {
  document.getElementById('thumbnail-list-' + side).addEventListener('contextmenu', function(e) {
    const item = e.target.closest('.thumbnail-item');
    if (!item) return;
    const st = sideState(side);
    if (!st.pdfLibDoc) return;
    const pageIndex = Number(item.dataset.pageIndex);
    const el = sideEls(side);
    if (!window.Thumbnail.getSelectedIndices(el.thumbnailList).includes(pageIndex)) {
      window.Thumbnail.setSelected(el.thumbnailList, pageIndex);
    }
    if (splitMode) setActiveSide(side);
    showContextMenu(e, side, pageIndex);
  });
});

$('ctx-cut').addEventListener('click', function() {
  hideContextMenu();
  cutPagesSide(_ctxSide);
});
$('ctx-copy').addEventListener('click', function() {
  hideContextMenu();
  copyPagesSide(_ctxSide);
});
$('ctx-paste-above').addEventListener('click', function() {
  if (this.classList.contains('disabled')) return;
  hideContextMenu();
  pastePagesSide(_ctxSide, _ctxPageIndex, 'above');
});
$('ctx-paste-below').addEventListener('click', function() {
  if (this.classList.contains('disabled')) return;
  hideContextMenu();
  pastePagesSide(_ctxSide, _ctxPageIndex, 'below');
});
$('ctx-delete').addEventListener('click', function() {
  hideContextMenu();
  deletePagesSide(_ctxSide);
});
$('ctx-save-delete').addEventListener('click', function() {
  hideContextMenu();
  saveAndDeletePagesSide(_ctxSide);
});
$('ctx-save-keep').addEventListener('click', function() {
  hideContextMenu();
  saveAndKeepPagesSide(_ctxSide);
});
document.addEventListener('click', function(e) {
  if (!e.target.closest('#context-menu')) hideContextMenu();
});
