function text(value, limit = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function list(value, limit = 20, itemLimit = 300) {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, itemLimit))
    .filter(Boolean)
    .slice(0, limit);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeSources(value = []) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map((item) => ({
    title: text(item?.title || '公开来源', 240),
    url: safeUrl(item?.url),
    content: text(item?.content, 1600),
    publishedAt: text(item?.publishedAt, 80),
    sourceType: text(item?.sourceType || '公开网页', 80),
  })).filter((item) => item.url && !seen.has(item.url) && seen.add(item.url)).slice(0, 30);
}

function sourceFor(item, sources) {
  const index = Number(item?.sourceIndex);
  if (Number.isInteger(index) && index >= 1 && index <= sources.length) return sources[index - 1];
  const requested = safeUrl(item?.sourceUrl);
  return sources.find((source) => source.url === requested) || null;
}

function normalizeJobSearch(value = {}, sourceInput = []) {
  const sources = normalizeSources(sourceInput);
  const seen = new Set();
  const jobs = (Array.isArray(value.jobs) ? value.jobs : []).map((item) => {
    const source = sourceFor(item, sources);
    const company = text(item?.company || '公司待核验', 160);
    const title = text(item?.title || '岗位待核验', 180);
    const location = text(item?.location || '地点待核验', 120);
    const identity = `${company}|${title}|${location}`.toLowerCase();
    if (!title || seen.has(identity) || !source) return null;
    seen.add(identity);
    const requestedApplyUrl = safeUrl(item?.applyUrl);
    const applyUrl = sources.some((candidate) => candidate.url === requestedApplyUrl) ? requestedApplyUrl : source.url;
    return {
      company,
      title,
      location,
      salary: text(item?.salary || '招聘页未公开', 100),
      employmentType: text(item?.employmentType || '类型待核验', 100),
      publishedAt: text(item?.publishedAt || source.publishedAt || '日期待核验', 80),
      deadline: text(item?.deadline || '截止时间待核验', 80),
      applyMethod: text(item?.applyMethod || '通过原招聘页面投递', 240),
      applyUrl,
      sourceTitle: source.title,
      sourceUrl: source.url,
      sourceType: text(item?.sourceType || source.sourceType, 80),
      confidence: ['高', '中', '低'].includes(item?.confidence) ? item.confidence : '中',
      highlights: list(item?.highlights, 6, 180),
    };
  }).filter(Boolean).slice(0, 24);
  return {
    summary: text(value.summary || (jobs.length ? `找到 ${jobs.length} 条可核验的公开招聘线索。` : '暂未找到可核验的招聘信息。'), 1200),
    jobs,
    sources: sources.map(({ content: _content, ...source }) => source),
    searchedAt: new Date().toISOString(),
  };
}

function normalizeQuestion(item, sources, { practice = false } = {}) {
  const question = text(item?.question || item?.title, 700);
  if (!question) return null;
  const requestedSourceUrl = safeUrl(item?.sourceUrl);
  const sourceUrlIndex = requestedSourceUrl ? sources.findIndex((source) => source.url === requestedSourceUrl) + 1 : 0;
  const sourceIndexes = [...new Set([...(Array.isArray(item?.sourceIndexes) ? item.sourceIndexes : [item?.sourceIndex]), sourceUrlIndex]
    .map(Number).filter((index) => Number.isInteger(index) && index >= 1 && index <= sources.length))].slice(0, 5);
  return {
    category: text(item?.category || (practice ? '岗位能力' : '通用'), 100),
    question,
    frequency: ['高', '中', '低'].includes(item?.frequency) ? item.frequency : '中',
    why: text(item?.why || item?.reason, 500),
    answerPoints: list(item?.answerPoints, 8, 260),
    sourceIndexes,
    ...(practice ? {
      type: text(item?.type || '开放题', 80),
      difficulty: ['入门', '中等', '进阶'].includes(item?.difficulty) ? item.difficulty : '中等',
      basis: text(item?.basis || '根据公开岗位要求和历史讨论趋势生成', 360),
      original: true,
    } : {}),
  };
}

function normalizeInterviewPack(value = {}, sourceInput = []) {
  const sources = normalizeSources(sourceInput);
  const questions = (items, options) => (Array.isArray(items) ? items : [])
    .map((item) => normalizeQuestion(item, sources, options)).filter(Boolean).slice(0, 24);
  return {
    company: text(value.company, 160),
    role: text(value.role, 180),
    overview: text(value.overview, 1600),
    likelyStages: list(value.likelyStages, 10, 260),
    hrQuestions: questions(value.hrQuestions),
    roleQuestions: questions(value.roleQuestions),
    writtenPractice: questions(value.writtenPractice, { practice: true }),
    preparationPlan: list(value.preparationPlan, 12, 360),
    caveat: '内容来自公开资料的归纳与趋势推测，不代表公司当前真实题目；请以官方通知为准。',
    sources: sources.map(({ content: _content, ...source }) => source),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  normalizeInterviewPack,
  normalizeJobSearch,
  normalizeSources,
  safeUrl,
};
