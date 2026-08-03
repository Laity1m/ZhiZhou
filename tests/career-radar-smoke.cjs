const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const state = {
  version: 7,
  settings: { apiMode: 'chat', baseUrl: '', model: '', visionModel: '', searchMode: 'tavily', hasApiKey: true, hasTavilyKey: true },
  profile: { targetCompany: '示例科技', targetRole: '产品经理', jobDescription: '', priorities: '', jdAnalysis: null },
  resumes: [], conversations: [], memories: [],
  optimizedResume: { content: '', template: 'airy', accent: 'navy', font: 'clean', density: 'balanced', finish: 'soft' },
  templateCatalog: [], templateRecommendation: null,
  careerIntelligence: {
    jobSearch: {
      query: { company: '示例科技', role: '产品经理', location: '上海' },
      summary: '找到一条来自官方招聘页面的公开线索。', searchedAt: new Date().toISOString(),
      sources: [{ title: '示例科技招聘官网', url: 'https://example.com/jobs', sourceType: '官方招聘' }],
      jobs: [{ company: '示例科技', title: '产品经理', location: '上海', salary: '待核验', employmentType: '社招', publishedAt: '2026-08-01', deadline: '待核验', applyMethod: '通过招聘官网投递', applyUrl: 'https://example.com/jobs', sourceTitle: '示例科技招聘官网', sourceUrl: 'https://example.com/jobs', sourceType: '官方招聘', confidence: '高', highlights: ['负责产品策略与跨团队推进'] }],
    },
    interviewPack: {
      company: '示例科技', role: '产品经理', overview: '公开资料显示面试通常关注业务理解与跨团队协作。',
      likelyStages: ['HR 沟通（待核验）', '业务面试（待核验）'],
      hrQuestions: [{ category: '求职动机', question: '为什么选择这家公司？', frequency: '高', why: '考察动机真实性', answerPoints: ['结合产品方向和真实经历'], sourceIndexes: [1] }],
      roleQuestions: [{ category: '产品策略', question: '如何确定需求优先级？', frequency: '高', why: '考察判断框架', answerPoints: ['用户价值', '业务价值', '成本风险'], sourceIndexes: [1] }],
      writtenPractice: [{ category: '案例分析', question: '为一个新功能设计验证方案。', type: '案例', difficulty: '中等', frequency: '中', basis: '根据岗位要求原创生成', answerPoints: ['目标', '假设', '指标'], sourceIndexes: [1], original: true }],
      preparationPlan: ['整理三个真实 STAR 案例', '准备岗位相关业务分析'],
      sources: [{ title: '公开面经来源', url: 'https://example.com/interview', sourceType: '公开社区' }],
    },
  },
};

app.whenReady().then(async () => {
  ipcMain.handle('state:get', () => state);
  const window = new BrowserWindow({
    show: Boolean(process.env.RESUME_QA_RADAR_SCREENSHOT), width: 1220, height: 820,
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  try {
    await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    await window.webContents.executeJavaScript(`(async () => { document.querySelector('#skip-launch').click(); await new Promise((resolve) => setTimeout(resolve, 920)); document.querySelector('#launch-experience').classList.add('hidden'); document.querySelector('[data-view="radar"]').click(); await new Promise((resolve) => setTimeout(resolve, 80)); })()`);
    const inspect = async () => window.webContents.executeJavaScript(`(() => ({
      active: document.querySelector('#radar-view').classList.contains('active'),
      chatActive: document.querySelector('#chat-view').classList.contains('active'),
      activeNav: document.querySelector('.nav-item.active')?.dataset.view,
      jobs: document.querySelectorAll('.job-result-card').length,
      questions: document.querySelectorAll('.intel-question').length,
      scrollWidth: document.querySelector('#radar-view').scrollWidth,
      clientWidth: document.querySelector('#radar-view').clientWidth,
      formBottom: document.querySelector('#career-intel-form').getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    }))()`);
    const wide = await inspect();
    assert.equal(wide.active, true);
    assert.equal(wide.chatActive, false);
    assert.equal(wide.activeNav, 'radar');
    assert.equal(wide.jobs, 1);
    assert.ok(wide.questions >= 1);
    assert.ok(wide.scrollWidth <= wide.clientWidth + 1);
    if (process.env.RESUME_QA_RADAR_SCREENSHOT) {
      await new Promise((resolve) => setTimeout(resolve, 420));
      const screenshot = await window.webContents.capturePage();
      await fs.promises.writeFile(process.env.RESUME_QA_RADAR_SCREENSHOT, screenshot.toPNG());
    }
    await window.setSize(680, 520);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const compact = await inspect();
    assert.ok(compact.scrollWidth <= compact.clientWidth + 1);
    assert.ok(compact.formBottom > 0);
    const written = await window.webContents.executeJavaScript(`(() => { document.querySelector('[data-intel-tab="written"]').click(); return document.querySelector('#interview-results').textContent; })()`);
    assert.match(written, /原创练习/);
    console.log('Career radar responsive smoke test passed (jobs, sources, interview tabs, 680x520)');
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
});
