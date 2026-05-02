# 합치기 기능 개선 설계: 다중 파일 선택 + 순서 조정 모달

## 개요

현재 합치기 기능은 파일 1개만 선택하고 현재 문서에 이어 붙이는 방식이다.
개선 후에는 여러 PDF를 선택하고, 순서를 조정한 뒤, 새 탭으로 열 수 있다.

## 변경 전/후 비교

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 파일 선택 수 | 1개 | 여러 개 |
| 현재 문서 포함 여부 | 항상 포함 (맨 앞) | 포함 안 함 |
| 순서 조정 | 불가 | 드래그앤드롭 모달 |
| 결과 위치 | 현재 탭 교체 | 새 탭으로 오픈 |

## 동작 흐름

1. 사용자가 툴바의 🔗 합치기 버튼 클릭
2. OS 파일 다이얼로그 열림 (다중 선택 허용)
3. 파일 선택 취소 시 → 종료
4. 선택한 파일 목록을 담은 **합치기 순서 조정 모달** 표시
   - 각 항목: 드래그 핸들 + 파일명 + 제거 버튼
   - SortableJS로 드래그앤드롭 순서 조정
   - 항목이 1개 미만이면 확인 버튼 비활성화
   - 확인 / 취소 버튼
5. 취소 시 → 모달 닫고 종료
6. 확인 시 → 순서대로 각 파일 로드 → `Editor.mergeDocuments`로 합치기 → 새 탭으로 오픈
7. 탭 파일명: `merged.pdf`

## 수정 파일 목록

### `main.js`
- `dialog:openFiles` IPC 핸들러 추가
  - `properties: ['openFile', 'multiSelections']`
  - 반환: `Array<{ buffer: ArrayBuffer, name: string }>` 또는 `null`

### `preload.js`
- `openFiles: () => ipcRenderer.invoke('dialog:openFiles')` 추가

### `renderer/index.html`
- `#merge-overlay` 모달 HTML 추가 (`confirm-overlay`와 동일한 레이어 구조)

### `renderer/css/main.css`
- `#merge-overlay` 스타일 추가 (기존 `confirm-overlay` 패턴 활용)
- 모달 내 파일 목록 아이템, 드래그 핸들 스타일

### `renderer/js/app-dialog.js`
- `showMergeOrderDialog(files)` 함수 추가
  - `files`: `Array<{ buffer: ArrayBuffer, name: string }>`
  - 반환: 사용자가 순서를 조정한 `Array<{ buffer, name }>` 또는 `null` (취소 시)
  - SortableJS로 리스트 정렬 가능하게 초기화
  - 확인 클릭 시 DOM 순서 기준으로 파일 배열 재정렬해서 resolve

### `renderer/js/app.js`
- `btn-merge` 클릭 핸들러 교체
  - `electronAPI.openFiles()` 호출
  - `showMergeOrderDialog()` 호출
  - 순서대로 `PdfLoader.loadPdf` → `Editor.mergeDocuments` → 새 탭 오픈

## 에러 처리

- 파일 로드 실패 시 `showError`로 알림 (기존 패턴)
- 합치기 실패 시 `showError`

## 비변경 사항

- `Editor.mergeDocuments` 함수는 수정하지 않음
- 기존 단일 파일 openFile 핸들러는 유지
- 현재 탭 문서는 합치기에 포함하지 않음
