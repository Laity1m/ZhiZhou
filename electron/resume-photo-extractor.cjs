const crypto = require('node:crypto');
const { prepareResumePhotoImage } = require('./photo-workflow.cjs');

const MAX_CANDIDATES = 32;

function portraitLikelihoodScore({ width, height, byteLength = 0 }) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const area = w * h;
  if (w < 72 || h < 90 || area < 9000) return -1000;

  const ratio = w / h;
  const target = 3 / 4;
  let score = 100 - Math.abs(Math.log(ratio / target)) * 95;
  if (ratio >= 0.58 && ratio <= 0.92) score += 24;
  if (ratio >= 0.68 && ratio <= 0.82) score += 14;
  if (h > w) score += 10;
  if (Math.min(w, h) >= 150) score += 10;
  if (area >= 35_000 && area <= 1_000_000) score += 12;
  if (byteLength && byteLength < 6_000) score -= 28;
  if (ratio < 0.45 || ratio > 1.12) score -= 90;
  if (area > 2_400_000 || Math.max(w, h) > 2200) score -= 90;
  else if (area > 1_200_000) score -= 35;
  return Math.round(score);
}

function pdfPixelsToBgra(image) {
  const width = Math.max(0, Number(image?.width) || 0);
  const height = Math.max(0, Number(image?.height) || 0);
  const source = image?.data;
  if (!width || !height || !source) return null;
  const pixels = width * height;
  const output = Buffer.allocUnsafe(pixels * 4);

  if (image.kind === 2 && source.length >= pixels * 3) {
    for (let sourceIndex = 0, targetIndex = 0; targetIndex < output.length; sourceIndex += 3, targetIndex += 4) {
      output[targetIndex] = source[sourceIndex + 2];
      output[targetIndex + 1] = source[sourceIndex + 1];
      output[targetIndex + 2] = source[sourceIndex];
      output[targetIndex + 3] = 255;
    }
    return output;
  }
  if (image.kind === 3 && source.length >= pixels * 4) {
    for (let index = 0; index < output.length; index += 4) {
      output[index] = source[index + 2];
      output[index + 1] = source[index + 1];
      output[index + 2] = source[index];
      output[index + 3] = source[index + 3];
    }
    return output;
  }
  return null;
}

async function extractDocxImageCandidates(buffer) {
  const mammoth = require('mammoth');
  const candidates = [];
  await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const imageBuffer = Buffer.from(await image.readAsBuffer());
      if (candidates.length < MAX_CANDIDATES && imageBuffer.length <= 10 * 1024 * 1024) {
        candidates.push({
          type: 'encoded',
          buffer: imageBuffer,
          byteLength: imageBuffer.length,
          mimeType: String(image.contentType || ''),
          source: 'DOCX 内嵌图片',
        });
      }
      return { src: '' };
    }),
  });
  return candidates;
}

async function extractPdfImageCandidates(pdf, pdfjs) {
  const candidates = [];
  const seen = new Set();
  for (let pageNumber = 1; pageNumber <= Math.min(3, pdf.numPages); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const operators = await page.getOperatorList();
    for (let index = 0; index < operators.fnArray.length && candidates.length < MAX_CANDIDATES; index += 1) {
      const operation = operators.fnArray[index];
      if (![pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject].includes(operation)) continue;
      const argument = operators.argsArray[index]?.[0];
      const image = typeof argument === 'string'
        ? (page.objs.has(argument) ? page.objs.get(argument) : page.commonObjs.has(argument) ? page.commonObjs.get(argument) : null)
        : argument;
      if (!image?.data || !image.width || !image.height || ![2, 3].includes(image.kind)) continue;
      const raw = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
      const fingerprint = `${image.width}x${image.height}:${image.kind}:${crypto.createHash('sha1').update(raw).digest('hex')}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      candidates.push({
        type: 'pdf-pixels',
        data: Buffer.from(raw),
        width: image.width,
        height: image.height,
        kind: image.kind,
        byteLength: raw.length,
        source: `PDF 第 ${pageNumber} 页内嵌图片`,
      });
    }
  }
  return candidates;
}

function candidateNativeImage(nativeImage, candidate) {
  if (candidate.type === 'encoded') return nativeImage.createFromBuffer(candidate.buffer);
  if (candidate.type === 'pdf-pixels') {
    const bitmap = pdfPixelsToBgra(candidate);
    return bitmap
      ? nativeImage.createFromBitmap(bitmap, { width: candidate.width, height: candidate.height, scaleFactor: 1 })
      : nativeImage.createEmpty();
  }
  return nativeImage.createEmpty();
}

function selectLikelyResumePhoto(nativeImage, candidates) {
  const evaluated = [];
  for (const candidate of candidates || []) {
    try {
      const image = candidateNativeImage(nativeImage, candidate);
      if (image.isEmpty()) continue;
      const size = image.getSize();
      const score = portraitLikelihoodScore({ ...size, byteLength: candidate.byteLength });
      evaluated.push({ candidate, image, size, score });
    } catch {}
  }
  evaluated.sort((left, right) => right.score - left.score);
  const best = evaluated[0];
  if (!best || best.score < 110) return { photoDataUrl: '', candidateCount: evaluated.length, confidence: '未识别' };
  return {
    photoDataUrl: prepareResumePhotoImage(best.image),
    candidateCount: evaluated.length,
    confidence: best.score >= 135 ? '高' : '中',
    source: best.candidate.source,
    originalSize: best.size,
    score: best.score,
  };
}

function normalizeVisionPhotoDetection(value) {
  const source = value && typeof value === 'object' ? value : {};
  const boxSource = source.box && typeof source.box === 'object' ? source.box : {};
  const box = {
    x: Number(boxSource.x),
    y: Number(boxSource.y),
    width: Number(boxSource.width),
    height: Number(boxSource.height),
  };
  const finite = Object.values(box).every(Number.isFinite);
  const insidePage = finite
    && box.x >= 0 && box.y >= 0
    && box.width >= 0.06 && box.height >= 0.08
    && box.x + box.width <= 1.001
    && box.y + box.height <= 1.001;
  const reasonablePhotoRegion = insidePage
    && box.width <= 0.55
    && box.height <= 0.62
    && box.width * box.height <= 0.28
    && box.width / box.height >= 0.42
    && box.width / box.height <= 1.18;
  const confidenceSource = String(source.confidence || '').toLowerCase();
  const confidence = /high|高/.test(confidenceSource)
    ? '高'
    : /medium|中/.test(confidenceSource) ? '中' : '低';
  const detected = (source.detected === true || source.detected === 'true') && reasonablePhotoRegion;
  return {
    detected,
    page: Math.min(20, Math.max(1, Math.round(Number(source.page) || 1))),
    confidence,
    box: detected ? box : null,
  };
}

async function cropPdfVisionPhoto(nativeImage, filePath, value) {
  const detection = normalizeVisionPhotoDetection(value);
  if (!detection.detected || detection.confidence === '低') return '';
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = require('@napi-rs/canvas');
  const buffer = require('node:fs').readFileSync(filePath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  if (detection.page > pdf.numPages) return '';
  const page = await pdf.getPage(detection.page);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1.5, 1800 / baseViewport.width));
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const canvasContext = canvas.getContext('2d');
  await page.render({ canvasContext, viewport }).promise;

  const pageImage = nativeImage.createFromBuffer(canvas.toBuffer('image/png'));
  if (pageImage.isEmpty()) return '';
  const pageSize = pageImage.getSize();
  const marginX = detection.box.width * 0.035;
  const marginY = detection.box.height * 0.025;
  const left = Math.max(0, detection.box.x - marginX);
  const top = Math.max(0, detection.box.y - marginY);
  const right = Math.min(1, detection.box.x + detection.box.width + marginX);
  const bottom = Math.min(1, detection.box.y + detection.box.height + marginY);
  const region = {
    x: Math.floor(left * pageSize.width),
    y: Math.floor(top * pageSize.height),
    width: Math.max(1, Math.ceil((right - left) * pageSize.width)),
    height: Math.max(1, Math.ceil((bottom - top) * pageSize.height)),
  };
  region.width = Math.min(region.width, pageSize.width - region.x);
  region.height = Math.min(region.height, pageSize.height - region.y);
  const cropped = pageImage.crop(region);
  if (cropped.isEmpty()) return '';
  return prepareResumePhotoImage(cropped);
}

module.exports = {
  cropPdfVisionPhoto,
  extractDocxImageCandidates,
  extractPdfImageCandidates,
  normalizeVisionPhotoDetection,
  pdfPixelsToBgra,
  portraitLikelihoodScore,
  selectLikelyResumePhoto,
};
