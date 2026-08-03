const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');

test('launch experience has canvas particles, progress and a skip control', () => {
  assert.match(html, /id="launch-experience"/);
  assert.match(html, /id="launch-particles"/);
  assert.match(html, /id="skip-launch"/);
  assert.match(css, /\.launch-experience\.is-leaving/);
  assert.match(renderer, /startLaunchParticles\(\)/);
});

test('motion effects include accessibility and performance guards', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(renderer, /prefers-reduced-motion: reduce/);
  assert.match(renderer, /document\.hidden/);
  assert.match(renderer, /devicePixelRatio[^\n]*1\.6/);
  assert.match(renderer, /now - lastPaint < 34/);
});

test('import and generation use the staged process experience', () => {
  assert.match(html, /id="process-experience"/);
  assert.match(renderer, /beginProcessExperience\('import'\)/);
  assert.match(renderer, /beginProcessExperience\('generate'\)/);
  assert.match(css, /\.process-experience\[data-mode="generate"\]/);
});

test('full-window showcase supports zoom, PDF export and Escape exit', () => {
  assert.match(html, /id="showcase-zoom"/);
  assert.match(html, /id="showcase-export-pdf"/);
  assert.match(renderer, /function openShowcase\(/);
  assert.match(renderer, /event\.key === 'Escape'/);
});

test('full-screen editing uses an isolated Word-like session', () => {
  assert.match(html, /id="showcase-editor-toolbar"/);
  assert.match(html, /data-editor-command="undo"/);
  assert.match(html, /data-editor-command="bold"/);
  assert.match(html, /data-editor-command="italic"/);
  assert.match(html, /data-editor-command="underline"/);
  assert.match(html, /data-editor-command="insertOrderedList"/);
  assert.match(html, /id="editor-template"/);
  assert.match(html, /id="editor-font"/);
  assert.match(renderer, /function saveShowcaseEdits\(/);
  assert.match(renderer, /openShowcase\(\{ edit: true \}\)/);
  assert.match(css, /\.resume-showcase\.editing/);
  assert.match(css, /\.resume-preview\.showcase-editing/);
  assert.match(renderer, /autoSaveTimer/);
  assert.match(main, /render-process-gone/);
  assert.match(main, /runtime-events\.log/);
});

test('decorative interface labels use Chinese consistently', () => {
  for (const phrase of ['RESUME INTELLIGENCE', 'RESUME RESHAPE', 'AI CAREER COPILOT', 'RESUME STUDIO', 'SOURCE MATERIAL', 'LONG-TERM MEMORY', 'BRING YOUR OWN AI', 'FINAL RESUME', 'WORD 式编辑']) {
    assert.doesNotMatch(html, new RegExp(phrase));
  }
  assert.match(html, /<title>职舟<\/title>/);
  assert.match(html, /从一份简历，到理想上岸/);
  assert.doesNotMatch(html, /简历重塑/);
  assert.match(main, /关于职舟/);
  assert.match(html, /最终简历成品/);
});

test('workspace offers cinematic themes, a resume sculpture and new visual templates', () => {
  assert.match(html, /data-ui-theme-option="midnight"/);
  assert.match(html, /data-ui-theme-option="mist"/);
  assert.match(html, /data-ui-theme-option="forest"/);
  assert.match(html, /class="career-artboard"/);
  assert.match(html, /value="swiss"/);
  assert.match(html, /value="editorial"/);
  assert.match(renderer, /function applyUiTheme/);
  assert.match(renderer, /function installPointerSpotlight/);
  assert.match(css, /career-page-float/);
});
