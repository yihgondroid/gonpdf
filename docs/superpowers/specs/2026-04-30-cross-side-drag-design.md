# 양면분할 썸네일 교차 드래그 — 다중 페이지 이동

## 개요

양면분할 모드에서 썸네일을 반대쪽 패널로 드래그하면, 현재 선택된 페이지 전부를 소스 PDF에서 제거하고 대상 PDF에 삽입한다.

## 동작 정의

1. 드래그 시작(`onStart`): 소스 컨테이너에서 선택된 썸네일 전체에 `dragging-selected` 클래스 추가 (시각적 강조).
2. 드래그 완료(`onEnd`):
   - **같은 컨테이너**: 기존 로직(단일 페이지 재정렬) 그대로.
   - **다른 컨테이너(cross-side)**: 선택된 인덱스 전부를 소스에서 제거하고 대상의 드롭 위치에 삽입.
3. 드래그 취소(ESC 등): Sortable이 DOM을 원상복구. 강조 클래스 제거.

## 엣지 케이스

- 선택 페이지가 소스의 전체 페이지 수와 같으면(모든 페이지를 이동하려는 경우) 작업 중단 + 알림.
- 선택이 없는 상태에서 드래그: `evt.oldIndex`(드래그한 단일 페이지)만 이동.

## 수정 파일

### `renderer/js/thumbnail.js`

```
renderThumbnails(pdfJsDoc, container, labels, onSelect, onReorder, onLabelChange, onCrossReorder)
```
새 파라미터 `onCrossReorder` 추가 (선택적, 없으면 cross-side 드래그 비활성).

Sortable config 변경:
```js
{
  group: 'pdf-pages',
  animation: 150,
  onStart: function(evt) {
    // 선택된 항목에 dragging-selected 클래스 추가
  },
  onEnd: function(evt) {
    // dragging-selected 클래스 제거
    if (evt.from === evt.to) {
      // 기존 onReorder 호출
    } else if (onCrossReorder) {
      // 선택된 인덱스 수집 후 onCrossReorder 호출
      onCrossReorder(evt.from, evt.to, selectedIndices, evt.newIndex);
    }
  }
}
```

### `renderer/js/app.js`

`handleCrossReorder(fromContainer, toContainer, indices, toIndex)` 신규 추가:
1. 소스 side 판별 (container → side)
2. 전체 페이지 이동 방지 guard
3. 소스/대상 양쪽 undo 스택 push
4. 이동할 페이지 라벨 저장
5. 소스에서 페이지 제거 + 라벨 인덱스 정리
6. 대상에 페이지 삽입 + 라벨 이식 (toIndex 기준으로 기존 라벨 shift)
7. `reloadSide(fromSide)` + `reloadSide(toSide)`

모든 `renderThumbnails` 호출(4곳)에 `handleCrossReorder` 콜백 추가.

### `renderer/css/main.css`

```css
.thumbnail-item.dragging-selected {
  opacity: 0.4;
  outline: 2px dashed #8ab4d4;
}
```

## 제약

- 양면분할 모드에서만 유효 (단일 모드에서는 오른쪽 패널이 숨겨져 있어 cross-side 드래그 불가).
- 소스 측 Sortable이 DOM에서 드래그된 한 요소를 이미 이동시키지만, `reloadSide` 호출로 전체 썸네일을 재렌더링하므로 DOM 중간 상태는 무시됨.
