# 합치기 다중 파일 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 합치기 버튼을 눌렀을 때 여러 PDF를 선택하고, 모달에서 드래그앤드롭으로 순서를 정한 뒤 새 탭으로 합쳐서 열 수 있게 한다.

**Architecture:** Electron IPC에 다중 파일 선택 핸들러를 추가하고, 기존 `confirm-overlay` 패턴을 그대로 복제해 `merge-overlay` 모달을 만든다. 모달 내 정렬은 이미 번들된 SortableJS를 사용하고, 합치기는 기존 `Editor.mergeDocuments`를 그대로 사용한다. 결과는 기존 `loadPdf(side, buffer, name)` 함수로 새 탭에 로드한다.

**Tech Stack:** Electron IPC, SortableJS (이미 bundle에 포함), pdf-lib (`Editor.mergeDocuments`), pdfjs-dist (`PdfLoader.loadPdf`), Vanilla JS

---

## 파일 변경 맵

| 파일 | 변경 내용 |
|------|-----------|
| `main.js` | `dialog:openFiles` IPC 핸들러 추가 |
| `preload.js` | `openFiles` API 노출 |
| `renderer/index.html` | `#merge-overlay` 모달 HTML 추가 |
| `renderer/css/main.css` | 모달 및 파일 목록 아이템 스타일 추가 |
| `renderer/js/app-dialog.js` | `showMergeOrderDialog(files)` 함수 추가 |
| `renderer/js/app.js` | `btn-merge` 핸들러 교체 |

---

## Task 1: dialog:openFiles IPC 핸들러 + preload 노출

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: main.js에 dialog:openFiles 핸들러 추가**

`main.js` 의 마지막 `ipcMain.handle('dialog:saveFiles', ...)` 블록 바로 아래에 추가:

```javascript
ipcMain.handle('dialog:openFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWin, {
    title: 'PDF 파일 열기',
    filters: [{ name: 'PDF 파일', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections'],
    ...(lastDirectory ? { defaultPath: lastDirectory } : {}),
  });
  if (canceled || filePaths.length === 0) return null;
  lastDirectory = path.dirname(filePaths[0]);
  return filePaths.map(function(fp) {
    const fileData = fs.readFileSync(fp);
    const arrayBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
    return { buffer: arrayBuffer, name: path.basename(fp) };
  });
});
```

- [ ] **Step 2: preload.js에 openFiles 노출**

`preload.js`의 `contextBridge.exposeInMainWorld('electronAPI', {` 블록 안에, `openFile` 줄 바로 아래에 추가:

```javascript
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
```

- [ ] **Step 3: 앱 실행 후 수동 확인**

터미널에서 `npm start` 실행 → 개발자 도구(F12) 콘솔에서:
```javascript
window.electronAPI.openFiles().then(console.log)
```
여러 파일 선택 후 `[{buffer: ArrayBuffer, name: "xxx.pdf"}, ...]` 형태로 출력되는지 확인.
취소 시 `null` 반환되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add main.js preload.js
git commit -m "feat: dialog:openFiles IPC 핸들러 추가 (다중 PDF 선택)"
```

---

## Task 2: 합치기 순서 조정 모달 HTML + CSS

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/css/main.css`

- [ ] **Step 1: index.html에 merge-overlay 추가**

`renderer/index.html`의 `#confirm-overlay` div 바로 아래에 추가:

```html
  <div id="merge-overlay">
    <div id="merge-box">
      <div id="merge-title">🔗 합치기 순서 조정</div>
      <p id="merge-desc">파일을 드래그하여 합칠 순서를 정하세요.</p>
      <div id="merge-list"></div>
      <div id="merge-buttons">
        <button id="merge-confirm">확인</button>
        <button id="merge-cancel">취소</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: main.css에 merge 모달 스타일 추가**

`renderer/css/main.css`의 맨 끝에 추가:

```css
/* 합치기 순서 조정 모달 */
#merge-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 9500;
  align-items: center;
  justify-content: center;
}
#merge-overlay.visible { display: flex; }
#merge-box {
  background: #f0f4f8;
  border: 1px solid #a0b8cc;
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
  padding: 24px 28px 20px;
  min-width: 360px;
  max-width: 520px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: 'Malgun Gothic', sans-serif;
}
#merge-title {
  font-size: 14px;
  font-weight: 600;
  color: #223;
}
#merge-desc {
  font-size: 12px;
  color: #556;
  margin: 0;
}
#merge-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}
.merge-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #dce8f2;
  border: 1px solid #a8c4d8;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 12px;
  color: #334;
  cursor: default;
  user-select: none;
}
.merge-drag-handle {
  cursor: grab;
  color: #88a;
  font-size: 14px;
  flex-shrink: 0;
}
.merge-drag-handle:active { cursor: grabbing; }
.merge-filename {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Malgun Gothic', monospace;
}
.merge-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: #889;
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}
.merge-remove:hover { color: #c44; }
#merge-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
#merge-buttons button {
  padding: 6px 20px;
  border: 1px solid #a0b8cc;
  border-radius: 4px;
  background: #e8f0f7;
  color: #334;
  font-size: 12px;
  font-family: 'Malgun Gothic', sans-serif;
  cursor: pointer;
  min-width: 72px;
  transition: background 0.1s;
}
#merge-buttons button:hover { background: #c8dcea; }
#merge-confirm { background: #b8d4e8; border-color: #8ab4d4; font-weight: 500; }
#merge-confirm:hover { background: #9ac4dc; }
#merge-confirm:disabled { background: #d8e4ee; color: #aab; cursor: not-allowed; }
```

- [ ] **Step 3: 앱 실행 후 수동 확인**

`npm start` → 개발자 도구 콘솔에서:
```javascript
document.getElementById('merge-overlay').classList.add('visible')
```
모달이 화면 중앙에 반투명 배경과 함께 표시되는지 확인.
```javascript
document.getElementById('merge-overlay').classList.remove('visible')
```
로 사라지는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add renderer/index.html renderer/css/main.css
git commit -m "feat: 합치기 순서 조정 모달 HTML/CSS 추가"
```

---

## Task 3: showMergeOrderDialog 함수 구현

**Files:**
- Modify: `renderer/js/app-dialog.js`

- [ ] **Step 1: showMergeOrderDialog 함수 추가**

`renderer/js/app-dialog.js` 맨 끝에 추가:

```javascript
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
```

- [ ] **Step 2: 앱 실행 후 수동 확인**

`npm start` → 개발자 도구 콘솔에서:
```javascript
const fakeFiles = [
  { buffer: new ArrayBuffer(0), name: 'a.pdf' },
  { buffer: new ArrayBuffer(0), name: 'b.pdf' },
  { buffer: new ArrayBuffer(0), name: 'c.pdf' },
];
showMergeOrderDialog(fakeFiles).then(result => console.log('결과:', result));
```
다음 항목 확인:
- 모달에 a.pdf, b.pdf, c.pdf 항목 3개 표시
- 드래그 핸들(⠿)로 순서 바꾸기 가능
- ✕ 버튼으로 항목 제거 가능
- 모든 항목 제거 시 확인 버튼 비활성화
- 확인 클릭 시 콘솔에 현재 순서대로 파일 배열 출력
- 취소 또는 Esc 시 `null` 출력

- [ ] **Step 3: 커밋**

```bash
git add renderer/js/app-dialog.js
git commit -m "feat: showMergeOrderDialog 구현 (SortableJS 순서 조정)"
```

---

## Task 4: btn-merge 핸들러 교체

**Files:**
- Modify: `renderer/js/app.js`

- [ ] **Step 1: btn-merge 핸들러 교체**

`renderer/js/app.js`의 기존 `$('btn-merge').addEventListener(...)` 블록(23~49줄) 전체를 아래로 교체:

```javascript
$('btn-merge').addEventListener('click', async function() {
  try {
    const files = await window.electronAPI.openFiles();
    if (!files || files.length === 0) return;
    const ordered = await showMergeOrderDialog(files);
    if (!ordered || ordered.length === 0) return;
    const docs = [];
    for (const f of ordered) {
      const { pdfLibDoc } = await window.PdfLoader.loadPdf(f.buffer);
      docs.push(pdfLibDoc);
    }
    const merged   = await window.Editor.mergeDocuments(docs);
    const newBytes = await merged.save();
    await loadPdf(activeSide, newBytes.buffer, 'merged.pdf');
    $('status-info').textContent = '합치기 완료 (' + merged.getPageCount() + ' 페이지)';
  } catch (err) {
    showError('합치기 실패: ' + err.message);
  }
});
```

- [ ] **Step 2: 앱 실행 후 전체 흐름 수동 확인**

`npm start` 후 다음 시나리오 순서대로 테스트:

**시나리오 1 - 정상 합치기:**
1. 합치기 버튼 클릭 → 파일 선택 다이얼로그에서 PDF 2개 이상 선택
2. 모달에 파일 목록 표시 확인
3. 드래그로 순서 바꾸기
4. 확인 클릭 → 새 탭에 `merged.pdf`로 열림 확인
5. 상태바에 "합치기 완료 (N 페이지)" 표시 확인

**시나리오 2 - 파일 선택 취소:**
1. 합치기 버튼 클릭 → 파일 선택 다이얼로그에서 취소
2. 아무 변화 없이 조용히 종료 확인

**시나리오 3 - 모달 취소:**
1. 합치기 버튼 클릭 → 파일 여러 개 선택
2. 모달에서 취소 또는 Esc
3. 아무 변화 없이 종료 확인

**시나리오 4 - 항목 제거 후 합치기:**
1. 파일 3개 선택 → 모달에서 1개 ✕로 제거 → 남은 2개로 확인
2. 결과가 2개 파일만 합쳐진 새 탭으로 열림 확인

**시나리오 5 - PDF 없는 상태에서 합치기:**
1. 아무 파일도 열지 않은 상태에서 합치기 버튼 클릭
2. 정상적으로 동작하고, 빈 탭에 merged.pdf 로드 확인

- [ ] **Step 3: 커밋**

```bash
git add renderer/js/app.js
git commit -m "feat: 합치기 버튼 다중 파일 선택 + 순서 조정 모달 연결"
```
