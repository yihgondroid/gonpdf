// 탭 관리

function renderTabBar(side) {
  const tabs      = side === 'left' ? tabsL : tabsR;
  const activeIdx = side === 'left' ? activeTabL : activeTabR;
  const bar = $('tab-bar-' + side);
  bar.innerHTML = '';

  const anyLoaded = tabsL.some(t => t.pdfJsDoc !== null) ||
                    tabsR.some(t => t.pdfJsDoc !== null);
  $('tab-bar-container').classList.toggle('visible', anyLoaded);

  tabs.forEach(function(tab, idx) {
    if (!tab.pdfJsDoc) return;

    const t = document.createElement('div');
    t.className = 'tab-item' + (idx === activeIdx ? ' active' : '');

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = (tab.filename || '새 파일') + (tab.dirty ? ' *' : '');
    name.title = tab.filename;
    t.appendChild(name);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      closeTab(side, idx);
    });
    t.appendChild(closeBtn);

    t.addEventListener('click', function() {
      if (splitMode) setActiveSide(side);
      switchTab(side, idx);
    });

    bar.appendChild(t);
  });
}

async function switchTab(side, idx) {
  if (side === 'left') activeTabL = idx;
  else activeTabR = idx;

  const tab = sideState(side);
  const e   = sideEls(side);

  renderTabBar(side);

  if (!tab || !tab.pdfJsDoc) {
    const placeholder = $('viewer-placeholder-' + side);
    if (placeholder) placeholder.classList.remove('hidden');
    e.viewerCanvasWrap.innerHTML = '';
    e.thumbnailList.innerHTML = '';
    e.thumbnailCount.textContent = '';
    return;
  }

  const placeholder = $('viewer-placeholder-' + side);
  if (placeholder) placeholder.classList.add('hidden');

  e.thumbnailCount.textContent = tab.pdfJsDoc.numPages + ' 페이지';
  window.Thumbnail.renderThumbnails(tab.pdfJsDoc, e.thumbnailList, tab.labels,
    (pi) => selectPage(side, pi),
    (oi, ni) => handleReorder(side, oi, ni),
    (pi, label) => { tab.labels[pi] = label; },
    handleCrossReorder);
  await setupContinuousViewer(side);
  selectPage(side, tab.currentPage);
  if (side === activeSide || !splitMode) {
    enableButtons(true, !!tab.classified);
  }
}

async function closeTab(side, idx) {
  const tabs = side === 'left' ? tabsL : tabsR;
  const tab  = tabs[idx];

  if (tab && tab.dirty) {
    const result = await showConfirmDialog(tab.filename || '새 파일');
    if (result === 2) return;
    if (result === 0) {
      try {
        const bytes = await tab.pdfLibDoc.save();
        const saved = await window.electronAPI.saveFileFromClose(bytes, tab.filename);
        if (!saved) return;
        tab.dirty = false;
      } catch (err) {
        showError('저장 실패: ' + err.message);
        return;
      }
    }
  }

  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    tabs.push(createTab());
    if (side === 'left') activeTabL = 0;
    else activeTabR = 0;
    const placeholder = $('viewer-placeholder-' + side);
    if (placeholder) placeholder.classList.remove('hidden');
    const e = sideEls(side);
    e.viewerCanvasWrap.innerHTML = '';
    e.thumbnailList.innerHTML = '';
    e.thumbnailCount.textContent = '';
    enableButtons(false);
    renderTabBar(side);
    return;
  }

  let activeIdx = side === 'left' ? activeTabL : activeTabR;
  if (activeIdx >= tabs.length) activeIdx = tabs.length - 1;
  else if (activeIdx > idx)     activeIdx--;

  if (side === 'left') activeTabL = activeIdx;
  else activeTabR = activeIdx;

  switchTab(side, activeIdx);
}

function initTabSortable() {
  ['left', 'right'].forEach(function(side) {
    window.Sortable.create($('tab-bar-' + side), {
      group: 'pdf-tabs',
      animation: 150,
      filter: '.tab-close',
      onEnd: function(evt) {
        if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
        const fromSide = evt.from.id === 'tab-bar-left' ? 'left' : 'right';
        const toSide   = evt.to.id   === 'tab-bar-left' ? 'left' : 'right';
        const fromTabs = fromSide === 'left' ? tabsL : tabsR;
        const toTabs   = toSide   === 'left' ? tabsL : tabsR;

        if (fromSide === toSide) {
          const tab = fromTabs.splice(evt.oldIndex, 1)[0];
          fromTabs.splice(evt.newIndex, 0, tab);
          let ai = fromSide === 'left' ? activeTabL : activeTabR;
          if (ai === evt.oldIndex) {
            ai = evt.newIndex;
          } else if (evt.oldIndex < evt.newIndex && ai > evt.oldIndex && ai <= evt.newIndex) {
            ai--;
          } else if (evt.oldIndex > evt.newIndex && ai >= evt.newIndex && ai < evt.oldIndex) {
            ai++;
          }
          if (fromSide === 'left') activeTabL = ai;
          else activeTabR = ai;
          renderTabBar(fromSide);
        } else {
          const tab = fromTabs.splice(evt.oldIndex, 1)[0];
          toTabs.splice(evt.newIndex, 0, tab);
          let fromAi = fromSide === 'left' ? activeTabL : activeTabR;
          if (fromTabs.length === 0) {
            fromTabs.push(createTab());
            fromAi = 0;
          } else {
            if (fromAi === evt.oldIndex) fromAi = Math.min(fromAi, fromTabs.length - 1);
            else if (fromAi > evt.oldIndex) fromAi--;
          }
          if (fromSide === 'left') activeTabL = fromAi;
          else activeTabR = fromAi;
          if (toSide === 'left') activeTabL = evt.newIndex;
          else activeTabR = evt.newIndex;
          switchTab(fromSide, fromSide === 'left' ? activeTabL : activeTabR);
          switchTab(toSide,   toSide   === 'left' ? activeTabL : activeTabR);
        }
      }
    });
  });
}
