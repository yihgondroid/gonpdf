// thumbnail.js
const THUMB_WIDTH = 160;

const _selectedSets = new WeakMap();
const _anchors = new WeakMap();
const _dragSelectInited = new WeakSet();

function _getSel(container) {
  if (!_selectedSets.has(container)) _selectedSets.set(container, new Set());
  return _selectedSets.get(container);
}
function _getAnchor(container) {
  return _anchors.has(container) ? _anchors.get(container) : 0;
}

function _refreshVisuals(container) {
  const sel = _getSel(container);
  container.querySelectorAll('.thumbnail-item').forEach(function(el) {
    el.classList.toggle('selected', sel.has(Number(el.dataset.pageIndex)));
  });
}

function initDragSelect(container) {
  if (_dragSelectInited.has(container)) return;
  _dragSelectInited.add(container);

  let active = false, startX, startY, overlay;

  container.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.thumbnail-item')) return;
    active = true;
    const cr = container.getBoundingClientRect();
    startX = e.clientX - cr.left + container.scrollLeft;
    startY = e.clientY - cr.top + container.scrollTop;
    _selectedSets.set(container, new Set());
    _refreshVisuals(container);
    overlay = document.createElement('div');
    overlay.className = 'drag-select-overlay';
    overlay.style.left = startX + 'px';
    overlay.style.top = startY + 'px';
    overlay.style.width = '0';
    overlay.style.height = '0';
    container.appendChild(overlay);
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!active) return;
    const cr = container.getBoundingClientRect();
    const curX = e.clientX - cr.left + container.scrollLeft;
    const curY = e.clientY - cr.top + container.scrollTop;
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const w = Math.abs(curX - startX);
    const h = Math.abs(curY - startY);
    overlay.style.left = x + 'px';
    overlay.style.top = y + 'px';
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
    const sel = _getSel(container);
    sel.clear();
    container.querySelectorAll('.thumbnail-item').forEach(function(item) {
      const ir = item.getBoundingClientRect();
      const itemX = ir.left - cr.left + container.scrollLeft;
      const itemY = ir.top - cr.top + container.scrollTop;
      if (itemX < x + w && itemX + ir.width > x && itemY < y + h && itemY + ir.height > y) {
        sel.add(Number(item.dataset.pageIndex));
      }
    });
    _refreshVisuals(container);
  });

  document.addEventListener('mouseup', function() {
    if (!active) return;
    active = false;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  });
}

function initContainer(container, onReorder, onCrossReorder) {
  _selectedSets.set(container, new Set());
  _anchors.set(container, 0);
  container.innerHTML = '';
  initDragSelect(container);
  window.Sortable.create(container, {
    group: 'pdf-pages',
    animation: 150,
    onStart: function() {
      const sel = _getSel(container);
      container.querySelectorAll('.thumbnail-item').forEach(function(el) {
        el.classList.toggle('dragging-selected', sel.has(Number(el.dataset.pageIndex)));
      });
    },
    onEnd: function(evt) {
      evt.from.querySelectorAll('.thumbnail-item').forEach(function(el) { el.classList.remove('dragging-selected'); });
      evt.to.querySelectorAll('.thumbnail-item').forEach(function(el) { el.classList.remove('dragging-selected'); });
      if (evt.from === evt.to) {
        if (evt.oldIndex !== evt.newIndex) onReorder(evt.oldIndex, evt.newIndex);
      } else if (onCrossReorder) {
        const sel = Array.from(_getSel(evt.from)).sort(function(a, b) { return a - b; });
        const indices = sel.length > 0 ? sel : [evt.oldIndex];
        onCrossReorder(evt.from, evt.to, indices, evt.newIndex);
      }
    },
  });
}

function renderThumbnails(pdfJsDoc, container, labels, onSelect, onReorder, onLabelChange, onCrossReorder) {
  if (!labels) labels = {};
  initContainer(container, onReorder, onCrossReorder);
  for (let i = 0; i < pdfJsDoc.numPages; i++) {
    const item = createThumbnailItem(i, pdfJsDoc, labels[i] || 'unknown', container, onSelect, onLabelChange);
    container.appendChild(item);
  }
}

const LABEL_CYCLE = ['unknown', 'question', 'answer', 'other'];

function createThumbnailItem(pageIndex, pdfJsDoc, label, container, onSelect, onLabelChange, autoRender) {
  if (autoRender === undefined) autoRender = true;
  const item = document.createElement('div');
  item.className = 'thumbnail-item';
  item.dataset.pageIndex = pageIndex;

  const canvas = document.createElement('canvas');
  item._thumbCanvas = canvas;
  item.appendChild(canvas);

  const badge = createBadge(label, pageIndex);
  if (onLabelChange) {
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      const cur = LABEL_CYCLE.indexOf(badge.dataset.label || 'unknown');
      const next = LABEL_CYCLE[(cur + 1) % LABEL_CYCLE.length];
      badge.dataset.label = next;
      updateBadge(badge, next);
      onLabelChange(pageIndex, next);
    });
  }
  item.appendChild(badge);

  const pageNum = document.createElement('div');
  pageNum.className = 'thumbnail-page-num';
  pageNum.textContent = pageIndex + 1;
  item.appendChild(pageNum);

  item.addEventListener('click', function(e) {
    const sel = _getSel(container);
    const anchor = _getAnchor(container);
    if (e.ctrlKey || e.metaKey) {
      if (sel.has(pageIndex)) sel.delete(pageIndex);
      else sel.add(pageIndex);
      _anchors.set(container, pageIndex);
      _refreshVisuals(container);
    } else if (e.shiftKey && anchor >= 0) {
      const min = Math.min(anchor, pageIndex);
      const max = Math.max(anchor, pageIndex);
      sel.clear();
      for (let i = min; i <= max; i++) sel.add(i);
      _refreshVisuals(container);
    } else {
      sel.clear();
      sel.add(pageIndex);
      _anchors.set(container, pageIndex);
      _refreshVisuals(container);
      onSelect(pageIndex);
    }
  });
  if (autoRender) renderThumbCanvas(pdfJsDoc, pageIndex, canvas);
  return item;
}

async function addOneThumbnail(pdfJsDoc, container, pageIndex, label, onSelect, onLabelChange) {
  const item = createThumbnailItem(pageIndex, pdfJsDoc, label || 'unknown', container, onSelect, onLabelChange, false);
  container.appendChild(item);
  await renderThumbCanvas(pdfJsDoc, pageIndex, item._thumbCanvas);
}

async function renderThumbCanvas(pdfJsDoc, pageIndex, canvas) {
  const page = await pdfJsDoc.getPage(pageIndex + 1);
  const dpr = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: 1 });
  const scale = (THUMB_WIDTH / viewport.width) * dpr;
  const scaledViewport = page.getViewport({ scale: scale });
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
  const img = document.createElement('img');
  img.src = canvas.toDataURL();
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.display = 'block';
  if (canvas.parentNode) canvas.parentNode.replaceChild(img, canvas);
}

function createBadge(label, pageIndex) {
  const badge = document.createElement('div');
  badge.className = 'thumbnail-badge';
  badge.dataset.pageIndex = pageIndex;
  badge.dataset.label = label || 'unknown';
  updateBadge(badge, label);
  return badge;
}

function updateBadge(badgeEl, label) {
  badgeEl.className = 'thumbnail-badge';
  if (label === 'question') {
    badgeEl.classList.add('badge-question');
    badgeEl.textContent = '🔵 문제';
  } else if (label === 'answer') {
    badgeEl.classList.add('badge-answer');
    badgeEl.textContent = '🟠 해설';
  } else if (label === 'other') {
    badgeEl.classList.add('badge-other');
    badgeEl.textContent = '📄 기타';
  } else {
    badgeEl.classList.add('badge-unknown');
    badgeEl.textContent = '❓';
  }
}

function clearSelection(container) {
  _selectedSets.set(container, new Set());
  _anchors.set(container, 0);
  _refreshVisuals(container);
}

function setSelected(container, pageIndex) {
  _selectedSets.set(container, new Set([pageIndex]));
  _anchors.set(container, pageIndex);
  _refreshVisuals(container);
}

function getSelectedIndices(container) {
  return Array.from(_getSel(container)).sort(function(a, b) { return a - b; });
}

function updateAllBadges(container, labels) {
  container.querySelectorAll('.thumbnail-badge').forEach(function(badge) {
    const idx = Number(badge.dataset.pageIndex);
    updateBadge(badge, labels[idx] || 'unknown');
  });
}

window.Thumbnail = { renderThumbnails, initContainer, addOneThumbnail, setSelected, clearSelection, updateAllBadges, getSelectedIndices };
if (typeof module !== 'undefined') module.exports = { renderThumbnails, initContainer, addOneThumbnail, setSelected, clearSelection, updateAllBadges, getSelectedIndices };
