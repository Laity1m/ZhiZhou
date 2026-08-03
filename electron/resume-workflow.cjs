const { TEMPLATE_IDS } = require('./template-catalog.cjs');

const ACCENT_COLORS = {
  indigo: '#4f5fd2',
  navy: '#1f3157',
  teal: '#177b78',
  burgundy: '#8d3346',
};

const FONT_STACKS = {
  clean: '"Microsoft YaHei UI", "Segoe UI", sans-serif',
  modern: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
  song: '"Songti SC", "SimSun", serif',
};

const DENSITIES = {
  relaxed: { fontSize: 10.7, lineHeight: 1.62, sectionGap: 18, pageMargin: 17 },
  balanced: { fontSize: 10.2, lineHeight: 1.52, sectionGap: 15, pageMargin: 16 },
  dense: { fontSize: 9.5, lineHeight: 1.4, sectionGap: 11, pageMargin: 13 },
};

const FINISHES = new Set(['soft', 'crisp', 'editorial']);

function extractJsonObject(value) {
  const source = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(source); } catch {}
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(source.slice(start, end + 1)); } catch {}
  }
  throw new Error('AI 没有返回可识别的结构化结果，请重试或换用能力更强的模型。');
}

function stringList(value, limit = 20) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeJdAnalysis(value = {}) {
  return {
    summary: String(value.summary || '').trim().slice(0, 1200),
    seniority: String(value.seniority || '').trim().slice(0, 120),
    responsibilities: stringList(value.responsibilities),
    requiredSkills: stringList(value.requiredSkills),
    preferredSkills: stringList(value.preferredSkills),
    keywords: stringList(value.keywords, 30),
    evidenceGaps: stringList(value.evidenceGaps),
    analyzedAt: new Date().toISOString(),
  };
}

function cleanResumeMarkdown(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .slice(0, 60000);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

function sectionType(value) {
  const title = String(value || '').toLowerCase();
  if (/(概述|简介|优势|summary|profile|objective)/i.test(title)) return 'summary';
  if (/(技能|能力|专长|skill|competenc)/i.test(title)) return 'skills';
  if (/(工作|实习|任职|经历|experience|employment|work)/i.test(title)) return 'experience';
  if (/(项目|案例|project|portfolio)/i.test(title)) return 'projects';
  if (/(教育|学历|education|academic)/i.test(title)) return 'education';
  if (/(证书|认证|荣誉|奖项|语言|certif|award|language)/i.test(title)) return 'certifications';
  return 'general';
}

function markdownToHtml(value) {
  const lines = cleanResumeMarkdown(value).split(/\r?\n/);
  const output = [];
  let listOpen = false;
  let listType = 'ul';
  let headerOpen = false;
  let bodyOpen = false;
  let sectionOpen = false;
  let itemOpen = false;
  const closeList = () => {
    if (listOpen) output.push(`</${listType}>`);
    listOpen = false;
  };
  const closeItem = () => {
    closeList();
    if (itemOpen) output.push('</div>');
    itemOpen = false;
  };
  const closeSection = () => {
    closeItem();
    if (sectionOpen) output.push('</section>');
    sectionOpen = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      if (level === 1) {
        closeSection();
        if (bodyOpen) { output.push('</div>'); bodyOpen = false; }
        if (!headerOpen) { output.push('<header class="resume-header">'); headerOpen = true; }
        output.push(`<h1>${inlineMarkdown(heading[2])}</h1>`);
      } else if (level === 2) {
        if (headerOpen) { closeList(); output.push('</header>'); headerOpen = false; }
        closeSection();
        if (!bodyOpen) { output.push('<div class="resume-body">'); bodyOpen = true; }
        const type = sectionType(heading[2]);
        output.push(`<section class="resume-section section-${type}" data-section-type="${type}"><h2>${inlineMarkdown(heading[2])}</h2>`);
        sectionOpen = true;
      } else {
        if (!bodyOpen && headerOpen) { output.push('</header><div class="resume-body">'); headerOpen = false; bodyOpen = true; }
        if (!sectionOpen) { output.push('<section class="resume-section section-general" data-section-type="general">'); sectionOpen = true; }
        closeItem();
        output.push(`<div class="resume-item"><h3>${inlineMarkdown(heading[2])}</h3>`);
        itemOpen = true;
      }
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const nextListType = numbered ? 'ol' : 'ul';
      if (listOpen && listType !== nextListType) closeList();
      if (!listOpen) { listType = nextListType; output.push(`<${listType}>`); listOpen = true; }
      output.push(`<li>${inlineMarkdown((numbered || bullet)[1])}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeSection();
  if (headerOpen) output.push('</header>');
  if (bodyOpen) output.push('</div>');
  return output.join('\n');
}

function normalizeDesign(options = {}) {
  const template = TEMPLATE_IDS.has(options.template) ? options.template : 'professional';
  const accentKey = Object.hasOwn(ACCENT_COLORS, options.accent) ? options.accent : 'indigo';
  const font = Object.hasOwn(FONT_STACKS, options.font) ? options.font : 'clean';
  const density = Object.hasOwn(DENSITIES, options.density) ? options.density : 'balanced';
  const finish = FINISHES.has(options.finish) ? options.finish : 'soft';
  const metrics = DENSITIES[density];
  const inRange = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const photoDataUrl = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(String(options.photoDataUrl || '')) && String(options.photoDataUrl).length <= 3000000
    ? String(options.photoDataUrl)
    : '';
  return {
    template,
    accent: accentKey,
    color: ACCENT_COLORS[accentKey],
    font,
    fontStack: FONT_STACKS[font],
    density,
    finish,
    fontScale: inRange(options.fontScale, 90, 112, 100),
    lineHeight: inRange(options.lineHeight, 1.35, 1.75, metrics.lineHeight),
    pageMargin: inRange(options.pageMargin, 10, 20, metrics.pageMargin),
    photoDataUrl,
    photoShape: ['portrait', 'rounded', 'circle'].includes(options.photoShape) ? options.photoShape : 'rounded',
    showPhoto: Boolean(options.showPhoto && photoDataUrl),
    metrics,
  };
}

function buildResumeHtml(content, options = {}) {
  const design = normalizeDesign(options);
  const compact = design.template === 'compact' || design.density === 'dense';
  const modern = design.template === 'modern';
  const metrics = design.metrics;
  const scale = design.fontScale / 100;
  const fontSize = (compact ? 9.5 : metrics.fontSize) * scale;
  const photoHtml = design.showPhoto
    ? `<figure class="resume-photo photo-${design.photoShape}"><img src="${design.photoDataUrl}" alt="简历照片"></figure>`
    : '';
  const baseResumeHtml = markdownToHtml(content);
  const resumeHtml = design.showPhoto
    ? baseResumeHtml.includes('<header class="resume-header">')
      ? baseResumeHtml.replace('<header class="resume-header">', `<header class="resume-header has-photo">${photoHtml}`)
      : `<header class="resume-header has-photo">${photoHtml}</header>${baseResumeHtml}`
    : baseResumeHtml;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: ${design.pageMargin}mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: white; color: #202331; font-family: ${design.fontStack}; font-size: ${fontSize.toFixed(2)}pt; line-height: ${design.lineHeight}; }
    main { width: 100%; }
    .resume-header { margin-bottom: ${metrics.sectionGap}px; }
    .resume-header.has-photo { position: relative; min-height: 32mm; padding-right: 31mm; }
    .resume-photo { position: absolute; top: 0; right: 0; width: 25mm; height: 32mm; margin: 0; overflow: hidden; border: 1px solid #d8dbe4; border-radius: 1.5mm; background: #f2f3f7; }
    .resume-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .resume-photo.photo-rounded { border-radius: 3mm; }.resume-photo.photo-circle { width: 25mm; height: 25mm; border-radius: 50%; }
    .resume-body { display: block; }
    .resume-section { break-inside: auto; }
    .resume-item { break-inside: avoid; }
    h1 { margin: 0 0 5px; color: ${modern ? design.color : '#171a28'}; font-size: ${((compact ? 22 : 27) * scale).toFixed(2)}pt; line-height: 1.12; letter-spacing: .02em; }
    h2 { margin: ${compact ? '11px' : `${metrics.sectionGap}px`} 0 7px; padding-bottom: 4px; color: ${design.color}; font-size: ${((compact ? 12 : 13) * scale).toFixed(2)}pt; border-bottom: ${modern ? `2px solid ${design.color}` : '1px solid #dfe2ea'}; page-break-after: avoid; }
    h3 { margin: 9px 0 3px; font-size: ${((compact ? 10.4 : 11.2) * scale).toFixed(2)}pt; color: #252a3c; page-break-after: avoid; }
    p { margin: 3px 0 6px; }
    ul, ol { margin: 3px 0 8px; padding-left: 18px; }
    li { margin: 2px 0; padding-left: 2px; }
    strong { color: #161a29; }
    ${modern ? `main { border-top: 7px solid ${design.color}; padding-top: 13px; }` : ''}
    ${design.template === 'ats' ? `
      body { color: #171717; }
      h1 { font-family: ${design.fontStack}; font-size: ${(25 * scale).toFixed(2)}pt; }
      h2 { margin-top: 14px; color: ${design.color}; border-bottom: 1.5px solid ${design.color}; text-transform: uppercase; letter-spacing: .035em; }
      .resume-header p { display: inline; margin-right: 12px; }
    ` : ''}
    ${design.template === 'timeline' ? `
      .resume-header { text-align: center; }
      .resume-header.has-photo { padding-left: 31mm; }
      .resume-header h1 { color: #171a28; }
      .resume-header p { display: inline; margin: 0 6px; }
      h2 { border: 0; padding: 0; }
      .resume-item { position: relative; margin-left: 7px; padding: 0 0 7px 18px; border-left: 1px solid ${design.color}; }
      .resume-item::before { content: ""; position: absolute; left: -4px; top: 11px; width: 7px; height: 7px; border-radius: 50%; border: 1px solid ${design.color}; background: white; }
    ` : ''}
    ${design.template === 'executive' ? `
      .resume-header { text-align: center; }
      .resume-header.has-photo { padding-left: 31mm; }
      .resume-header p { display: inline; margin: 0 7px; }
      .resume-section { display: grid; grid-template-columns: 30mm minmax(0, 1fr); column-gap: 7mm; border-top: 1px solid #777; padding-top: 7px; margin-top: 12px; }
      .resume-section h2 { grid-column: 1; margin: 0; padding: 0; border: 0; font-size: ${(11.5 * scale).toFixed(2)}pt; color: ${design.color}; }
      .resume-section > :not(h2) { grid-column: 2; }
      .resume-section .resume-item { margin-bottom: 5px; }
    ` : ''}
    ${design.template === 'sidebar' ? `
      .resume-header { color: white; background: ${design.color}; border-radius: 9px; padding: 13px 16px; }
      .resume-header.has-photo { padding-right: 32mm; }
      .resume-header h1, .resume-header strong { color: white; }
      .resume-header p { display: inline; margin-right: 10px; }
      .resume-body { display: grid; grid-template-columns: minmax(0, 30%) minmax(0, 1fr); gap: 0 8mm; align-items: start; }
      .resume-section { grid-column: 2; }
      .section-skills, .section-education, .section-certifications { grid-column: 1; }
      .section-summary { grid-row: 1; }
      .section-skills { grid-row: 1; }
      .section-experience { grid-row: 2; }
      .section-education { grid-row: 2; }
      .section-projects { grid-row: 3; }
      .section-certifications { grid-row: 3; }
      h2 { font-size: ${(12 * scale).toFixed(2)}pt; border-bottom-color: ${design.color}; }
    ` : ''}
    ${design.template === 'swiss' ? `
      .resume-header { padding-left: 5mm; border-left: 2.2mm solid ${design.color}; }
      .resume-header.has-photo { padding-right: 31mm; }
      h1 { color: #171a28; font-family: "Microsoft YaHei", "Segoe UI", sans-serif; font-weight: 750; letter-spacing: -.025em; }
      h2 { display: flex; align-items: center; gap: 3mm; padding: 0; border: 0; font-size: ${(11.5 * scale).toFixed(2)}pt; letter-spacing: .12em; text-transform: uppercase; }
      h2::after { content: ""; height: 1px; flex: 1; background: ${design.color}; opacity: .52; }
    ` : ''}
    ${design.template === 'editorial' ? `
      .resume-header { padding: 4mm 0; text-align: center; border-top: 1px solid #202331; border-bottom: 1px solid #202331; }
      .resume-header.has-photo { padding-left: 31mm; padding-right: 31mm; }
      .resume-header p { display: inline; margin: 0 6px; }
      h1 { color: #171a28; font-family: Georgia, "Songti SC", serif; font-size: ${(30 * scale).toFixed(2)}pt; font-weight: 500; letter-spacing: .02em; }
      h2 { margin-top: ${compact ? '13px' : '20px'}; padding: 0 0 5px; border: 0; text-align: center; letter-spacing: .14em; }
      h2::before, h2::after { content: ""; display: inline-block; width: 9mm; height: 1px; margin: 0 3mm 1mm; background: ${design.color}; }
    ` : ''}
    ${design.template === 'airy' ? `
      .resume-header { margin-bottom: 6mm; padding-top: 4.5mm; border-top: 1.1mm solid ${design.color}; }
      .resume-header.has-photo { padding-top: 4.5mm; }
      .resume-header h1 { color: #20242d; font-family: ${design.fontStack}; font-size: ${(25 * scale).toFixed(2)}pt; font-weight: 650; letter-spacing: -.025em; }
      .resume-header p { color: #626975; font-size: .93em; }
      h2 { display: flex; align-items: center; gap: 3mm; margin-top: ${compact ? '13px' : '19px'}; padding: 0; border: 0; color: ${design.color}; font-size: ${(11.6 * scale).toFixed(2)}pt; font-weight: 650; letter-spacing: .1em; }
      h2::after { content: ""; width: 11mm; height: 1px; background: ${design.color}; opacity: .4; }
      h3 { color: #2a2f38; font-weight: 650; }
      li::marker { color: ${design.color}; }
      .section-summary p { max-width: 96%; color: #424852; }
    ` : ''}
    ${design.finish === 'soft' ? `
      body { color: #30343d; }
      .resume-header h1 { font-weight: 650; letter-spacing: -.018em; }
      .resume-header p { color: #656b76; }
      h3 { color: #2d323c; font-weight: 650; }
      li::marker { color: ${design.color}; }
      strong { color: #242933; }
      p, li { text-wrap: pretty; }
    ` : ''}
    ${design.finish === 'soft' && !['airy', 'timeline', 'executive', 'sidebar', 'swiss', 'editorial'].includes(design.template) ? `
      h1 { font-size: ${((compact ? 21 : 25) * scale).toFixed(2)}pt; }
      h2 { display: flex; align-items: center; gap: 2.5mm; margin-top: ${compact ? '13px' : '19px'}; padding: 0; border: 0; font-size: ${((compact ? 11.4 : 12.2) * scale).toFixed(2)}pt; letter-spacing: .055em; }
      h2::before { content: ""; width: 3.5mm; height: 1mm; border-radius: 2mm; background: ${design.color}; opacity: .82; }
      .resume-header { margin-bottom: ${metrics.sectionGap + 3}px; }
    ` : ''}
    ${design.finish === 'editorial' && design.template !== 'editorial' ? `
      .resume-header h1 { font-family: Georgia, "Songti SC", SimSun, serif; font-weight: 500; letter-spacing: .015em; }
      h2 { border-bottom: 0; letter-spacing: .1em; }
      h2::after { content: ""; display: inline-block; width: 10mm; height: 1px; margin: 0 0 1mm 3mm; background: ${design.color}; opacity: .5; }
    ` : ''}
  </style></head><body class="template-${design.template} finish-${design.finish}"><main>${resumeHtml}</main></body></html>`;
}

async function createDocxBuffer(content, options = {}) {
  const {
    AlignmentType, BorderStyle, Document, HeadingLevel, HorizontalPositionAlign,
    HorizontalPositionRelativeFrom, ImageRun, Packer, Paragraph, TextRun,
    TextWrappingSide, TextWrappingType, VerticalPositionAlign, VerticalPositionRelativeFrom,
  } = require('docx');
  const design = normalizeDesign(options);
  const accent = design.color.replace('#', '');
  const centeredHeader = ['timeline', 'executive', 'editorial'].includes(design.template);
  const compact = design.template === 'compact' || design.density === 'dense';
  const paragraphAfter = design.density === 'relaxed' ? 90 : design.density === 'dense' ? 45 : 70;
  const lineSpacing = Math.round(design.lineHeight * 240);
  const fontSize = Math.round(((compact ? 19 : 21) * design.fontScale) / 100);
  const pageMargin = Math.round(design.pageMargin * 56.7);
  const softFinish = design.finish === 'soft';
  const photoBuffer = design.showPhoto ? Buffer.from(design.photoDataUrl.split(',')[1], 'base64') : null;
  const photoType = design.photoDataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
  const textRuns = (value, base = {}) => {
    const source = String(value || '');
    const runs = [];
    const pattern = /(\*\*[^*]+\*\*|\+\+[^+]+\+\+|\*[^*]+\*)/g;
    let cursor = 0;
    for (const match of source.matchAll(pattern)) {
      if (match.index > cursor) runs.push(new TextRun({ ...base, text: source.slice(cursor, match.index) }));
      const token = match[0];
      if (token.startsWith('**')) runs.push(new TextRun({ ...base, text: token.slice(2, -2), bold: true }));
      else if (token.startsWith('++')) runs.push(new TextRun({ ...base, text: token.slice(2, -2), underline: {} }));
      else runs.push(new TextRun({ ...base, text: token.slice(1, -1), italics: true }));
      cursor = match.index + token.length;
    }
    if (cursor < source.length) runs.push(new TextRun({ ...base, text: source.slice(cursor) }));
    return runs.length ? runs : [new TextRun({ ...base, text: source })];
  };
  const paragraphs = [];
  for (const rawLine of cleanResumeMarkdown(content).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { paragraphs.push(new Paragraph({ spacing: { after: 80 } })); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length === 1 ? HeadingLevel.TITLE : heading[1].length === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
      const headingSize = Math.round((heading[1].length === 1 ? (compact ? 42 : softFinish ? 49 : 54) : heading[1].length === 2 ? (compact ? 23 : softFinish ? 24 : 26) : (compact ? 21 : 22)) * design.fontScale / 100);
      const children = textRuns(heading[2], { bold: true, size: headingSize, color: heading[1].length === 1 ? '171A28' : accent });
      if (heading[1].length === 1 && photoBuffer) {
        children.push(new ImageRun({
          type: photoType,
          data: photoBuffer,
          transformation: { width: 75, height: 100 },
          altText: { title: '简历照片', description: '用户选择的简历照片', name: 'resume-photo' },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, align: VerticalPositionAlign.TOP },
            wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.LEFT },
            margins: { left: 180, bottom: 100 },
          },
        }));
      }
      paragraphs.push(new Paragraph({
        children,
        heading: level,
        alignment: heading[1].length === 1 && centeredHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        border: heading[1].length === 2 && design.finish === 'crisp' && ['modern', 'ats', 'executive', 'swiss'].includes(design.template)
          ? { bottom: { color: accent, style: BorderStyle.SINGLE, size: design.template === 'modern' ? 10 : 6, space: 3 } }
          : undefined,
        spacing: { before: compact ? 120 : 170, after: compact ? 55 : 80, line: lineSpacing },
        keepNext: true,
      }));
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      paragraphs.push(new Paragraph({ children: textRuns(bullet[1]), bullet: { level: 0 }, spacing: { after: 45, line: lineSpacing }, keepLines: true }));
      continue;
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      paragraphs.push(new Paragraph({ children: textRuns(`${numbered[1]}. ${numbered[2]}`), spacing: { after: 45, line: lineSpacing }, keepLines: true }));
      continue;
    }
    paragraphs.push(new Paragraph({ children: textRuns(line), spacing: { after: paragraphAfter, line: lineSpacing }, keepLines: true }));
  }
  const document = new Document({
    styles: {
      default: { document: { run: { font: design.font === 'song' ? 'SimSun' : 'Microsoft YaHei', size: fontSize, color: softFinish ? '30343D' : '202331' } } },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: pageMargin, right: pageMargin, bottom: pageMargin, left: pageMargin },
        },
      },
      children: paragraphs,
    }],
  });
  return Packer.toBuffer(document);
}

module.exports = {
  ACCENT_COLORS,
  buildResumeHtml,
  cleanResumeMarkdown,
  createDocxBuffer,
  extractJsonObject,
  markdownToHtml,
  normalizeDesign,
  normalizeJdAnalysis,
  sectionType,
};
