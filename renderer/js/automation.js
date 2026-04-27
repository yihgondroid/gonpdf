// automation.js
async function buildAutomationOutput(pdfLibDoc, labels, side, splitRatio) {
  if (splitRatio === undefined) splitRatio = 0.5;
  const pageCount = pdfLibDoc.getPageCount();
  const targetLabel = side === 'answer' ? 'answer' : 'question';
  const targetIndices = [];
  for (let i = 0; i < pageCount; i++) {
    if (labels[i] === targetLabel) targetIndices.push(i);
  }
  if (targetIndices.length === 0) {
    if (side === 'answer') throw new Error('해설 페이지가 없습니다. 뱃지를 클릭해 페이지를 분류해주세요.');
    for (let i = 0; i < pageCount; i++) targetIndices.push(i);
  }

  const extracted = await PDFLib.PDFDocument.create();
  const copied = await extracted.copyPages(pdfLibDoc, targetIndices);
  copied.forEach(function(p) { extracted.addPage(p); });

  if (side === 'left' || side === 'right') {
    const allIndices = extracted.getPageIndices();
    allIndices.forEach(function(idx) {
      const page = extracted.getPage(idx);
      const size = page.getSize();
      const cropX = side === 'left' ? 0 : size.width * splitRatio;
      page.setCropBox(cropX, 0, size.width * splitRatio, size.height);
    });
  }
  return extracted;
}

async function runAutomationAll(pdfLibDoc, labels, splitRatio) {
  if (splitRatio === undefined) splitRatio = 0.5;
  const left = await buildAutomationOutput(pdfLibDoc, labels, 'left', splitRatio);
  const right = await buildAutomationOutput(pdfLibDoc, labels, 'right', splitRatio);
  const answer = await buildAutomationOutput(pdfLibDoc, labels, 'answer', splitRatio);
  return [
    { name: '문제_좌.pdf', doc: left },
    { name: '문제_우.pdf', doc: right },
    { name: '해설.pdf', doc: answer },
  ];
}

window.Automation = { buildAutomationOutput, runAutomationAll };
