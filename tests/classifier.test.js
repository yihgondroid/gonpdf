const { classifyPages } = require('../renderer/js/classifier.js');

test('marks pages after consecutive 정답 keyword as answer', () => {
  const ocrResults = [
    { pageIndex: 0, text: '다음 중 옳은 것은?' },
    { pageIndex: 1, text: '문제 2번' },
    { pageIndex: 2, text: '정답 ① ② ③' },
    { pageIndex: 3, text: '정답 해설 4번' },
    { pageIndex: 4, text: '정답 풀이' },
  ];
  const labels = classifyPages(ocrResults, { minConsecutive: 2 });
  expect(labels[0]).toBe('question');
  expect(labels[1]).toBe('question');
  expect(labels[2]).toBe('answer');
  expect(labels[3]).toBe('answer');
  expect(labels[4]).toBe('answer');
});

test('ignores single 정답 occurrence', () => {
  const ocrResults = [
    { pageIndex: 0, text: '정답은 무엇인가?' },
    { pageIndex: 1, text: '문제 2번' },
  ];
  const labels = classifyPages(ocrResults, { minConsecutive: 2 });
  expect(labels[0]).toBe('unknown');
  expect(labels[1]).toBe('unknown');
});

test('returns unknown when no 정답 found', () => {
  const ocrResults = [
    { pageIndex: 0, text: '첫 번째 페이지' },
    { pageIndex: 1, text: '두 번째 페이지' },
  ];
  const labels = classifyPages(ocrResults, { minConsecutive: 2 });
  expect(labels[0]).toBe('unknown');
  expect(labels[1]).toBe('unknown');
});
