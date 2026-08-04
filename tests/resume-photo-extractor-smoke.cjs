const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');
const { prepareResumePhoto } = require('../electron/photo-workflow.cjs');
const { createDocxBuffer } = require('../electron/resume-workflow.cjs');
const {
  cropPdfVisionPhoto,
  extractDocxImageCandidates,
  extractPdfImageCandidates,
  selectLikelyResumePhoto,
} = require('../electron/resume-photo-extractor.cjs');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let previewWindow;
  let temporaryPdf = '';
  try {
    const photoDataUrl = prepareResumePhoto(nativeImage, path.join(__dirname, '..', 'assets', 'app-icon.png'));

    const docx = await createDocxBuffer('# 示例用户\n\n## 工作经历\n- 自动化测试', {
      template: 'professional',
      photoDataUrl,
      photoShape: 'rounded',
      showPhoto: true,
    });
    const docxCandidates = await extractDocxImageCandidates(docx);
    const docxPhoto = selectLikelyResumePhoto(nativeImage, docxCandidates);
    assert.match(docxPhoto.photoDataUrl, /^data:image\/jpeg;base64,/);

    previewWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<h1>示例简历</h1><img src="${photoDataUrl}" style="width:120px;height:160px">`)}`);
    const pdfBuffer = await previewWindow.webContents.printToPDF({ printBackground: true });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), disableWorker: true }).promise;
    const pdfCandidates = await extractPdfImageCandidates(pdf, pdfjs);
    const pdfPhoto = selectLikelyResumePhoto(nativeImage, pdfCandidates);
    assert.match(pdfPhoto.photoDataUrl, /^data:image\/jpeg;base64,/);

    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<style>@page{size:A4;margin:0}html,body{margin:0;width:794px;height:1123px}img{position:absolute;left:600px;top:45px;width:120px;height:160px}</style><img src="${photoDataUrl}">`)}`);
    const flattenedPdf = await previewWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    temporaryPdf = path.join(app.getPath('temp'), `zhizhou-photo-smoke-${process.pid}.pdf`);
    fs.writeFileSync(temporaryPdf, flattenedPdf);
    const visionPhoto = await cropPdfVisionPhoto(nativeImage, temporaryPdf, {
      detected: true,
      page: 1,
      confidence: 'high',
      box: { x: 600 / 794, y: 45 / 1123, width: 120 / 794, height: 160 / 1123 },
    });
    assert.match(visionPhoto, /^data:image\/jpeg;base64,/);

    console.log(`Resume photo smoke test passed (DOCX ${docxCandidates.length}, PDF ${pdfCandidates.length}, visual crop yes)`);
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (temporaryPdf) try { fs.unlinkSync(temporaryPdf); } catch {}
    if (previewWindow && !previewWindow.isDestroyed()) previewWindow.destroy();
  }
});
