# 미저장 변경사항 경고 — 탭 닫기 / 앱 종료

## 개요

탭을 닫거나 앱을 종료할 때 저장되지 않은 변경사항이 있는 탭에 대해 Electron 네이티브 3버튼 다이얼로그를 표시한다. 앱 종료 시에는 dirty 탭을 순서대로(tabsL → tabsR) 처리한다.

## Dirty Flag

`createTab()` 반환 객체에 `dirty: false` 추가.

설정 시점:
- `pushHistory()` 호출 시 → `activeState().dirty = true`

초기화 시점:
- `loadPdf()`, `restoreFromBytes()` → `tab.dirty = false`
- `saveActive()` 저장 성공(파일 실제 저장됨) 시 → `activeState().dirty = false`

## 탭 이름 표시

dirty 탭은 탭 바에서 이름 뒤에 `*` 표시: `시험지.pdf *`
`renderTabBar()` 내 `tab-name` 텍스트에 반영.

## 탭 닫기 다이얼로그

`closeTab(side, idx)` 수정:
1. 해당 탭이 `dirty`가 아니면 기존 로직(즉시 닫기).
2. dirty이면 IPC `dialog:confirmClose` 호출 → 3버튼 결과 수신:
   - **0 (저장)**: `saveActive()` 실행. 저장 성공(파일 실제 선택됨)이면 닫기. 사용자가 저장 대화상자에서 취소하면 탭 닫기 중단.
   - **1 (저장 안 함)**: 바로 닫기.
   - **2 (취소)**: 아무것도 안 함.

## 앱 종료 처리

### main.js
```js
win.on('close', (e) => {
  e.preventDefault();
  win.webContents.send('app:will-close');
});
```
강제 종료 IPC `app:close` 수신 시 → `win.destroy()` 호출.

### renderer (app.js)
`app:will-close` 수신 시:
1. tabsL, tabsR 순서로 dirty 탭 목록 수집.
2. 각 탭에 대해 순서대로:
   - `dialog:confirmClose` 호출
   - 저장(0): `saveActive()` 실행. 취소이면 종료 중단(함수 종료).
   - 저장 안 함(1): 계속 진행.
   - 취소(2): 종료 중단(함수 종료).
3. 모든 탭 처리 완료 → `electronAPI.closeApp()` 호출.

## IPC 추가

### main.js
| 채널 | 방향 | 역할 |
|------|------|------|
| `dialog:confirmClose` | renderer→main (handle) | 3버튼 다이얼로그, 결과(0/1/2) 반환 |
| `app:close` | renderer→main (on) | `win.destroy()` |

다이얼로그 버튼 구성:
```js
dialog.showMessageBox(win, {
  type: 'warning',
  title: '저장되지 않은 변경사항',
  message: `"${filename}" — 저장하지 않은 변경사항이 있습니다.`,
  buttons: ['저장', '저장 안 함', '취소'],
  defaultId: 0,
  cancelId: 2,
});
// 반환: { response: 0|1|2 }
```

### preload.js
```js
confirmClose: (filename) => ipcRenderer.invoke('dialog:confirmClose', filename),
closeApp: () => ipcRenderer.send('app:close'),
onWillClose: (cb) => ipcRenderer.on('app:will-close', cb),
```

## 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `main.js` | `win.on('close')` 인터셉트, `dialog:confirmClose` 핸들러, `app:close` 리스너 |
| `preload.js` | `confirmClose`, `closeApp`, `onWillClose` 노출 |
| `renderer/js/app.js` | `dirty` 플래그, `closeTab` 수정, `saveActive` 수정, `onWillClose` 핸들러, `renderTabBar` `*` 표시 |
