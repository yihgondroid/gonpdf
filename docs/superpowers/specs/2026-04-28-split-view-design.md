# 양면분할 기능 설계

## 개요

PDF 편집기에 양면분할 모드를 추가한다. 툴바 버튼으로 단일↔양면 전환이 가능하며, 양쪽 뷰어에 서로 다른 PDF를 독립적으로 열거나 같은 PDF를 다른 페이지로 볼 수 있다.

---

## 레이아웃

### 단일 모드 (기존)
```
[툴바]
┌──────────┬─┬──────────────────────────┐
│ 썸네일 L │║│ 뷰어 L + 컨트롤          │
└──────────┴─┴──────────────────────────┘
[상태바]
```

### 양면 모드
```
[툴바: ... | 📄 양면분할(활성)]
┌──────────┬─┬────────────┬────────────┬─┬──────────┐
│ 썸네일 L │║│   뷰어 L   │   뷰어 R   │║│ 썸네일 R │
│          │ │ (컨트롤 L) │ (컨트롤 R) │ │          │
└──────────┴─┴────────────┴────────────┴─┴──────────┘
[상태바]
```

- `#main-area`에 `split-mode` 클래스 추가/제거로 CSS 토글
- 오른쪽 패널(`#viewer-panel-right`, `#thumbnail-panel-right`, `#panel-resizer-right`)은 단일 모드에서 `display:none`
- 포커스된 쪽 뷰어 상단에 파란 테두리(`border-top: 2px solid #8ab4d4`) 표시

---

## 상태 관리

### 구조

```js
// 기존 state → stateL 로 이름 변경
const stateL = { pdfJsDoc, pdfLibDoc, currentPage, scale, labels, filename }
const stateR = { pdfJsDoc, pdfLibDoc, currentPage, scale, labels, filename }
let activeSide = 'left'   // 'left' | 'right'
let splitMode  = false

// undo/redo 스택 분리
const undoStackL = [], redoStackL = []
const undoStackR = [], redoStackR = []
```

### activeState() 헬퍼

```js
function activeState()  { return activeSide === 'left' ? stateL : stateR }
function activeUndo()   { return activeSide === 'left' ? undoStackL : undoStackR }
function activeRedo()   { return activeSide === 'left' ? redoStackL : redoStackR }
```

모든 편집/저장 함수는 `activeState()`를 통해 동작.

---

## HTML 변경

### 툴바 추가
```html
<div class="toolbar-sep"></div>
<div class="toolbar-group">
  <button id="btn-split-view">📄 양면분할</button>
</div>
```

### main-area 오른쪽 패널 추가
```html
<!-- 기존 #viewer-panel 뒤에 추가 -->
<div id="panel-resizer-right"></div>
<div id="thumbnail-panel-right">
  <div id="thumbnail-footer-right">...</div>
  <div id="thumbnail-count-right"></div>
  <div id="thumbnail-list-right"></div>
</div>
```

**기존 ID → 변경 ID (rename):**

| 기존 | 변경 |
|------|------|
| `#viewer-panel` | `#viewer-panel-left` |
| `#viewer-canvas-wrap` | `#viewer-canvas-wrap-left` |
| `#viewer-canvas` | `#viewer-canvas-left` |
| `#viewer-controls` | `#viewer-controls-left` |
| `#viewer-page-info` | `#viewer-page-info-left` |
| `#viewer-zoom-info` | `#viewer-zoom-info-left` |
| `#zoom-slider` | `#zoom-slider-left` |
| `#btn-prev` / `#btn-next` | `#btn-prev-left` / `#btn-next-left` |
| `#panel-resizer` | `#panel-resizer-left` |
| `#thumbnail-panel` | `#thumbnail-panel-left` |
| `#thumbnail-list` | `#thumbnail-list-left` |
| `#thumbnail-count` | `#thumbnail-count-left` |
| `#thumb-zoom-slider` | `#thumb-zoom-slider-left` |
| `#thumb-zoom-label` | `#thumb-zoom-label-left` |

오른쪽은 동일 구조를 `-right` suffix로 추가.

---

## CSS 변경

```css
/* 단일 모드: 오른쪽 패널 숨김 */
#viewer-panel-right,
#panel-resizer-right,
#thumbnail-panel-right { display: none; }

/* 양면 모드 */
#main-area.split-mode #viewer-panel-right,
#main-area.split-mode #panel-resizer-right,
#main-area.split-mode #thumbnail-panel-right { display: flex; }

/* 포커스 표시 */
#viewer-panel-left.active,
#viewer-panel-right.active { border-top: 2px solid #8ab4d4; }
```

---

## 동작 명세

### 양면분할 버튼
- 클릭 시 `splitMode` 토글
- `#main-area`에 `split-mode` 클래스 추가/제거
- 버튼 활성 스타일 토글 (`background: #8ab4d4`)
- 양면 모드 진입 시 `activeSide = 'left'` 초기화

### 포커스 전환
- 뷰어 패널 또는 썸네일 패널 클릭 시 해당 사이드로 `activeSide` 변경
- `.active` 클래스 좌우 교체

### 파일 열기
- 단일 모드: 기존과 동일
- 양면 모드: `activeState()`의 사이드에 로드

### 저장
- `confirm('왼쪽 PDF를 저장하시겠습니까?')` 형태 (포커스 사이드 이름 포함)
- 확인 시 `activeState()`의 pdfLibDoc 저장

### 편집 버튼 (삭제, 합치기, 나누기, 자동화)
- 모두 `activeState()`를 사용하여 포커스된 사이드에 적용

### undo / redo
- `activeUndo()` / `activeRedo()`로 각 사이드 독립 스택 사용

### 양면 모드 해제 시
- 오른쪽 상태(`stateR`) 초기화하지 않음 (재진입 시 유지)
- `activeSide = 'left'`로 리셋

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `renderer/index.html` | 툴바 버튼, 오른쪽 패널 HTML 추가 |
| `renderer/css/main.css` | 분할 모드 CSS, 포커스 스타일 |
| `renderer/js/app.js` | stateL/stateR 분리, activeSide 관리, 버튼 이벤트 |
