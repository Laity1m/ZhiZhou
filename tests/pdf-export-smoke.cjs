const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');
const { prepareResumePhoto } = require('../electron/photo-workflow.cjs');
const { buildResumeHtml } = require('../electron/resume-workflow.cjs');

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const content = '# 张三\n高级产品经理｜上海｜13800000000\n\n## 职业概述\n8 年产品经验。\n\n## 核心能力\n- 产品策略\n- 数据分析\n\n## 工作经历\n### 示例科技｜高级产品经理｜2022–至今\n- 负责产品规划并推动跨团队交付\n- 根据用户反馈优化核心流程\n\n## 项目经历\n### 增长平台\n- 建立指标体系\n\n## 教育经历\n某大学｜本科';
    const photoDataUrl = prepareResumePhoto(nativeImage, path.join(__dirname, '..', 'assets', 'app-icon.png'));
    const preparedPhoto = nativeImage.createFromDataURL(photoDataUrl);
    assert.deepEqual(preparedPhoto.getSize(), { width: 450, height: 600 });
    let totalBytes = 0;
    const templates = ['professional', 'airy', 'modern', 'compact', 'ats', 'timeline', 'executive', 'sidebar', 'swiss', 'editorial'];
    for (const [index, template] of templates.entries()) {
      const html = buildResumeHtml(content, { template, accent: 'indigo', font: 'clean', density: 'balanced', finish: index % 3 === 0 ? 'crisp' : 'soft', photoDataUrl, showPhoto: true, photoShape: ['portrait', 'rounded', 'circle'][index % 3] });
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const metrics = await window.webContents.executeJavaScript('({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })');
      assert.ok(metrics.scrollWidth <= metrics.width + 1, `${template} template overflows horizontally`);
      const pdf = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
      assert.ok(pdf.length > 2000);
      totalBytes += pdf.length;
    }
    console.log(`PDF export smoke test passed for ${templates.length} templates (${totalBytes} total bytes)`);
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
});
