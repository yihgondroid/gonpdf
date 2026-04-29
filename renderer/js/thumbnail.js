// thumbnail.js
const THUMB_WIDTH = 160;

const _selectedSets = new WeakMap();
const _anchors = new WeakMap();

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

function renderThumbnails(pdfJsDoc, container, labels, onSelect, onReorder, onLabelChange) {
  if (!labels) labels = {};
  _selectedSets.set(container, new Set());
  _anchors.set(container, 0);
  container.innerHTML = '';

  for (let i = 0; i < pdfJsDoc.numPages; i++) {
    const item = createThumbnailItem(i, pdfJsDoc, labels[i] || 'unknown', container, onSelect, onLabelChange);
    container.appendChild(item);
  }

  window.Sortable.create(container, {
    animation: 150,
    onEnd: function(evt) {
      if (evt.oldIndex !== evt.newIndex) {
        onReorder(evt.oldIndex, evt.newIndex);
      }
    },
  });
}

const LABEL_CYCLE = ['unknown', 'question', 'answer', 'other'];

function createThumbnailItem(pageIndex, pdfJsDoc, label, container, onSelect, onLabelChange) {
  const item = document.createElement('div');
  item.className = 'thumbnail-item';
  item.dataset.pageIndex = pageIndex;

  const canvas = document.createElement('canvas');
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
  renderThumbCanvas(pdfJsDoc, pageIndex, canvas);
  return item;
}

async function renderThumbCanvas(pdfJsDoc, pageIndex, canvas) {
  const page = await pdfJsDoc.getPage(pageIndex + 1);
  const dpr = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: 1 });
  const scale = (THUMB_WIDTH / viewport.width) * dpr;
  const scaledViewport = page.getViewport({ scale: scale });
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
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

window.Thumbnail = { renderThumbnails, setSelected, updateAllBadges, getSelectedIndices };
if (typeof module !== 'undefined') module.exports = { renderThumbnails, setSelected, updateAllBadges, getSelectedIndices };
