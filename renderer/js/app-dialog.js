// 저장 파일 목록 확인 다이얼로그
function showSaveFilesConfirm(files) {
  return new Promise(function(resolve) {
    const icon    = $('confirm-icon');
    const msg     = $('confirm-message');
    const btnYes  = $('confirm-yes');
    const btnNo   = $('confirm-no');
    const btnCancel = $('confirm-cancel');

    const prevIcon       = icon.textContent;
    const prevNoDisplay  = btnNo.style.display;
    const prevYesText    = btnYes.textContent;

    icon.textContent     = '💾';
    btnNo.style.display  = 'none';
    btnYes.textContent   = '폴더 선택';

    msg.innerHTML = '다음 파일명으로 저장됩니다:';
    const list = document.createElement('div');
    list.className = 'save-file-list';
    files.forEach(function(f) {
      const badge = document.createElement('span');
      badge.className = 'save-file-badge';
      badge.textContent = f.name;
      list.appendChild(badge);
    });
    msg.appendChild(list);

    $('confirm-overlay').classList.add('visible');

    function cleanup(result) {
      $('confirm-overlay').classList.remove('visible');
      icon.textContent    = prevIcon;
      btnNo.style.display = prevNoDisplay;
      btnYes.textContent  = prevYesText;
      btnYes.removeEventListener('click', onYes);
      btnCancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onYes()    { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onKey(ev) {
      if (ev.key === 'Enter')  { ev.preventDefault(); cleanup(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(false); }
    }

    btnYes.addEventListener('click', onYes);
    btnCancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}

// 확인 다이얼로그

function showConfirmDialog(filename) {
  return new Promise(function(resolve) {
    $('confirm-message').textContent = filename + '의 변경사항을 저장하시겠습니까?';
    $('confirm-overlay').classList.add('visible');

    function cleanup(result) {
      $('confirm-overlay').classList.remove('visible');
      $('confirm-yes').removeEventListener('click', onYes);
      $('confirm-no').removeEventListener('click', onNo);
      $('confirm-cancel').removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onYes()    { cleanup(0); }
    function onNo()     { cleanup(1); }
    function onCancel() { cleanup(2); }
    function onKey(ev) {
      if (ev.key === 'Enter' || ev.key === 'y' || ev.key === 'Y') { ev.preventDefault(); cleanup(0); }
      if (ev.key === 'n' || ev.key === 'N')                       { ev.preventDefault(); cleanup(1); }
      if (ev.key === 'Escape')                                     { ev.preventDefault(); cleanup(2); }
    }

    $('confirm-yes').addEventListener('click', onYes);
    $('confirm-no').addEventListener('click', onNo);
    $('confirm-cancel').addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}

// PDF 합치기 다이얼로그
// 반환: Array<{ buffer: ArrayBuffer, name: string }> 또는 null (취소)
function showMergeOrderDialog() {
  return new Promise(function(resolve) {
    const overlay      = $('merge-overlay');
    const tbody        = $('merge-tbody');
    const tableWrap    = $('merge-table-wrap');
    const thead        = document.querySelector('#merge-table thead');
    const btnAddFile   = $('merge-add-file');
    const btnAddFolder = $('merge-add-folder');
    const btnDelete    = $('merge-delete-row');
    const btnConfirm   = $('merge-confirm');
    const btnCancel    = $('merge-cancel');
    const btnCloseX    = $('merge-close-x');

    let fileList = [];
    let selectedIdx = -1;
    let sortCol = null;   // 'name' | 'size' | 'date'
    let sortDir = 'asc';

    function formatSize(bytes) {
      if (bytes == null) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDate(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + mo + '-' + day + ' ' + h + ':' + m;
    }

    function applySortToList() {
      if (!sortCol) return;
      const selectedFile = selectedIdx >= 0 ? fileList[selectedIdx] : null;
      fileList.sort(function(a, b) {
        let cmp = 0;
        if (sortCol === 'name') cmp = a.name.localeCompare(b.name, 'ko');
        else if (sortCol === 'size') cmp = (a.size || 0) - (b.size || 0);
        else if (sortCol === 'date') cmp = (a.modified || '').localeCompare(b.modified || '');
        return sortDir === 'asc' ? cmp : -cmp;
      });
      selectedIdx = selectedFile ? fileList.indexOf(selectedFile) : -1;
    }

    function updateSortHeaders() {
      thead.querySelectorAll('th[data-col]').forEach(function(th) {
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.remove();
        if (th.dataset.col === sortCol) {
          const span = document.createElement('span');
          span.className = 'sort-arrow';
          span.textContent = sortDir === 'asc' ? '▲' : '▼';
          th.appendChild(span);
        }
      });
    }

    function renderTable() {
      tbody.innerHTML = '';
      fileList.forEach(function(file, idx) {
        const tr = document.createElement('tr');
        if (idx === selectedIdx) tr.classList.add('selected');
        tr.dataset.idx = String(idx);

        const tdName = document.createElement('td');
        tdName.textContent = file.name;
        tdName.title = file.name;

        const tdSize = document.createElement('td');
        tdSize.className = 'merge-td-size';
        tdSize.textContent = formatSize(file.size);

        const tdType = document.createElement('td');
        tdType.className = 'merge-td-type';
        tdType.textContent = (function(name) {
          const ext = name.split('.').pop().toLowerCase();
          const map = { pdf: 'PDF 파일', jpg: 'JPEG 이미지', jpeg: 'JPEG 이미지', png: 'PNG 이미지',
                        gif: 'GIF 이미지', bmp: 'BMP 이미지', webp: 'WebP 이미지', tiff: 'TIFF 이미지', tif: 'TIFF 이미지' };
          return map[ext] || '파일';
        })(file.name);

        const tdDate = document.createElement('td');
        tdDate.className = 'merge-td-date';
        tdDate.textContent = formatDate(file.modified);

        const tdStatus = document.createElement('td');
        const span = document.createElement('span');
        span.className = 'merge-status-waiting';
        span.textContent = '대기중';
        tdStatus.appendChild(span);

        tr.appendChild(tdName);
        tr.appendChild(tdSize);
        tr.appendChild(tdType);
        tr.appendChild(tdDate);
        tr.appendChild(tdStatus);
        tbody.appendChild(tr);
      });

      btnConfirm.disabled = fileList.length === 0;
      btnDelete.disabled = selectedIdx < 0;
      updateSortHeaders();
    }

    // 행 드래그 순서 조정 (정렬 중에는 비활성)
    const sortable = new Sortable(tbody, {
      animation: 150,
      onEnd: function(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        sortCol = null;  // 수동 정렬 시 컬럼 정렬 해제
        const moved = fileList.splice(evt.oldIndex, 1)[0];
        fileList.splice(evt.newIndex, 0, moved);
        if (selectedIdx === evt.oldIndex) selectedIdx = evt.newIndex;
        else if (selectedIdx > evt.oldIndex && selectedIdx <= evt.newIndex) selectedIdx--;
        else if (selectedIdx < evt.oldIndex && selectedIdx >= evt.newIndex) selectedIdx++;
        renderTable();
      },
    });

    // 헤더 클릭 → 컬럼 정렬
    function onTheadClick(e) {
      const th = e.target.closest('th[data-col]');
      if (!th) return;
      const col = th.dataset.col;
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = col; sortDir = 'asc'; }
      applySortToList();
      renderTable();
    }

    // 행 클릭 → 선택
    function onRowClick(e) {
      const tr = e.target.closest('tr');
      if (!tr) return;
      const idx = parseInt(tr.dataset.idx, 10);
      selectedIdx = (selectedIdx === idx) ? -1 : idx;
      renderTable();
    }

    // OS 파일 드래그 드롭
    function onDragOver(e) {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      tableWrap.classList.add('drag-over');
    }
    function onDragLeave(e) {
      if (!tableWrap.contains(e.relatedTarget)) tableWrap.classList.remove('drag-over');
    }
    async function onDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      tableWrap.classList.remove('drag-over');
      const droppedFiles = Array.from(e.dataTransfer.files).filter(function(f) {
        const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
        return ['.pdf','.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.tif'].includes(ext);
      });
      if (droppedFiles.length === 0) return;
      const added = await Promise.all(droppedFiles.map(async function(f) {
        const buffer = await f.arrayBuffer();
        return { buffer, name: f.name, size: f.size, modified: new Date(f.lastModified).toISOString() };
      }));
      fileList = fileList.concat(added);
      renderTable();
    }

    async function onAddFile() {
      const added = await window.electronAPI.openFiles();
      if (!added || added.length === 0) return;
      fileList = fileList.concat(added);
      renderTable();
    }

    async function onAddFolder() {
      const added = await window.electronAPI.openFolder();
      if (!added || added.length === 0) return;
      fileList = fileList.concat(added);
      renderTable();
    }

    function onDeleteRow() {
      if (selectedIdx < 0 || selectedIdx >= fileList.length) return;
      fileList.splice(selectedIdx, 1);
      selectedIdx = fileList.length === 0 ? -1 : Math.min(selectedIdx, fileList.length - 1);
      renderTable();
    }

    function onConfirm() { cleanup(fileList.slice()); }
    function onCancel()  { cleanup(null); }
    function onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
      if (ev.key === 'Delete' && selectedIdx >= 0) { ev.preventDefault(); onDeleteRow(); }
    }

    function cleanup(result) {
      overlay.classList.remove('visible');
      sortable.destroy();
      tbody.innerHTML = '';
      tableWrap.classList.remove('drag-over');
      fileList = [];
      selectedIdx = -1;
      thead.removeEventListener('click', onTheadClick);
      tbody.removeEventListener('click', onRowClick);
      tableWrap.removeEventListener('dragover', onDragOver);
      tableWrap.removeEventListener('dragleave', onDragLeave);
      tableWrap.removeEventListener('drop', onDrop);
      btnAddFile.removeEventListener('click', onAddFile);
      btnAddFolder.removeEventListener('click', onAddFolder);
      btnDelete.removeEventListener('click', onDeleteRow);
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      btnCloseX.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    renderTable();
    overlay.classList.add('visible');

    thead.addEventListener('click', onTheadClick);
    tbody.addEventListener('click', onRowClick);
    tableWrap.addEventListener('dragover', onDragOver);
    tableWrap.addEventListener('dragleave', onDragLeave);
    tableWrap.addEventListener('drop', onDrop);
    btnAddFile.addEventListener('click', onAddFile);
    btnAddFolder.addEventListener('click', onAddFolder);
    btnDelete.addEventListener('click', onDeleteRow);
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    btnCloseX.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}
