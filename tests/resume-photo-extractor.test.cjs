const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeVisionPhotoDetection,
  pdfPixelsToBgra,
  portraitLikelihoodScore,
} = require('../electron/resume-photo-extractor.cjs');

test('ranks a 3:4 portrait above logos and full-page scans', () => {
  const portrait = portraitLikelihoodScore({ width: 300, height: 400, byteLength: 120_000 });
  const logo = portraitLikelihoodScore({ width: 300, height: 90, byteLength: 18_000 });
  const scan = portraitLikelihoodScore({ width: 2480, height: 3508, byteLength: 4_000_000 });
  assert.ok(portrait >= 135);
  assert.ok(portrait > logo);
  assert.ok(portrait > scan);
});

test('converts PDF.js RGB and RGBA pixels to Electron BGRA order', () => {
  assert.deepEqual([...pdfPixelsToBgra({ width: 1, height: 1, kind: 2, data: Uint8Array.from([12, 34, 56]) })], [56, 34, 12, 255]);
  assert.deepEqual([...pdfPixelsToBgra({ width: 1, height: 1, kind: 3, data: Uint8Array.from([10, 20, 30, 40]) })], [30, 20, 10, 40]);
});

test('accepts a bounded visual-model photo box and rejects page-sized regions', () => {
  const portrait = normalizeVisionPhotoDetection({
    detected: true,
    page: 1,
    confidence: 'high',
    box: { x: 0.76, y: 0.04, width: 0.15, height: 0.14 },
  });
  assert.equal(portrait.detected, true);
  assert.equal(portrait.confidence, '高');
  assert.equal(portrait.page, 1);

  const fullPage = normalizeVisionPhotoDetection({
    detected: true,
    confidence: 'high',
    box: { x: 0, y: 0, width: 1, height: 1 },
  });
  assert.equal(fullPage.detected, false);
  assert.equal(fullPage.box, null);
});

test('resume import wires local embedded-photo extraction into the finished resume', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
  assert.match(main, /extractDocxImageCandidates/);
  assert.match(main, /extractPdfImageCandidates/);
  assert.match(main, /photoDataUrl: extracted\.detectedPhoto\.photoDataUrl/);
  assert.match(main, /cropPdfVisionPhoto/);
  assert.match(renderer, /照片已带入/);
  assert.match(renderer, /自动带入新的简历成品/);
});
