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

// PDF 병합 다이얼로그
// 반환: Array<{ buffer: ArrayBuffer, name: string }> 또는 null (취소)
function showMergeOrderDialog() {
  return new Promise(function(resolve) {
    const overlay      = $('merge-overlay');
    const tbody        = $('merge-tbody');
    const btnAddFile   = $('merge-add-file');
    const btnAddFolder = $('merge-add-folder');
    const btnDelete    = $('merge-delete-row');
    const btnConfirm   = $('merge-confirm');
    const btnCancel    = $('merge-cancel');
    const btnCloseX    = $('merge-close-x');

    let fileList = [];
    let selectedIdx = -1;

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
        tdType.textContent = 'PDF 파일';

        const tdDate = document.createElement('td');
        tdDate.className = 'merge-td-date';
        tdDate.textContent = formatDate(file.modified);

        const tdStatus = document.createElement('td');
        tdStatus.className = 'merge-td-status';
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
    }

    const sortable = new Sortable(tbody, {
      animation: 150,
      onEnd: function(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        const moved = fileList.splice(evt.oldIndex, 1)[0];
        fileList.splice(evt.newIndex, 0, moved);
        if (selectedIdx === evt.oldIndex) selectedIdx = evt.newIndex;
        else if (selectedIdx > evt.oldIndex && selectedIdx <= evt.newIndex) selectedIdx--;
        else if (selectedIdx < evt.oldIndex && selectedIdx >= evt.newIndex) selectedIdx++;
        renderTable();
      },
    });

    function onRowClick(e) {
      const tr = e.target.closest('tr');
      if (!tr) return;
      const idx = parseInt(tr.dataset.idx, 10);
      selectedIdx = (selectedIdx === idx) ? -1 : idx;
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
      fileList = [];
      selectedIdx = -1;
      tbody.removeEventListener('click', onRowClick);
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

    tbody.addEventListener('click', onRowClick);
    btnAddFile.addEventListener('click', onAddFile);
    btnAddFolder.addEventListener('click', onAddFolder);
    btnDelete.addEventListener('click', onDeleteRow);
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    btnCloseX.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}
