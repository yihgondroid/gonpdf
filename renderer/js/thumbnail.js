// thumbnail.js
const THUMB_WIDTH = 160;

let _selectedSet = new Set();
let _anchor = 0;

function _refreshVisuals(container) {
  container.querySelectorAll('.thumbnail-item').forEach(function(el) {
    el.classList.toggle('selected', _selectedSet.has(Number(el.dataset.pageIndex)));
  });
}

function renderThumbnails(pdfJsDoc, container, labels, onSelect, onReorder, onLabelChange) {
  if (!labels) labels = {};
  _selectedSet = new Set();
  _anchor = 0;
  container.innerHTML = '';

  for (let i = 0; i < pdfJsDoc.numPages; i++) {
    const item = createThumbnailItem(i, pdfJsDoc, labels[i] || 'unknown', onSelect, onLabelChange);
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

const LABEL_CYCLE = ['unknown', 'question', 'answer'];

function createThumbnailItem(pageIndex, pdfJsDoc, label, onSelect, onLabelChange) {
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
    const container = item.parentNode;
    if (e.ctrlKey || e.metaKey) {
      if (_selectedSet.has(pageIndex)) _selectedSet.delete(pageIndex);
      else _selectedSet.add(pageIndex);
      _anchor = pageIndex;
    } else if (e.shiftKey && _anchor >= 0) {
      const min = Math.min(_anchor, pageIndex);
      const max = Math.max(_anchor, pageIndex);
      _selectedSet.clear();
      for (let i = min; i <= max; i++) _selectedSet.add(i);
    } else {
      _selectedSet.clear();
      _selectedSet.add(pageIndex);
      _anchor = pageIndex;
    }
    _refreshVisuals(container);
    onSelect(pageIndex);
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
  canvas.style.width = '100%';
  canvas.style.aspectRatio = scaledViewport.width + ' / ' + scaledViewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
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
  } else {
    badgeEl.classList.add('badge-unknown');
    badgeEl.textContent = '❓';
  }
}

function setSelected(container, pageIndex) {
  _selectedSet = new Set([pageIndex]);
  _anchor = pageIndex;
  _refreshVisuals(container);
}

function getSelectedIndices() {
  return Array.from(_selectedSet).sort(function(a, b) { return a - b; });
}

function updateAllBadges(container, labels) {
  container.querySelectorAll('.thumbnail-badge').forEach(function(badge) {
    const idx = Number(badge.dataset.pageIndex);
    updateBadge(badge, labels[idx] || 'unknown');
  });
}

window.Thumbnail = { renderThumbnails, setSelected, updateAllBadges, getSelectedIndices };
if (typeof module !== 'undefined') module.exports = { renderThumbnails, setSelected, updateAllBadges, getSelectedIndices };
