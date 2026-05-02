# 썸네일 우클릭 컨텍스트 메뉴 — 잘라내기 / 복사 / 붙여넣기

## 개요

썸네일 패널에서 우클릭 시 컨텍스트 메뉴를 표시하고, 잘라내기·복사·붙여넣기 기능을 제공한다. 클립보드는 탭과 사이드 간 교차 사용이 가능해야 한다.

## 클립보드 구조

```js
// 글로벌 (app.js 또는 별도 clipboard.js)
window.pageClipboard = null;
// 값이 있을 때:
// { type: 'cut' | 'copy', tempDoc: PDFDocument, count: N }
```

- `tempDoc`: pdf-lib의 `PDFDocument`. 복사된 페이지들을 순서대로 담고 있다.
- `count`: 포함된 페이지 수 (메뉴 라벨 등에 활용 가능).
- `type`: 'cut'이면 원본이 이미 삭제된 상태, 'copy'면 원본 유지.

## 동작 정의

### 잘라내기
1. 현재 선택된 페이지들(getSelectedIndices)을 `PDFDocument.create()` → `copyPages()` → `addPage()`로 tempDoc에 순서대로 복사.
2. 원본 문서에서 해당 페이지들을 삭제 (기존 deletePage 로직과 동일).
3. `window.pageClipboard = { type: 'cut', tempDoc, count }` 저장.
4. undo 스택에 삭제 액션 추가.
5. 썸네일 및 뷰어 갱신.

### 복사
1. 선택 페이지들을 tempDoc에 복사 (원본 변경 없음).
2. `window.pageClipboard = { type: 'copy', tempDoc, count }` 저장.
3. 원본 문서/UI 변경 없음.

### 붙여넣기 (위 / 아래)
1. `pageClipboard`가 null이면 아무것도 하지 않는다.
2. 우클릭한 썸네일의 pageIndex를 기준으로 삽입 위치 계산.
   - "위로 붙여넣기": insertIndex = pageIndex
   - "아래로 붙여넣기": insertIndex = pageIndex + 1
3. `activeDoc.copyPages(tempDoc, [0..count-1])` 로 페이지 배열 획득.
4. 해당 인덱스부터 `activeDoc.insertPage(insertIndex + i, pages[i])` 반복.
5. labels 업데이트 (삽입 페이지는 'unknown'으로 초기화, 기존 라벨 인덱스 shift).
6. undo 스택에 삽입 액션 추가.
7. 썸네일 및 뷰어 갱신.
8. 클립보드는 유지 (연속 붙여넣기 허용).

## 컨텍스트 메뉴 UI

```
잘라내기
복사
──────────────────────────
이 페이지 위로 붙여넣기      ← pageClipboard 있을 때만 활성
이 페이지 아래로 붙여넣기    ← pageClipboard 있을 때만 활성
```

- 메뉴는 커스텀 `<div>` (id="context-menu")로 구현. 브라우저 기본 context menu 사용 안 함.
- 메뉴 외부 클릭 또는 스크롤 시 닫힘.
- 비활성 항목은 `disabled` 클래스로 회색 처리 (클릭 무반응).
- 썸네일 위에서 우클릭한 경우에만 표시. 패널 빈 공간 우클릭은 무시.
- 우클릭한 페이지가 선택 영역 밖이면: 해당 페이지만 단일 선택 후 메뉴 표시.
- 우클릭한 페이지가 이미 선택 영역 안이면: 기존 다중 선택 유지.

## 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `renderer/index.html` | `#context-menu` div 추가 |
| `renderer/css/main.css` | 컨텍스트 메뉴 스타일 |
| `renderer/js/thumbnail.js` | `contextmenu` 이벤트 바인딩, 메뉴 표시/닫기 |
| `renderer/js/app.js` | `window.pageClipboard`, cut/copy/paste 액션 구현 |

## 엣지 케이스

- 붙여넣기 후 원본 탭이 닫혀도 클립보드(`tempDoc`)는 독립적으로 살아있으므로 계속 붙여넣기 가능.
- 다중 선택 상태에서 잘라내기/복사 → 여러 페이지 클립보드에 담김.
- 붙여넣기 후 삽입된 페이지들은 자동으로 선택 상태로 전환 (선택적 개선, 필수 아님).
