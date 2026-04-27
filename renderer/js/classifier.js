// classifier.js
function hasAnswerKeyword(text) {
  return /정답/.test(text);
}

function classifyPages(ocrResults, options) {
  if (!options) options = {};
  const minConsecutive = options.minConsecutive !== undefined ? options.minConsecutive : 2;
  const labels = {};
  const n = ocrResults.length;
  let answerStart = -1;
  let consecutive = 0;

  for (let i = 0; i < n; i++) {
    if (hasAnswerKeyword(ocrResults[i].text)) {
      consecutive++;
      if (consecutive >= minConsecutive && answerStart === -1) {
        answerStart = i - (minConsecutive - 1);
      }
    } else {
      consecutive = 0;
    }
  }

  if (answerStart === -1) {
    ocrResults.forEach(function(r) { labels[r.pageIndex] = 'unknown'; });
  } else {
    ocrResults.forEach(function(r, i) {
      labels[r.pageIndex] = i < answerStart ? 'question' : 'answer';
    });
  }
  return labels;
}

if (typeof module !== 'undefined') module.exports = { classifyPages };
if (typeof window !== 'undefined') window.Classifier = { classifyPages };
