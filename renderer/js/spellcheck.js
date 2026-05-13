// 맞춤법 검사 모듈
window.SpellCheck = (function () {
  'use strict';

  // ── 조사 교정 ──
  const WITH_CODA    = { '을':'을','를':'을','이':'이','가':'이','은':'은','는':'은','과':'과','와':'과','으로':'으로','로':'으로' };
  const WITHOUT_CODA = { '을':'를','를':'를','이':'가','가':'가','은':'는','는':'는','과':'와','와':'와','으로':'로','로':'로' };

  function correctJosa(josa, hasCoda) {
    return (hasCoda ? WITH_CODA : WITHOUT_CODA)[josa] || josa;
  }

  // ── 알파벳 종성 (영어 발음 기준) ──
  const ALPHA_CODA = { a:0,b:0,c:0,d:0,e:0,f:0,g:0,h:0,i:0,j:0,k:0,l:1,m:1,n:1,o:0,p:0,q:0,r:1,s:0,t:0,u:0,v:0,w:0,x:0,y:0,z:0 };
  const NUM_CODA   = { 0:0,1:1,2:0,3:1,4:0,5:0,6:1,7:1,8:1,9:0 };
  // 그리스 소문자 (ε = 엡실론, 받침 있음)
  const GREEK_CODA = { 'α':0,'β':0,'γ':0,'δ':0,'ε':1,'ζ':0,'η':0,'θ':0,'ι':0,'κ':0,'λ':0,'μ':0,'ν':0,'ξ':0,'ο':0,'π':0,'ρ':0,'σ':0,'τ':0,'υ':0,'φ':0,'χ':0,'ψ':0,'ω':0 };

  function checkAlphabetJosa(text) {
    const re = /([A-Za-z]+)(을|를|이|가|은|는|과|와|으로|로)/g;
    const errs = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const last = m[1][m[1].length - 1].toLowerCase();
      const coda = !!(ALPHA_CODA[last] ?? 0);
      const correct = correctJosa(m[2], coda);
      if (m[2] !== correct) {
        errs.push({ type: 'alpha', input: m[0], word: m[0], suggestion: m[1] + correct });
      }
    }
    return errs;
  }

  function formulaCoda(formula) {
    const last = formula.trim().slice(-1);
    if (/[0-9]/.test(last)) return !!(NUM_CODA[+last]);
    if (/[a-zA-Z]/.test(last)) return !!(ALPHA_CODA[last.toLowerCase()] ?? 0);
    if (GREEK_CODA[last] !== undefined) return !!GREEK_CODA[last];
    if (last === ')' || last === '²' || last === '³') return false;
    return null;
  }

  function checkFormulaJosa(text) {
    const re = /([A-Za-zα-ωΑ-Ω0-9()²³]+)(을|를|이|가|은|는|과|와|으로|로)/g;
    const errs = [], warns = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const coda = formulaCoda(m[1]);
      if (coda === null) {
        warns.push({ type: 'formula-warn', input: m[0], word: m[0], message: '수식 조사 확인 필요' });
      } else {
        const correct = correctJosa(m[2], coda);
        if (m[2] !== correct) {
          errs.push({ type: 'formula', input: m[0], word: m[0], suggestion: m[1] + correct });
        }
      }
    }
    return { errors: errs, warnings: warns };
  }

  // ── 스마트 청크 분리 ──
  const MAX_CHUNK = 1000;

  function splitSmart(text) {
    const byProb = text.split(/(?=\d{4}\s|제?\s*\d+\s*번|^\d+\.\s|^\[\d+\])/gm).filter(function (s) { return s.trim(); });
    const sections = byProb.length > 1 ? byProb : text.split(/\n\s*\n/).filter(function (s) { return s.trim(); });
    const chunks = [];
    sections.forEach(function (sec) {
      if (sec.length <= MAX_CHUNK) { chunks.push(sec); return; }
      const sents = sec.split(/(?<=[.!?])\s+|\n/);
      let cur = '';
      sents.forEach(function (s) {
        if ((cur + s).length > MAX_CHUNK) { if (cur) chunks.push(cur.trim()); cur = s; }
        else cur += (cur ? ' ' : '') + s;
      });
      if (cur) chunks.push(cur.trim());
    });
    return chunks.length ? chunks : [text.slice(0, MAX_CHUNK)];
  }

  // ── 부산대 맞춤법 API ──
  async function checkSpellingChunks(fullText) {
    const chunks = splitSmart(fullText);
    const all = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      try {
        const raw = await window.electronAPI.checkSpelling(chunk);
        const arr = Array.isArray(raw) ? raw : [];
        arr.forEach(function (item) {
          if (!Array.isArray(item.errInfo)) return;
          item.errInfo.forEach(function (e) {
            if (!e.input) return;
            all.push({
              type: 'spelling',
              input: e.input,
              word: e.input,
              suggestion: (e.candid || '').split('|')[0] || '',
            });
          });
        });
      } catch (ex) {
        console.warn('[Spell] API 청크', ci, '오류:', ex.message);
      }
      await new Promise(function (r) { setTimeout(r, 300); });
    }
    return all;
  }

  // ── 텍스트 추출 ──
  async function extractPageText(pdfJsDoc, pageIdx) {
    const page = await pdfJsDoc.getPage(pageIdx + 1);
    const tc = await page.getTextContent();
    const text = tc.items.map(function (i) { return i.str; }).join(' ');
    return { page: page, textContent: tc, text: text };
  }

  // ── 텍스트 아이템에서 오류 단어 검색 ──
  function findItems(textContent, word) {
    const idxs = [];
    textContent.items.forEach(function (item, i) {
      if (item.str && item.str.includes(word)) idxs.push(i);
    });
    return idxs;
  }

  // ── 오버레이 렌더링 ──
  function renderOverlayForPage(canvasWrap, pageIdx, errors, warnings, textContent, page, scale) {
    var pageDiv = canvasWrap.querySelector('[data-page-index="' + pageIdx + '"]');
    if (!pageDiv) return;
    var old = pageDiv.querySelector('.spell-error-layer');
    if (old) old.remove();
    if (!errors.length && !warnings.length) return;

    var vp = page.getViewport({ scale: scale });
    var layer = document.createElement('div');
    layer.className = 'spell-error-layer';
    pageDiv.appendChild(layer);

    function addMark(word, color) {
      findItems(textContent, word).forEach(function (idx) {
        var item = textContent.items[idx];
        if (!item.str.trim()) return;
        var pt = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
        var x = pt[0];
        var y = pt[1];
        var w = Math.max(6, Math.abs(item.width) * scale);
        var mk = document.createElement('div');
        mk.className = 'spell-mark';
        mk.style.left = Math.round(x) + 'px';
        mk.style.top  = Math.round(y) + 'px';
        mk.style.width = Math.round(w) + 'px';
        mk.style.background = color;
        layer.appendChild(mk);
      });
    }

    errors.forEach(function (e) { addMark(e.word, 'rgba(220,38,38,0.85)'); });
    warnings.forEach(function (w) { addMark(w.word, 'rgba(234,179,8,0.85)'); });
  }

  function clearOverlay(canvasWrap) {
    canvasWrap.querySelectorAll('.spell-error-layer').forEach(function (el) { el.remove(); });
  }

  // ── 패널 DOM 접근 ──
  function $s(id) { return document.getElementById(id); }

  function openPanel()  { $s('spell-panel').classList.add('open'); }
  function closePanel() { $s('spell-panel').classList.remove('open'); }

  // ── 상태 ──
  var _scope = 'page';
  var _checking = false;

  // ── 이벤트 바인딩 ──
  // ── 마크다운 → 평문 변환 (HWP 추출 텍스트 정리) ──
  function stripMarkdown(md) {
    return md
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^\|(.+)\|$/gm, function (row) {
        return row.split('|').filter(function (c) { return c.trim() && !/^[-: ]+$/.test(c.trim()); }).join(' ');
      })
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .trim();
  }

  document.getElementById('spell-close').addEventListener('click', closePanel);

  document.getElementById('spell-run').addEventListener('click', function () {
    if (_checking) return;
    runCheck(activeSide, _scope);
  });

  document.getElementById('spell-hwp').addEventListener('click', function () {
    if (_checking) return;
    runHwpCheck();
  });

  document.querySelectorAll('.spell-scope-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.spell-scope-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _scope = btn.dataset.scope;
    });
  });

  // ── 패널 목록 추가 ──
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function appendItems(pageIdx, errors, warnings, side) {
    var list = $s('spell-list');
    var all = errors.map(function (e) { return { item: e, warn: false }; })
      .concat(warnings.map(function (w) { return { item: w, warn: true }; }));
    all.forEach(function (entry) {
      var it = entry.item;
      var d = document.createElement('div');
      d.className = 'spell-item' + (entry.warn ? ' warn' : '');
      d.innerHTML =
        '<span class="spell-pg">p' + (pageIdx + 1) + '</span>' +
        '<span class="spell-wd">' + esc(it.input || it.word) + '</span>' +
        (it.suggestion ? ' <span class="spell-ar">→</span><span class="spell-sg">' + esc(it.suggestion) + '</span>' : '') +
        (it.message    ? ' <span class="spell-msg">' + esc(it.message) + '</span>' : '');
      d.addEventListener('click', function () { selectPage(side, pageIdx); });
      list.appendChild(d);
    });
  }

  // ── 메인 검사 ──
  async function runCheck(side, scope) {
    if (_checking) return;
    var st = sideState(side);
    if (!st || !st.pdfJsDoc) { showError('PDF 파일이 없습니다'); return; }

    _checking = true;
    var runBtn = $s('spell-run');
    runBtn.disabled = true;
    runBtn.textContent = '검사 중...';
    $s('spell-list').innerHTML = '';
    $s('spell-status').textContent = '준비 중...';
    openPanel();

    var e = sideEls(side);
    clearOverlay(e.viewerCanvasWrap);

    var idxs = scope === 'all'
      ? Array.from({ length: st.pdfJsDoc.numPages }, function (_, i) { return i; })
      : [st.currentPage];

    var totalE = 0, totalW = 0;

    for (var pi = 0; pi < idxs.length; pi++) {
      var pageIdx = idxs[pi];
      $s('spell-status').textContent = '검사 중... (' + (pageIdx + 1) + '/' + st.pdfJsDoc.numPages + '페이지)';
      try {
        var extracted = await extractPageText(st.pdfJsDoc, pageIdx);
        if (!extracted.text.trim()) continue;

        var spErrs = await checkSpellingChunks(extracted.text);
        var alErrs = checkAlphabetJosa(extracted.text);
        var foRes  = checkFormulaJosa(extracted.text);

        var errs  = spErrs.concat(alErrs).concat(foRes.errors);
        var warns = foRes.warnings;
        totalE += errs.length;
        totalW += warns.length;

        renderOverlayForPage(e.viewerCanvasWrap, pageIdx, errs, warns, extracted.textContent, extracted.page, st.scale);
        appendItems(pageIdx, errs, warns, side);
      } catch (ex) {
        console.error('[Spell] p' + pageIdx + ' 오류:', ex.message);
      }
    }

    if (totalE === 0 && totalW === 0) {
      $s('spell-status').textContent = '✓ 맞춤법 오류 없음';
    } else {
      $s('spell-status').textContent = '오류 ' + totalE + '개' + (totalW ? ' / 확인 ' + totalW + '개' : '');
    }
    runBtn.disabled = false;
    runBtn.textContent = '검사 시작';
    _checking = false;
  }

  // ── HWP/HWPX 검사 ──
  async function runHwpCheck() {
    if (_checking) return;
    _checking = true;

    var hwpBtn = $s('spell-hwp');
    var runBtn = $s('spell-run');
    hwpBtn.disabled = true;
    runBtn.disabled = true;
    $s('spell-list').innerHTML = '';
    $s('spell-status').textContent = 'HWP 파일 읽는 중...';
    openPanel();

    try {
      var result = await window.electronAPI.openHwpAndExtract();
      if (!result) {
        $s('spell-status').textContent = '';
        return;
      }

      var plainText = stripMarkdown(result.markdown);
      if (!plainText.trim()) {
        $s('spell-status').textContent = '추출된 텍스트가 없습니다';
        return;
      }

      $s('spell-status').textContent = '"' + result.filename + '" 검사 중...';

      var spErrs = await checkSpellingChunks(plainText);
      var alErrs = checkAlphabetJosa(plainText);
      var foRes  = checkFormulaJosa(plainText);

      var errs  = spErrs.concat(alErrs).concat(foRes.errors);
      var warns = foRes.warnings;

      // HWP는 페이지 구분 없이 전체 목록으로 표시 (pageIdx = -1 → "HWP"로 표시)
      var list = $s('spell-list');
      errs.concat(warns).forEach(function (item) {
        var isWarn = item.type === 'formula-warn';
        var d = document.createElement('div');
        d.className = 'spell-item' + (isWarn ? ' warn' : '');
        d.innerHTML =
          '<span class="spell-pg">HWP</span>' +
          '<span class="spell-wd">' + esc(item.input || item.word) + '</span>' +
          (item.suggestion ? ' <span class="spell-ar">→</span><span class="spell-sg">' + esc(item.suggestion) + '</span>' : '') +
          (item.message    ? ' <span class="spell-msg">' + esc(item.message) + '</span>' : '');
        list.appendChild(d);
      });

      if (errs.length === 0 && warns.length === 0) {
        $s('spell-status').textContent = '✓ 맞춤법 오류 없음';
      } else {
        $s('spell-status').textContent = '"' + result.filename + '" — 오류 ' + errs.length + '개' + (warns.length ? ' / 확인 ' + warns.length + '개' : '');
      }
    } catch (ex) {
      $s('spell-status').textContent = '오류: ' + ex.message;
      console.error('[Spell HWP]', ex);
    } finally {
      hwpBtn.disabled = false;
      runBtn.disabled = false;
      _checking = false;
    }
  }

  return { runCheck: runCheck, clearOverlay: clearOverlay, openPanel: openPanel, closePanel: closePanel };
})();
