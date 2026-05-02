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

// 합치기 순서 조정 모달
// files: Array<{ buffer: ArrayBuffer, name: string }>
// 반환: 사용자가 정렬한 Array<{ buffer, name }> 또는 null (취소)
function showMergeOrderDialog(files) {
  return new Promise(function(resolve) {
    const overlay   = $('merge-overlay');
    const listEl    = $('merge-list');
    const btnConfirm = $('merge-confirm');
    const btnCancel  = $('merge-cancel');

    // 파일 목록 렌더링 (data-idx로 원본 배열 인덱스 추적)
    listEl.innerHTML = '';
    files.forEach(function(file, idx) {
      const item = document.createElement('div');
      item.className = 'merge-item';
      item.dataset.idx = String(idx);

      const handle = document.createElement('span');
      handle.className = 'merge-drag-handle';
      handle.textContent = '⠿';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'merge-filename';
      nameSpan.textContent = file.name;
      nameSpan.title = file.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'merge-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = '목록에서 제거';

      item.appendChild(handle);
      item.appendChild(nameSpan);
      item.appendChild(removeBtn);
      listEl.appendChild(item);
    });

    function updateConfirmState() {
      btnConfirm.disabled = listEl.children.length < 1;
    }
    updateConfirmState();

    // SortableJS 초기화
    const sortable = new Sortable(listEl, {
      animation: 150,
      handle: '.merge-drag-handle',
    });

    // 항목 제거
    listEl.addEventListener('click', onRemoveClick);
    function onRemoveClick(e) {
      if (e.target.classList.contains('merge-remove')) {
        e.target.closest('.merge-item').remove();
        updateConfirmState();
      }
    }

    overlay.classList.add('visible');

    function getOrderedFiles() {
      const items = listEl.querySelectorAll('.merge-item');
      const result = [];
      items.forEach(function(item) {
        result.push(files[parseInt(item.dataset.idx, 10)]);
      });
      return result;
    }

    function cleanup(result) {
      overlay.classList.remove('visible');
      sortable.destroy();
      listEl.innerHTML = '';
      listEl.removeEventListener('click', onRemoveClick);
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    function onConfirm() { cleanup(getOrderedFiles()); }
    function onCancel()  { cleanup(null); }
    function onKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
    }

    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}
