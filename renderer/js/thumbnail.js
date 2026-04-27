// thumbnail.js
const THUMB_WIDTH = 160;

function renderThumbnails(pdfJsDoc, container, labels, onSelect, onReorder) {
  if (!labels) labels = {};
  container.innerHTML = '';

  for (let i = 0; i < pdfJsDoc.numPages; i++) {
    const item = createThumbnailItem(i, pdfJsDoc, labels[i] || 'unknown', onSelect);
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

function createThumbnailItem(pageIndex, pdfJsDoc, label, onSelect) {
  const item = document.createElement('div');
  item.className = 'thumbnail-item';
  item.dataset.pageIndex = pageIndex;

  const canvas = document.createElement('canvas');
  item.appendChild(canvas);

  const badge = createBadge(label, pageIndex);
  item.appendChild(badge);

  const pageNum = document.createElement('div');
  pageNum.className = 'thumbnail-page-num';
  pageNum.textContent = pageIndex + 1;
  item.appendChild(pageNum);

  item.addEventListener('click', function() { onSelect(pageIndex); });
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
  container.querySelectorAll('.thumbnail-item').forEach(function(el) {
    el.classList.toggle('selected', Number(el.dataset.pageIndex) === pageIndex);
  });
}

function updateAllBadges(container, labels) {
  container.querySelectorAll('.thumbnail-badge').forEach(function(badge) {
    const idx = Number(badge.dataset.pageIndex);
    updateBadge(badge, labels[idx] || 'unknown');
  });
}

window.Thumbnail = { renderThumbnails, setSelected, updateAllBadges };
if (typeof module !== 'undefined') module.exports = { renderThumbnails, setSelected, updateAllBadges };
