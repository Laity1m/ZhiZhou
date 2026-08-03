const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const JSZip = require('jszip');
const {
  buildResumeHtml,
  cleanResumeMarkdown,
  createDocxBuffer,
  extractJsonObject,
  markdownToHtml,
  normalizeDesign,
  normalizeJdAnalysis,
} = require('../electron/resume-workflow.cjs');
const {
  calculateMatchScore,
  recommendTemplate,
} = require('../electron/template-catalog.cjs');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const photoDataUrl = `data:image/png;base64,${fs.readFileSync(path.join(root, 'assets', 'app-icon.png')).toString('base64')}`;

test('extracts structured JD JSON from fenced model output', () => {
  assert.deepEqual(extractJsonObject('```json\n{"role":"产品经理"}\n```'), { role: '产品经理' });
});

test('normalizes JD arrays and limits unsafe shapes', () => {
  const result = normalizeJdAnalysis({ requiredSkills: ['SQL', '', 42], keywords: 'not-an-array' });
  assert.deepEqual(result.requiredSkills, ['SQL', '42']);
  assert.deepEqual(result.keywords, []);
  assert.ok(result.analyzedAt);
});

test('cleans markdown fences from generated resume', () => {
  assert.equal(cleanResumeMarkdown('```markdown\n# 张三\n- 经历\n```'), '# 张三\n- 经历');
});

test('renders safe resume markdown with headings and bullets', () => {
  const rendered = markdownToHtml('# 张三\n## 经历\n- 负责 **增长**\n1. 支持 *斜体* 与 ++下划线++\n<script>alert(1)</script>');
  assert.match(rendered, /<h1>张三<\/h1>/);
  assert.match(rendered, /class="resume-header"/);
  assert.match(rendered, /class="resume-section section-experience"/);
  assert.match(rendered, /<li>负责 <strong>增长<\/strong><\/li>/);
  assert.match(rendered, /<ol>[\s\S]*<li>支持 <em>斜体<\/em> 与 <u>下划线<\/u><\/li>[\s\S]*<\/ol>/);
  assert.doesNotMatch(rendered, /<script>/);
});

test('embeds an optional resume photo in printable HTML', () => {
  const rendered = buildResumeHtml('# 张三\n联系方式', { photoDataUrl, showPhoto: true, photoShape: 'circle' });
  assert.match(rendered, /class="resume-header has-photo"/);
  assert.match(rendered, /class="resume-photo photo-circle"/);
  assert.match(rendered, /data:image\/png;base64/);
});

test('builds printable A4 HTML with selected visual template', () => {
  const rendered = buildResumeHtml('# 张三', { template: 'modern', accent: 'teal' });
  assert.match(rendered, /@page \{ size: A4/);
  assert.match(rendered, /#177b78/);
  assert.match(rendered, /border-top: 7px solid/);
});

test('applies and bounds live typography parameters to export HTML', () => {
  const design = normalizeDesign({ fontScale: 108, lineHeight: 1.68, pageMargin: 19 });
  assert.equal(design.fontScale, 108);
  assert.equal(design.lineHeight, 1.68);
  assert.equal(design.pageMargin, 19);
  const rendered = buildResumeHtml('# 张三', design);
  assert.match(rendered, /@page \{ size: A4; margin: 19mm/);
  assert.match(rendered, /line-height: 1\.68/);
  assert.equal(normalizeDesign({ fontScale: 999, lineHeight: .2, pageMargin: 2 }).fontScale, 112);
});

test('builds adapted ATS, airy, timeline, executive, sidebar, Swiss and editorial templates', () => {
  const content = '# 张三\n联系方式\n## 核心能力\n- SQL\n## 工作经历\n### 示例公司\n- 完成项目';
  for (const template of ['ats', 'airy', 'timeline', 'executive', 'sidebar', 'swiss', 'editorial']) {
    const rendered = buildResumeHtml(content, { template, accent: 'navy', font: 'song', density: 'dense' });
    assert.match(rendered, /#1f3157/);
    assert.match(rendered, /SimSun/);
  }
  assert.match(buildResumeHtml(content, { template: 'timeline' }), /resume-item::before/);
  assert.match(buildResumeHtml(content, { template: 'executive' }), /grid-template-columns: 30mm/);
  assert.match(buildResumeHtml(content, { template: 'sidebar' }), /section-skills/);
  assert.match(buildResumeHtml(content, { template: 'swiss' }), /border-left: 2\.2mm/);
  assert.match(buildResumeHtml(content, { template: 'editorial' }), /font-family: Georgia/);
  assert.match(buildResumeHtml(content, { template: 'airy', finish: 'soft' }), /finish-soft/);
  assert.match(buildResumeHtml(content, { template: 'airy' }), /border-top: 1\.1mm/);
});

test('creates editable DOCX with template-aware typography and photo', async () => {
  const buffer = await createDocxBuffer('# 张三\n## 工作经历\n### 示例公司\n- 完成 **项目**\n1. 支持 ++重点++', { template: 'executive', font: 'song', density: 'dense', photoDataUrl, showPhoto: true });
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  assert.ok(buffer.length > 2000);
  const archive = await JSZip.loadAsync(buffer);
  assert.ok(Object.keys(archive.files).some((name) => /^word\/media\//.test(name)), 'DOCX should contain an embedded photo');
});

test('recommends templates from target role without an AI call', () => {
  assert.equal(recommendTemplate({ profile: { targetRole: '高级算法工程师' } }).id, 'ats');
  assert.equal(recommendTemplate({ profile: { targetRole: '品牌视觉设计师' } }).id, 'sidebar');
  assert.equal(recommendTemplate({ profile: { targetRole: '战略总监' } }).id, 'executive');
});

test('calculates weighted JD keyword coverage locally', () => {
  const result = calculateMatchScore('熟悉 SQL 和数据分析', { requiredSkills: ['SQL', 'Python'], keywords: ['数据分析'] });
  assert.equal(result.score, 60);
  assert.deepEqual(result.matched, ['SQL', '数据分析']);
  assert.deepEqual(result.missing, ['Python']);
});

test('main process exposes JD, vision, generation and export workflows', () => {
  for (const channel of ['jd:analyze', 'resume:vision', 'photo:choose', 'photo:remove', 'photo:settings', 'draft:generate', 'draft:visual-review', 'draft:export']) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel.replace(':', '\\:')}'`));
  }
});

test('studio UI offers templates and Word/PDF export', () => {
  assert.match(html, /id="studio-view"/);
  assert.match(html, /id="resume-template"/);
  assert.match(html, /id="template-gallery"/);
  assert.match(html, /value="ats"/);
  assert.match(html, /id="toggle-visual-edit"/);
  assert.match(html, /id="visual-edit-state"/);
  assert.match(html, /id="design-presets"/);
  assert.match(html, /id="resume-scale"/);
  assert.match(html, /id="resume-line-height"/);
  assert.match(html, /id="resume-page-margin"/);
  assert.match(html, /id="choose-resume-photo"/);
  assert.match(html, /id="resume-photo-shape"/);
  assert.match(html, /id="resume-photo-visible"/);
  assert.match(html, /id="fullscreen-preview"/);
  assert.match(html, /id="resume-showcase"/);
  assert.match(html, /id="export-word"/);
  assert.match(html, /id="export-pdf"/);
});
