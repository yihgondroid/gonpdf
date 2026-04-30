// 자동분류 & 자동화

function saveDoc(doc, defaultName) {
  return doc.save().then(function(bytes) {
    return window.electronAPI.saveFile(bytes, defaultName);
  });
}

function baseFilename(st) {
  return (st.filename || 'output').replace(/\.pdf$/i, '');
}

$('btn-auto-classify').addEventListener('click', async function() {
  const side = activeSide;
  const st = activeState();
  const e = sideEls(side);
  if (!st.pdfJsDoc) return;

  const btn = $('btn-auto-classify');
  btn.disabled = true;
  btn.textContent = '⏳ 분류 중...';
  $('status-info').textContent = '자동분류 중...';

  const ANSWER_KEYWORDS   = ['정답', '해설', '풀이', '답', '따라서', '이므로', '므로', '에 의하여'];
  const QUESTION_KEYWORDS = ['구하시오', '\\?'];
  const pageCount = st.pdfJsDoc.numPages;

  try {
    const pageData = [];
    for (let i = 0; i < pageCount; i++) {
      const page = await st.pdfJsDoc.getPage(i + 1);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(function(item) { return item.str; }).join('');
      let score = 0;
      ANSWER_KEYWORDS.forEach(function(kw) {
        const m = text.match(new RegExp(kw, 'g'));
        if (m) score += m.length;
      });
      let qScore = 0;
      QUESTION_KEYWORDS.forEach(function(kw) {
        const m = text.match(new RegExp(kw, 'g'));
        if (m) qScore += m.length;
      });
      const koreanCount = (text.match(/[가-힣]/g) || []).length;
      const koreanRatio = text.length > 0 ? koreanCount / text.length : 0;
      pageData.push({ len: text.length, score, qScore, koreanRatio });
    }

    const avgLen = pageData.reduce(function(s, d) { return s + d.len; }, 0) / pageCount;
    const otherThreshold = Math.max(50, avgLen * 0.15);

    let countQ = 0, countA = 0, countO = 0;
    for (let i = 0; i < pageCount; i++) {
      const { len, score, qScore, koreanRatio } = pageData[i];
      if (qScore > 0) {
        st.labels[i] = 'question'; countQ++;
      } else if (score >= 3) {
        st.labels[i] = 'answer'; countA++;
      } else if (len < otherThreshold) {
        st.labels[i] = 'other'; countO++;
      } else if (koreanRatio < 0.1) {
        st.labels[i] = 'answer'; countA++;
      } else {
        st.labels[i] = 'question'; countQ++;
      }
    }

    st.classified = true;
    enableButtons(true, true);
    window.Thumbnail.updateAllBadges(e.thumbnailList, st.labels);

    if (avgLen < 10) {
      $('status-info').textContent = '텍스트를 인식할 수 없음 (스캔 PDF는 수동분류 필요)';
    } else {
      $('status-info').textContent = '자동분류 완료 — 문제 ' + countQ + '쪽 / 해설 ' + countA + '쪽 / 기타 ' + countO + '쪽';
    }
  } catch (err) {
    showError('자동분류 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 자동분류';
  }
});

$('btn-auto-split').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  try {
    const files = [];
    const qDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'question');
    files.push({ name: base + '_문제.pdf', buffer: await qDoc.save() });
    try {
      const aDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
      files.push({ name: base + '_해설.pdf', buffer: await aDoc.save() });
    } catch (_) {}
    if (!await showSaveFilesConfirm(files)) return;
    await window.electronAPI.saveFiles(files);
    $('status-info').textContent = '저장 완료: ' + files.map(function(f) { return f.name; }).join(', ');
  } catch (err) {
    showError('문제+해설 분리 실패: ' + err.message);
  }
});

$('btn-auto-left').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  try {
    const files = [];
    const qDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'left');
    files.push({ name: base + '_문제.pdf', buffer: await qDoc.save() });
    try {
      const aDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
      files.push({ name: base + '_해설.pdf', buffer: await aDoc.save() });
    } catch (_) {}
    if (!await showSaveFilesConfirm(files)) return;
    await window.electronAPI.saveFiles(files);
    $('status-info').textContent = '저장 완료: ' + files.map(function(f) { return f.name; }).join(', ');
  } catch (err) {
    showError('문제 좌 분리 실패: ' + err.message);
  }
});

$('btn-auto-right').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  try {
    const files = [];
    const qDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'right');
    files.push({ name: base + '_문제.pdf', buffer: await qDoc.save() });
    try {
      const aDoc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
      files.push({ name: base + '_해설.pdf', buffer: await aDoc.save() });
    } catch (_) {}
    if (!await showSaveFilesConfirm(files)) return;
    await window.electronAPI.saveFiles(files);
    $('status-info').textContent = '저장 완료: ' + files.map(function(f) { return f.name; }).join(', ');
  } catch (err) {
    showError('문제 우 분리 실패: ' + err.message);
  }
});

$('btn-auto-answer').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  try {
    const doc = await window.Automation.buildAutomationOutput(st.pdfLibDoc, st.labels, 'answer');
    await saveDoc(doc, base + '_해설.pdf');
    $('status-info').textContent = base + '_해설.pdf 저장 완료';
  } catch (err) {
    showError('해설 분리 실패: ' + err.message);
  }
});

$('btn-auto-all').addEventListener('click', async function() {
  const st = activeState();
  const base = baseFilename(st);
  $('status-info').textContent = '전체 분리 처리 중...';
  try {
    const outputs = await window.Automation.runAutomationAll(st.pdfLibDoc, st.labels);
    const suffixes = ['_문제_좌', '_문제_우', '_해설'];
    const files = [];
    for (let i = 0; i < outputs.length; i++) {
      files.push({ name: base + suffixes[i] + '.pdf', buffer: await outputs[i].doc.save() });
    }
    if (!await showSaveFilesConfirm(files)) return;
    await window.electronAPI.saveFiles(files);
    $('status-info').textContent = '전체 분리 저장 완료 (파일 3개)';
  } catch (err) {
    showError('전체 분리 실패: ' + err.message);
  }
});
