# Render Worker 설계 문서

**날짜:** 2026-05-08  
**목표:** PDF 렌더링을 Web Worker로 이전하여 메인 스레드 UI 블로킹 제거

---

## 1. 배경 및 목표

현재 `viewer.js`의 `_renderToCanvas()`는 메인 스레드에서 PDF.js의 `page.render()`를 직접 호출한다. 고해상도 페이지나 빠른 스크롤 시 UI 응답성이 저하된다.

**목표:** `render-worker.js`가 PDF.js 전체를 내부 로드하여 OffscreenCanvas로 렌더링하고, 결과를 `ImageBitmap`으로 메인 스레드에 전달. 메인 스레드는 `drawImage()`만 실행.

---

## 2. 전체 아키텍처

```
메인 스레드 (viewer.js)
  ├── _renderWorker: Worker          ← 앱 시작 시 1회 생성
  ├── _pendingRenders: Map<reqId, {canvas, scale, dpr}>
  ├── _renderToCanvas()              ← worker 메시지 전송으로 교체
  └── _onWorkerMessage()             ← 수신 후 drawImage + 캐시 저장

render-worker.js
  ├── PDF.js + PDF.js 내부 워커 로드
  ├── _pdfCache: Map<pdfUrl, PDFDocumentProxy>
  ├── _cancelled: Set<reqId>
  ├── 저화질 렌더 → postMessage({phase:'low', bitmap})
  └── 고화질 렌더 → postMessage({phase:'high', bitmap})
```

---

## 3. render-worker.js

### 초기화
```js
importScripts('../node_modules/pdfjs-dist/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.js';

const _pdfCache = new Map();   // pdfUrl → PDFDocumentProxy
const _cancelled = new Set();  // 취소된 reqId
```

### 메시지 프로토콜 (수신)

| type | 필드 | 설명 |
|------|------|------|
| `render` | `id, pdfUrl, pageIndex, scaleLow, scaleHigh, dpr` | 렌더 요청 |
| `cancel` | `id` | 진행 중 렌더 취소 |

### 메시지 프로토콜 (송신)

| phase | 필드 | 설명 |
|-------|------|------|
| `low` | `id, phase, bitmap, displayW, displayH` | 저화질 완료 |
| `high` | `id, phase, bitmap, displayW, displayH` | 고화질 완료 |
| `error` | `id, phase, error` | 렌더 실패 |

### 렌더 흐름
1. `_pdfCache`에서 doc 조회, 없으면 `pdfjsLib.getDocument({ url: pdfUrl })` 로드
2. `page = doc.getPage(pageIndex + 1)`
3. 저화질 OffscreenCanvas (`scale * dpr * 0.5`) 생성
4. `ctx.fillStyle = '#ffffff'; ctx.fillRect(...)` 흰색 배경
5. `page.render({ canvasContext: ctx, viewport })` → `createImageBitmap(canvas)`
6. `postMessage({ id, phase:'low', bitmap, displayW, displayH }, [bitmap])`
7. 취소 확인 (`_cancelled.has(id)`) → 취소 시 return
8. 고화질 OffscreenCanvas (`scale * dpr * sharp`) 동일 절차
9. `postMessage({ id, phase:'high', bitmap, ... }, [bitmap])`

---

## 4. viewer.js 변경사항

### 추가 (IIFE 상단)
```js
const _renderWorker = new Worker('render-worker.js');
let _reqId = 0;
const _pendingRenders = new Map();  // reqId → { canvas, scale, dpr }
_renderWorker.onmessage = _onWorkerMessage;
```

### `_onWorkerMessage(e)` (신규)
```
phase:'low'  → canvas에 drawImage(bitmap), skeleton 제거, minHeight 조정
              pending은 유지 (high 응답 대기)
phase:'high' → canvas에 drawImage(bitmap), _cacheSet(ImageBitmap), pending 삭제
phase:'error'→ pending 삭제, 콘솔 에러
```

### `_renderToCanvas()` 변경
```
기존 동일 경로:
  - 캐시 히트: 즉시 drawImage (변경 없음)
  - pdfUrl 없음: 기존 main-thread 렌더 fallback (편집 후 reload 케이스)

신규 경로 (pdfUrl 있음):
  - reqId = ++_reqId
  - 기존 canvas._renderTask가 있으면 cancel 메시지 전송
  - canvas._renderTask = reqId  (숫자로 재활용)
  - _pendingRenders.set(reqId, { canvas, scale, dpr })
  - _renderWorker.postMessage({ type:'render', id:reqId, pdfUrl, pageIndex, scaleLow, scaleHigh, dpr })
```

### API 시그니처 변경

| 함수 | 변경 |
|------|------|
| `_renderToCanvas(pdfJsDoc, pageIndex, canvas, scale, pdfUrl)` | `pdfUrl` 추가 |
| `renderAllPages(pdfJsDoc, wrap, scale, onCurrentPage, pdfUrl)` | `pdfUrl` 추가, `wrap._pdfUrl = pdfUrl` 저장 |
| `rerenderAllPages(wrap, pdfJsDoc, scale)` | `wrap._pdfUrl` 사용 (파라미터 불필요) |
| `renderPage(pdfJsDoc, pageIndex, canvas, scale, pdfUrl)` | `pdfUrl` 추가 |

---

## 5. pdf-loader.js 변경사항

`loadPdf()` 반환값에 `pdfUrl` 추가:
```js
return { pdfJsDoc, pdfLibDoc, pdfUrl };
// filePath 있음: pdfUrl = 'pdffile://' + encodeURIComponent(filePath)
// filePath 없음: pdfUrl = null
```

---

## 6. app-pdf.js 변경사항

- `loadPdf()` 결과에서 `pdfUrl` 구조분해
- `tab.pdfUrl = pdfUrl` 저장
- `setupContinuousViewer(side)` → `renderAllPages(..., st.pdfUrl)` 전달
- `reloadSide()`: `pdfUrl = null` (bytes-only, fallback 사용)

---

## 7. 알려진 제약

- **편집 후 reload** (`reloadSide`): `pdfUrl = null` → main-thread 렌더 fallback 유지. 편집 빈도가 낮아 허용 가능.
- **CSP**: 현재 `worker-src blob: file:` — `render-worker.js`가 `file:` 로드이므로 적합. 단, `importScripts`가 asar 내부 파일에 접근 가능한지 패키징 후 검증 필요.
- **메모리**: 워커 내 PDF.js 인스턴스 추가 → 메인 스레드 PDF.js 인스턴스와 별도 존재.

---

## 8. 변경 파일 목록

1. `renderer/render-worker.js` — 신규 생성
2. `renderer/js/viewer.js` — worker 연동, API 파라미터 추가
3. `renderer/js/pdf-loader.js` — pdfUrl 반환
4. `renderer/js/app-pdf.js` — pdfUrl 전달
