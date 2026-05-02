# PDF 편집 툴 - Claude 웹 채팅용 컨텍스트

## 프로젝트 개요
Electron 기반 PDF 편집 툴. 수학 시험지 PDF를 문제/해설로 자동 분류하고 분리 저장하는 용도.

## 기술 스택
- Electron + HTML/CSS/JS
- pdf.js (PDF 렌더링)
- pdf-lib.js (PDF 편집/저장)
- Sortable.js (드래그앤드롭 재정렬)
- tesseract.js (OCR)

## 파일 구조
```
pdf-editor/
├── main.js                  # Electron 메인 프로세스, 네이티브 메뉴, IPC 핸들러
├── preload.js               # contextBridge로 IPC 채널 노출
├── renderer/
│   ├── index.html           # UI 구조
│   ├── css/main.css         # 스타일
│   └── js/
│       ├── app.js           # 메인 앱 로직 (이벤트, 상태관리)
│       ├── thumbnail.js     # 썸네일 렌더링
│       ├── viewer.js        # PDF 뷰어
│       ├── editor.js        # 페이지 삭제/재정렬/합치기/나누기
│       ├── automation.js    # 자동화 버튼
│       ├── classifier.js    # 문제/해설 자동 분류
│       ├── pdf-loader.js    # PDF 로드
│       ├── crop.js          # 영역 크롭
│       └── ocr.js           # OCR
```

## 현재 UI 구조
```
[툴바: 📂열기 💾저장 | 🗑️삭제 🔗합치기 ✂️나누기 | 📘문제좌 📗문제우 📙해설만 📦전체분리]
┌─────────────────────┬───┬─────────────────────────────────┐
│   썸네일 패널        │ ║ │         PDF 뷰어 패널            │
│ (flex-wrap 멀티컬럼) │   │  (페이지, 확대/축소, 드래그패닝) │
│                     │   │                                 │
│ [🔍 ──슬라이더── px] │   │  [◀ 1/10 ▶  🔍100% ──────────] │
└─────────────────────┴───┴─────────────────────────────────┘
[상태바: 파일명 | 페이지 정보]
```

## 구현 완료 기능
1. PDF 열기 (버튼, 메뉴 Ctrl+O, 드래그앤드롭)
2. PDF 뷰어 (페이지 이동, 확대/축소, 드래그 패닝, 휠 스크롤)
3. 썸네일 패널
   - flex-wrap 멀티컬럼 (패널 넓히면 자동으로 여러 열)
   - 패널 리사이저로 끝까지 확장 가능
   - 하단 줌 슬라이더 (60~300px, CSS --thumb-size 변수로 제어)
   - 썸네일은 canvas→img 변환으로 렌더링 (CSP: img-src data: blob:)
   - Ctrl+클릭/Shift+클릭 다중 선택
4. 페이지 삭제
5. 드래그앤드롭 페이지 재정렬 (Sortable.js)
6. PDF 합치기 (다른 파일과 병합)
7. PDF 나누기 (페이지 범위 지정)
8. 영역 크롭 (setCropBox 방식)
9. 저장/다운로드
10. 실행취소(Ctrl+Z) / 다시실행(Ctrl+Y)
11. 문제/해설 자동 분류 (키워드 '정답' 연속 등장 감지)
12. 자동화 버튼: 문제 좌측 크롭, 문제 우측 크롭, 해설만, 전체분리 저장

## 네이티브 메뉴 (한글)
- 파일: 열기(Ctrl+O), 저장(Ctrl+S), 종료
- 편집: 실행취소, 다시실행, 잘라내기, 복사, 붙여넣기
- 보기: 새로고침, 확대/축소, 전체화면, 개발자도구
- 도움말: 정보

## IPC 채널 (preload.js → app.js)
- `electronAPI.openFile()` — 파일 열기 다이얼로그
- `electronAPI.saveFile(buffer, name)` — 파일 저장
- `electronAPI.saveFiles(files)` — 폴더 선택 후 여러 파일 저장
- `electronAPI.onMenuOpen(cb)` — 메뉴 열기 이벤트
- `electronAPI.onMenuSave(cb)` — 메뉴 저장 이벤트
- `electronAPI.onMenuUndo(cb)` — 메뉴 실행취소 이벤트
- `electronAPI.onMenuRedo(cb)` — 메뉴 다시실행 이벤트

## app.js 상태 객체
```js
const state = {
  pdfJsDoc: null,      // pdf.js 문서 (렌더링용)
  pdfLibDoc: null,     // pdf-lib 문서 (편집용)
  currentPage: 0,
  scale: 1.0,
  labels: {},          // { pageIndex: 'question' | 'answer' | 'unknown' }
  filename: '',
};
```

## 다음 구현 예정: 두 파일 동시 보기
- 뷰어 영역을 좌/우로 나눠 두 PDF를 동시에 표시
- 각각 독립적인 페이지 네비게이션과 줌
- 구체적인 설계는 이 채팅에서 논의 예정

---
*이 파일은 Claude 웹 채팅에서 프로젝트 컨텍스트 공유용으로 생성됨 (2026-04-28)*
