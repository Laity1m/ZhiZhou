const TEMPLATE_CATALOG = [
  {
    id: 'professional',
    name: '专业经典',
    description: '稳妥的单栏结构，适合大多数岗位。',
    ats: '高',
    bestFor: '通用、产品、运营',
    rules: '保持清晰单栏、适度留白，每段经历优先保留 3–5 个有证据的要点。',
  },
  {
    id: 'airy',
    name: '轻盈单页',
    description: '用短分隔、柔和字重与自然留白建立精致感。',
    ats: '高',
    bestFor: '产品、运营、职能、应届生',
    rules: '优先控制在一页；概述不超过三句，每段经历保留 2–4 个最相关要点，避免重复句式和口号堆叠。',
    source: 'dphang/resume 与 sb2nov/resume · MIT',
    sourceUrl: 'https://github.com/dphang/resume',
  },
  {
    id: 'modern',
    name: '现代强调',
    description: '用强调色建立品牌感，层级更醒目。',
    ats: '高',
    bestFor: '互联网、市场、增长',
    rules: '职业概述要短，章节标题清楚，关键词自然出现，避免用装饰符号代替文字。',
  },
  {
    id: 'compact',
    name: '紧凑高密度',
    description: '压缩留白，容纳更丰富的真实经历。',
    ats: '高',
    bestFor: '资深候选人、技术岗位',
    rules: '优先压缩重复表述，不删关键事实；要点短句化，控制每项经历的篇幅。',
  },
  {
    id: 'ats',
    name: 'ATS 极简单栏',
    description: '机器筛选优先，标题和关键词识别稳定。',
    ats: '极高',
    bestFor: '技术、财务、法务、咨询',
    rules: '使用标准章节名和单栏阅读顺序；技能写全称，避免图标、表格和含糊缩写。',
    source: 'Reactive Resume · Meowth',
    sourceUrl: 'https://github.com/AmruthPillai/Reactive-Resume',
  },
  {
    id: 'timeline',
    name: '清晰时间轴',
    description: '突出履历发展路径和经历连续性。',
    ats: '中高',
    bestFor: '项目、运营、研发履历',
    rules: '经历标题必须含公司、岗位和时间；按时间倒序，项目成果保持短而具体。',
    source: 'Reactive Resume · Azurill',
    sourceUrl: 'https://github.com/AmruthPillai/Reactive-Resume',
  },
  {
    id: 'executive',
    name: '高管横栏',
    description: '章节标签独立成栏，沉稳且便于扫读。',
    ats: '中高',
    bestFor: '管理、战略、咨询岗位',
    rules: '突出管理范围、业务影响和决策结果；每个章节先给结论，再给证据。',
    source: 'Reactive Resume · Bronzor',
    sourceUrl: 'https://github.com/AmruthPillai/Reactive-Resume',
  },
  {
    id: 'sidebar',
    name: '创意侧栏',
    description: '技能与教育置于侧栏，视觉辨识度更强。',
    ats: '中',
    bestFor: '设计、品牌、市场、创意',
    rules: '侧栏只放短信息；核心经历仍按正常语句书写，不用图形代替技能名称。',
    source: 'Reactive Resume · Pikachu',
    sourceUrl: 'https://github.com/AmruthPillai/Reactive-Resume',
  },
  {
    id: 'swiss',
    name: '瑞士网格',
    description: '强网格、短标题和清晰分隔，兼顾作品感与扫读效率。',
    ats: '高',
    bestFor: '品牌、产品、咨询、创意技术',
    rules: '标题短而明确，成果要点保持左对齐；用结构和留白建立设计感，不用图形代替关键信息。',
    source: '原创 · 瑞士国际主义网格原则',
  },
  {
    id: 'editorial',
    name: '杂志叙事',
    description: '克制的编辑式排版，适合强调个人气质与职业故事。',
    ats: '中高',
    bestFor: '内容、传媒、品牌、高级管理',
    rules: '职业概述要有清晰主张；章节仍使用标准名称，经历按时间倒序并用可验证成果收尾。',
    source: '原创 · 编辑设计与内容优先原则',
  },
];

const TEMPLATE_IDS = new Set(TEMPLATE_CATALOG.map((template) => template.id));

function publicTemplateCatalog() {
  return TEMPLATE_CATALOG.map(({ rules: _rules, ...template }) => ({ ...template }));
}

function templatePrompt(templateId) {
  const template = TEMPLATE_CATALOG.find((item) => item.id === templateId) || TEMPLATE_CATALOG[0];
  return `当前排版模板为“${template.name}”（ATS 兼容度：${template.ats}，适用：${template.bestFor}）。内容规则：${template.rules}`;
}

function recommendTemplate({ profile = {}, resumeText = '' } = {}) {
  const role = `${profile.targetRole || ''} ${profile.jdAnalysis?.summary || ''}`.toLowerCase();
  const length = String(resumeText || '').length;
  let id = 'professional';
  let reason = '岗位信息较通用，优先使用稳妥、清晰的单栏版式。';

  if (/(设计|视觉|品牌|创意|艺术|ui|ux|creative|designer)/i.test(role)) {
    id = 'sidebar';
    reason = '目标岗位重视作品表达和视觉辨识度，侧栏版式更合适。';
  } else if (/(总监|负责人|高管|战略|咨询|管理|director|head|vp|chief|consult)/i.test(role)) {
    id = 'executive';
    reason = '目标岗位偏管理或战略，横栏结构便于突出业务影响和决策成果。';
  } else if (/(研发|工程|开发|算法|数据|财务|审计|法务|合规|engineer|developer|data|finance|legal)/i.test(role)) {
    id = 'ats';
    reason = '目标岗位通常依赖关键词筛选，ATS 极简单栏的读取稳定性更高。';
  } else if (/(产品|运营|市场|增长|人力|行政|客服|product|marketing|growth|hr)/i.test(role) && length < 6500) {
    id = 'airy';
    reason = '目标岗位需要兼顾专业感与沟通表达，轻盈单页更利于快速扫读且不会显得生硬。';
  } else if (/(项目|交付|运营|供应链|实施|project|operation|delivery)/i.test(role)) {
    id = 'timeline';
    reason = '目标岗位看重经历推进顺序，时间轴有利于展示发展路径。';
  } else if (length > 7000) {
    id = 'compact';
    reason = '原简历信息较多，紧凑版式能在保留事实的同时控制页数。';
  }

  const template = TEMPLATE_CATALOG.find((item) => item.id === id) || TEMPLATE_CATALOG[0];
  return { id: template.id, name: template.name, reason, ats: template.ats };
}

function calculateMatchScore(resumeText, analysis = {}) {
  const haystack = String(resumeText || '').toLowerCase().replace(/\s+/g, ' ');
  const unique = (values) => [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter((value) => value.length >= 2))];
  const required = unique(analysis.requiredSkills);
  const keywords = unique(analysis.keywords).filter((word) => !required.includes(word));
  const items = [
    ...required.map((word) => ({ word, weight: 2, required: true })),
    ...keywords.map((word) => ({ word, weight: 1, required: false })),
  ];
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const matchedItems = items.filter((item) => haystack.includes(item.word.toLowerCase()));
  const matchedWeight = matchedItems.reduce((sum, item) => sum + item.weight, 0);
  return {
    score: totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : 0,
    matched: matchedItems.map((item) => item.word),
    missing: items.filter((item) => !matchedItems.includes(item)).map((item) => item.word),
    evaluated: items.length,
  };
}

module.exports = {
  TEMPLATE_CATALOG,
  TEMPLATE_IDS,
  calculateMatchScore,
  publicTemplateCatalog,
  recommendTemplate,
  templatePrompt,
};
