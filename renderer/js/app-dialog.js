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
