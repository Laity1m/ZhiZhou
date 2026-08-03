const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

if (process.env.RESUME_QA_SHOW) app.commandLine.appendSwitch('force-prefers-reduced-motion', 'no-preference');

const baseState = {
  version: 4,
  settings: { apiMode: 'chat', baseUrl: '', model: '', visionModel: '', searchMode: 'none', hasApiKey: false, hasTavilyKey: false },
  profile: { targetCompany: '示例科技', targetRole: '品牌产品经理', jobDescription: '完整示例招聘需求', priorities: '', jdAnalysis: null },
  resumes: [],
  conversations: [],
  memories: [],
  optimizedResume: {
    content: '# 张三\n产品经理｜上海\n\n## 职业概述\n8 年产品经验。\n\n## 工作经历\n### 示例科技｜产品经理\n- 推动核心产品升级',
    template: 'professional', accent: 'indigo', font: 'clean', density: 'balanced',
    fontScale: 100, lineHeight: 1.52, pageMargin: 16, visualReview: '', updatedAt: '',
  },
  templateCatalog: [
    { id: 'professional', name: '专业经典', description: '测试', ats: '高', bestFor: '通用' },
    { id: 'modern', name: '现代强调', description: '测试', ats: '高', bestFor: '品牌' },
    { id: 'ats', name: 'ATS 极简单栏', description: '测试', ats: '极高', bestFor: '技术' },
    { id: 'executive', name: '高管横栏', description: '测试', ats: '中高', bestFor: '管理' },
    { id: 'swiss', name: '瑞士网格', description: '测试', ats: '高', bestFor: '品牌、产品' },
    { id: 'editorial', name: '杂志叙事', description: '测试', ats: '中高', bestFor: '内容、管理' },
  ],
  templateRecommendation: { id: 'professional', name: '专业经典', reason: '测试推荐', ats: '高' },
};

app.whenReady().then(async () => {
  ipcMain.handle('state:get', () => baseState);
  const window = new BrowserWindow({
    show: Boolean(process.env.RESUME_QA_SHOW),
    width: 1360,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    await new Promise((resolve) => setTimeout(resolve, 260));
    const launch = await window.webContents.executeJavaScript(`({
      visible: !document.querySelector('#launch-experience').classList.contains('hidden'),
      canvasWidth: document.querySelector('#launch-particles').width,
      status: document.querySelector('#launch-status').textContent,
      title: document.title,
      brand: document.querySelector('.launch-brand h1').textContent,
      slogan: document.querySelector('.launch-footnote').textContent,
    })`);
    assert.equal(launch.visible, true);
    assert.ok(launch.canvasWidth > 0);
    assert.ok(launch.status.length > 4);
    assert.equal(launch.title, '职舟');
    assert.equal(launch.brand, '职舟');
    assert.equal(launch.slogan, '从一份简历，到理想上岸');

    if (process.env.RESUME_QA_SCREENSHOT) {
      const screenshot = await window.webContents.capturePage();
      await require('node:fs').promises.writeFile(process.env.RESUME_QA_SCREENSHOT, screenshot.toPNG());
    }

    await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('#skip-launch').click();
      await new Promise((resolve) => setTimeout(resolve, 920));
    })()`);
    if (process.env.RESUME_QA_HOME_SCREENSHOT) {
      const screenshot = await window.webContents.capturePage();
      await require('node:fs').promises.writeFile(process.env.RESUME_QA_HOME_SCREENSHOT, screenshot.toPNG());
    }

    const studio = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('[data-view="studio"]').click();
      document.querySelector('[data-design-preset="brand"]').click();
      const lineHeight = document.querySelector('#resume-line-height');
      lineHeight.value = '168';
      lineHeight.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      return {
        splashHidden: document.querySelector('#launch-experience').classList.contains('hidden'),
        template: document.querySelector('#resume-template').value,
        font: document.querySelector('#resume-font').value,
        lineHeightLabel: document.querySelector('#resume-line-height-value').textContent,
        titlebarVisible: document.querySelector('.window-titlebar').getBoundingClientRect().height > 30,
        themeOptions: document.querySelectorAll('[data-ui-theme-option]').length,
        templateCards: document.querySelectorAll('[data-template-card]').length,
      };
    })()`);

    if (process.env.RESUME_QA_STUDIO_SCREENSHOT) {
      const screenshot = await window.webContents.capturePage();
      await require('node:fs').promises.writeFile(process.env.RESUME_QA_STUDIO_SCREENSHOT, screenshot.toPNG());
    }

    const result = await window.webContents.executeJavaScript(`(async () => {
      const preview = document.querySelector('#resume-preview');
      document.querySelector('#fullscreen-preview').click();
      await new Promise((resolve) => setTimeout(resolve, ${process.env.RESUME_QA_SHOW ? 850 : 60}));
      const showcase = document.querySelector('#resume-showcase');
      const data = {
        previewLineHeight: preview.style.getPropertyValue('--resume-line-height'),
        showcaseVisible: !showcase.classList.contains('hidden'),
        showcaseContent: document.querySelector('#showcase-preview').textContent,
      };
      return data;
    })()`);

    if (process.env.RESUME_QA_SHOWCASE_SCREENSHOT) {
      const screenshot = await window.webContents.capturePage();
      await require('node:fs').promises.writeFile(process.env.RESUME_QA_SHOWCASE_SCREENSHOT, screenshot.toPNG());
    }
    const showcaseClosed = await window.webContents.executeJavaScript(`(() => {
      document.querySelector('#showcase-close').click();
      return document.querySelector('#resume-showcase').classList.contains('hidden');
    })()`);

    assert.equal(studio.splashHidden, true);
    assert.equal(studio.template, 'swiss');
    assert.equal(studio.font, 'modern');
    assert.equal(studio.lineHeightLabel, '1.68');
    assert.equal(studio.titlebarVisible, true);
    assert.equal(studio.themeOptions, 3);
    assert.ok(studio.templateCards >= 6);
    assert.equal(result.previewLineHeight, '1.68');
    assert.equal(result.showcaseVisible, true);
    assert.match(result.showcaseContent, /张三/);
    assert.equal(showcaseClosed, true);
    console.log('Immersive experience smoke test passed: splash, preset, live controls and showcase');
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
});
