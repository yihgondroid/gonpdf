const { extractTextFromCanvas } = require('../renderer/js/ocr.js');

test('extractTextFromCanvas calls Tesseract and returns text', async () => {
  const mockCanvas = {};
  const mockRecognize = jest.fn().mockResolvedValue({ data: { text: '정답 ① 2 ③' } });
  const mockWorker = {
    loadLanguage: jest.fn(),
    initialize: jest.fn(),
    recognize: mockRecognize,
    terminate: jest.fn(),
  };
  const mockTesseract = { createWorker: jest.fn().mockResolvedValue(mockWorker) };
  const text = await extractTextFromCanvas(mockCanvas, mockTesseract);
  expect(text).toBe('정답 ① 2 ③');
  expect(mockRecognize).toHaveBeenCalledWith(mockCanvas);
});
