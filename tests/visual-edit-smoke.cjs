const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const photoDataUrl = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', 'assets', 'app-icon.png')).toString('base64')}`;

const baseState = {
  version: 3,
  settings: { apiMode: 'chat', baseUrl: '', model: '', visionModel: '', searchMode: 'none', hasApiKey: false, hasTavilyKey: false },
  profile: { targetCompany: '示例科技', targetRole: '产品经理', jobDescription: '示例 JD', priorities: '', jdAnalysis: null },
  resumes: [],
  conversations: [],
  memories: [],
  optimizedResume: {
    content: '# 张三\n产品经理｜上海\n\n## 职业概述\n原来的职业概述。\n\n## 工作经历\n### 示例科技｜产品经理\n- 负责产品规划',
    template: 'ats',
    accent: 'indigo',
    font: 'clean',
    density: 'balanced',
    photoDataUrl,
    photoShape: 'rounded',
    showPhoto: true,
    visualReview: '',
    updatedAt: '',
  },
  templateCatalog: [{ id: 'ats', name: 'ATS 极简单栏', description: '测试', ats: '极高', bestFor: '产品' }],
  templateRecommendation: { id: 'ats', name: 'ATS 极简单栏', reason: '测试推荐', ats: '极高' },
};

let capturedDraft = null;

app.whenReady().then(async () => {
  ipcMain.handle('state:get', () => baseState);
  ipcMain.handle('draft:save', (_event, draft) => {
    capturedDraft = draft;
    return { ...baseState, optimizedResume: { ...baseState.optimizedResume, ...draft } };
  });
  ipcMain.handle('photo:settings', (_event, settings) => {
    Object.assign(baseState.optimizedResume, settings);
    return baseState;
  });

  const window = new BrowserWindow({
    show: Boolean(process.env.RESUME_QA_SHOW),
    width: 1100,
    height: 720,
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
    await new Promise((resolve) => setTimeout(resolve, 120));
    const result = await window.webContents.executeJavaScript(`(async () => {
      document.querySelector('#skip-launch').click();
      await new Promise((resolve) => setTimeout(resolve, 720));
      document.querySelector('[data-view="studio"]').click();
      const photoFit = document.querySelector('#resume-photo-fit');
      photoFit.value = 'contain';
      photoFit.dispatchEvent(new Event('change', { bubbles: true }));
      const photoScale = document.querySelector('#resume-photo-scale');
      photoScale.value = '125';
      photoScale.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      document.querySelector('#toggle-visual-edit').click();
      const preview = document.querySelector('#showcase-preview');
      const editorFont = document.querySelector('#editor-font');
      editorFont.value = 'song';
      editorFont.dispatchEvent(new Event('change', { bubbles: true }));
      const editorScale = document.querySelector('#editor-scale');
      editorScale.value = '105';
      editorScale.dispatchEvent(new Event('change', { bubbles: true }));
      const summary = preview.querySelector('.section-summary p');
      summary.textContent = '已经在 Word 式全屏编辑器中稳定修改。';
      preview.focus();
      const range = document.createRange();
      range.selectNodeContents(summary);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '粘贴稳定。' } });
      preview.dispatchEvent(paste);
      for (let index = 0; index < 80; index += 1) {
        preview.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '修改' }));
      }
      await new Promise((resolve) => setTimeout(resolve, 320));
      const synced = document.querySelector('#draft-editor').value;
      document.querySelector('#showcase-save').click();
      await new Promise((resolve) => setTimeout(resolve, 220));
      const showcaseHeader = document.querySelector('.showcase-toolbar').getBoundingClientRect();
      const editorRibbon = document.querySelector('#showcase-editor-toolbar').getBoundingClientRect();
      return {
        editable: preview.contentEditable,
        active: preview.classList.contains('showcase-editing'),
        showcaseVisible: !document.querySelector('#resume-showcase').classList.contains('hidden'),
        photoVisible: Boolean(preview.querySelector('.resume-photo img')),
        photoFit: getComputedStyle(preview.querySelector('.resume-photo img')).objectFit,
        photoWidth: preview.querySelector('.resume-photo').getBoundingClientRect().width,
        ribbonTools: document.querySelectorAll('[data-editor-command]').length,
        fontClass: preview.classList.contains('font-song'),
        headerHeight: showcaseHeader.height,
        ribbonBelowHeader: editorRibbon.top >= showcaseHeader.bottom - 1,
        synced,
      };
    })()`);
    assert.equal(result.editable, 'true');
    assert.equal(result.active, true);
    assert.equal(result.showcaseVisible, true);
    assert.equal(result.photoVisible, true);
    assert.equal(result.photoFit, 'contain');
    assert.ok(result.photoWidth >= 96 && result.photoWidth <= 100);
    assert.ok(result.ribbonTools >= 10);
    assert.equal(result.fontClass, true);
    assert.ok(result.headerHeight > 44);
    assert.equal(result.ribbonBelowHeader, true);
    assert.match(result.synced, /已经在 Word 式全屏编辑器中稳定修改。粘贴稳定/);
    assert.match(capturedDraft?.content || '', /已经在 Word 式全屏编辑器中稳定修改。粘贴稳定/);
    assert.equal(capturedDraft?.font, 'song');
    assert.equal(capturedDraft?.fontScale, 105);
    assert.match(capturedDraft?.photoDataUrl || '', /^data:image\/png;base64,/);
    if (process.env.RESUME_QA_EDITOR_SCREENSHOT) {
      const screenshot = await window.webContents.capturePage();
      await require('node:fs').promises.writeFile(process.env.RESUME_QA_EDITOR_SCREENSHOT, screenshot.toPNG());
    }
    window.setSize(680, 520);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const compact = await window.webContents.executeJavaScript(`(() => {
      const toolbar = document.querySelector('#showcase-editor-toolbar');
      const close = document.querySelector('#showcase-close').getBoundingClientRect();
      const stage = document.querySelector('.showcase-stage').getBoundingClientRect();
      return {
        toolbarUsable: toolbar.clientWidth <= window.innerWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(toolbar).overflowX),
        closeReachable: close.right <= window.innerWidth && close.top >= 0,
        stageHeight: stage.height,
      };
    })()`);
    assert.equal(compact.toolbarUsable, true);
    assert.equal(compact.closeReachable, true);
    assert.ok(compact.stageHeight > 180);
    console.log('Visual editing smoke test passed: full-screen editor survived rapid input and saved');
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
});
