const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeInterviewPack, normalizeJobSearch, safeUrl } = require('../electron/career-intelligence.cjs');

const sources = [
  { title: '示例公司招聘官网', url: 'https://careers.example.com/jobs/123', publishedAt: '2026-08-01', sourceType: '官方招聘', content: '产品经理，上海，官网投递。' },
  { title: '公开面经', url: 'https://community.example.com/interview/456', sourceType: '公开社区', content: '个人面试经历，仅供参考。' },
];

test('keeps only source-backed jobs and never trusts invented application URLs', () => {
  const result = normalizeJobSearch({ jobs: [
    { company: '示例公司', title: '产品经理', location: '上海', sourceIndex: 1, applyUrl: 'https://invented.example/apply', confidence: '高' },
    { company: '示例公司', title: '产品经理', location: '上海', sourceIndex: 1 },
    { company: '无来源公司', title: '不存在的岗位', sourceIndex: 99 },
  ] }, sources);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].applyUrl, sources[0].url);
  assert.equal(result.jobs[0].sourceTitle, '示例公司招聘官网');
});

test('normalizes interview evidence and marks written questions as original practice', () => {
  const pack = normalizeInterviewPack({
    company: '示例公司', role: '产品经理',
    hrQuestions: [{ question: '为什么选择我们？', sourceIndexes: [2, 99], answerPoints: ['结合真实动机'] }],
    roleQuestions: [{ question: '如何定义北极星指标？', sourceUrl: sources[1].url }],
    writtenPractice: [{ question: '为新产品设计增长实验。', difficulty: '进阶', sourceIndexes: [1] }],
  }, sources);
  assert.deepEqual(pack.hrQuestions[0].sourceIndexes, [2]);
  assert.deepEqual(pack.roleQuestions[0].sourceIndexes, [2]);
  assert.equal(pack.writtenPractice[0].original, true);
  assert.match(pack.caveat, /公开资料/);
});

test('rejects unsafe source protocols', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('file:///C:/secret.txt'), '');
  assert.equal(safeUrl('https://example.com/jobs'), 'https://example.com/jobs');
});

test('desktop app exposes the career radar workflow', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  assert.match(main, /intelligence:jobs/);
  assert.match(main, /intelligence:interview/);
  assert.match(preload, /searchJobs/);
  assert.match(preload, /buildInterviewPack/);
  assert.match(html, /id="radar-view"/);
  assert.match(html, /笔试趋势练习/);
});
