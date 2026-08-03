const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');

test('desktop window can shrink to compact dimensions', () => {
  assert.match(main, /minWidth:\s*680/);
  assert.match(main, /minHeight:\s*520/);
});

test('native Windows menu is hidden by default and fully localized', () => {
  assert.match(main, /autoHideMenuBar:\s*true/);
  assert.match(main, /setMenuBarVisibility\(false\)/);
  for (const label of ['文件', '编辑', '查看', '窗口', '帮助', '撤销', '复制', '粘贴', '切换全屏']) {
    assert.match(main, new RegExp(`label: '${label}'`));
  }
});

test('custom title bar replaces the generic Windows chrome', () => {
  assert.match(main, /titleBarStyle:\s*'hidden'/);
  assert.match(main, /titleBarOverlay:/);
  assert.match(html, /class="window-titlebar"/);
  assert.match(html, /界面氛围/);
  assert.match(css, /-webkit-app-region:\s*drag/);
});

test('layout has width and height breakpoints', () => {
  assert.match(css, /@media \(max-width: 1080px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-height: 720px\)/);
});

test('compact mode keeps the target profile reachable as a drawer', () => {
  assert.match(html, /id="context-toggle"/);
  assert.match(html, /id="context-panel"/);
  assert.match(css, /\.context-panel\.open/);
});

test('long conversations scroll without pushing the composer out of view', () => {
  assert.match(css, /\.main-area\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
  assert.match(css, /\.chat-layout\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
  assert.match(css, /\.chat-column\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
  assert.match(css, /\.chat-panel\s*\{[^}]*flex:\s*1\s+1\s+0[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.composer-wrap\s*\{[^}]*flex:\s*0\s+0\s+auto/);
});
