const api = window.resumeApp;

const ui = {
  state: null,
  activeView: 'chat',
  activeConversationId: null,
  sending: false,
  analyzingJd: false,
  generatingDraft: false,
  runningVision: false,
  visualEditing: false,
  previewDirty: false,
  processController: null,
  ambientStop: null,
  showcaseStop: null,
  showcaseEditing: false,
  showcaseDirty: false,
  showcaseSaving: false,
  showcaseRevision: 0,
  showcaseSavePromise: null,
  showcaseSelection: null,
  careerSearching: false,
  interviewBuilding: false,
  intelTab: 'hr',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const DENSITY_PARAMETERS = {
  relaxed: { fontScale: 102, lineHeight: 1.64, pageMargin: 17 },
  balanced: { fontScale: 100, lineHeight: 1.52, pageMargin: 16 },
  dense: { fontScale: 94, lineHeight: 1.4, pageMargin: 13 },
};
const DESIGN_PRESETS = {
  recruiter: { template: 'airy', accent: 'navy', font: 'clean', density: 'balanced', finish: 'soft', fontScale: 100, lineHeight: 1.56, pageMargin: 16 },
  ats: { template: 'ats', accent: 'navy', font: 'clean', density: 'dense', finish: 'crisp', fontScale: 94, lineHeight: 1.4, pageMargin: 13 },
  brand: { template: 'swiss', accent: 'indigo', font: 'modern', density: 'relaxed', finish: 'soft', fontScale: 103, lineHeight: 1.62, pageMargin: 17 },
  leader: { template: 'executive', accent: 'burgundy', font: 'song', density: 'balanced', finish: 'editorial', fontScale: 101, lineHeight: 1.55, pageMargin: 16 },
};
const UI_THEMES = new Set(['midnight', 'mist', 'forest']);

function applyUiTheme(value) {
  const theme = UI_THEMES.has(value) ? value : 'midnight';
  document.body.dataset.uiTheme = theme;
  $$('[data-ui-theme-option]').forEach((button) => {
    const active = button.dataset.uiThemeOption === theme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  try { localStorage.setItem('resume-reshape-ui-theme', theme); } catch {}
}

function installPointerSpotlight() {
  let scheduled = false;
  let pointerX = window.innerWidth * .55;
  let pointerY = window.innerHeight * .3;
  const paint = () => {
    scheduled = false;
    document.body.style.setProperty('--pointer-x', `${Math.round((pointerX / Math.max(1, window.innerWidth)) * 100)}%`);
    document.body.style.setProperty('--pointer-y', `${Math.round((pointerY / Math.max(1, window.innerHeight)) * 100)}%`);
  };
  window.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!scheduled) { scheduled = true; requestAnimationFrame(paint); }
  }, { passive: true });
  paint();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function designValues() {
  const storedDraft = ui.state?.optimizedResume || {};
  return {
    template: $('#resume-template').value || 'professional',
    accent: $('#resume-accent').value || 'indigo',
    font: $('#resume-font').value || 'clean',
    density: $('#resume-density').value || 'balanced',
    finish: $('#resume-finish')?.value || 'soft',
    fontScale: clamp($('#resume-scale').value, 90, 112),
    lineHeight: clamp($('#resume-line-height').value, 135, 175) / 100,
    pageMargin: clamp($('#resume-page-margin').value, 10, 20),
    photoDataUrl: storedDraft.photoDataUrl || '',
    photoShape: $('#resume-photo-shape')?.value || storedDraft.photoShape || 'rounded',
    photoFit: $('#resume-photo-fit')?.value || storedDraft.photoFit || 'cover',
    photoScale: clamp($('#resume-photo-scale')?.value ?? storedDraft.photoScale ?? 100, 75, 130),
    showPhoto: Boolean(storedDraft.photoDataUrl && $('#resume-photo-visible')?.checked),
  };
}

function applyResumePhoto(preview, design) {
  if (!design.showPhoto || !design.photoDataUrl) return;
  let header = preview.querySelector('.resume-header');
  if (!header) {
    header = document.createElement('header');
    header.className = 'resume-header';
    preview.prepend(header);
  }
  header.classList.add('has-photo');
  const figure = document.createElement('figure');
  figure.className = `resume-photo photo-${design.photoShape}`;
  figure.contentEditable = 'false';
  figure.setAttribute('aria-label', '简历照片');
  const image = document.createElement('img');
  image.src = design.photoDataUrl;
  image.alt = '简历照片';
  figure.append(image);
  header.prepend(figure);
}

function updateDesignParameterLabels() {
  const design = designValues();
  $('#resume-scale-value').textContent = `${design.fontScale}%`;
  $('#resume-line-height-value').textContent = design.lineHeight.toFixed(2);
  $('#resume-page-margin-value').textContent = `${design.pageMargin} mm`;
  for (const [id, preset] of Object.entries(DESIGN_PRESETS)) {
    const active = Object.entries(preset).every(([key, value]) => typeof value === 'number'
      ? Math.abs((design[key] ?? 0) - value) < .001
      : design[key] === value);
    $(`[data-design-preset="${id}"]`)?.classList.toggle('active', active);
  }
}

function applyDesignPreset(id) {
  const preset = DESIGN_PRESETS[id];
  if (!preset) return;
  $('#resume-template').value = preset.template;
  $('#resume-accent').value = preset.accent;
  $('#resume-font').value = preset.font;
  $('#resume-density').value = preset.density;
  $('#resume-finish').value = preset.finish;
  $('#resume-scale').value = preset.fontScale;
  $('#resume-line-height').value = Math.round(preset.lineHeight * 100);
  $('#resume-page-margin').value = preset.pageMargin;
  updateDraftPreview();
  const name = $(`[data-design-preset="${id}"] strong`)?.textContent || '风格';
  showToast(`已切换“${name}”预设，排版参数已同步`);
}

function setupCanvas(canvas) {
  if (!canvas) return null;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width, height };
}

function launchParticleTargets(width, height) {
  const points = [];
  const docWidth = Math.min(250, width * .32);
  const docHeight = Math.min(330, height * .48);
  const left = (width - docWidth) / 2;
  const top = (height - docHeight) / 2 - 12;
  const addLine = (x1, y1, x2, y2, count) => {
    for (let index = 0; index < count; index += 1) {
      const ratio = count === 1 ? 0 : index / (count - 1);
      points.push({ x: x1 + (x2 - x1) * ratio, y: y1 + (y2 - y1) * ratio });
    }
  };
  addLine(left, top, left + docWidth, top, 22);
  addLine(left + docWidth, top, left + docWidth, top + docHeight, 28);
  addLine(left + docWidth, top + docHeight, left, top + docHeight, 22);
  addLine(left, top + docHeight, left, top, 28);
  for (let row = 0; row < 5; row += 1) {
    const y = top + docHeight * (.3 + row * .105);
    addLine(left + docWidth * .22, y, left + docWidth * (row % 2 ? .72 : .8), y, 9);
  }
  return points;
}

function startLaunchParticles() {
  const canvas = $('#launch-particles');
  if (!canvas || reduceMotionQuery.matches) return () => {};
  let frame = 0;
  let particles = [];
  let start = performance.now();
  const rebuild = () => {
    const metrics = setupCanvas(canvas);
    if (!metrics) return;
    const targets = launchParticleTargets(metrics.width, metrics.height);
    particles = targets.map((target, index) => ({
      x: Math.random() < .5 ? -30 : metrics.width + 30,
      y: Math.random() * metrics.height,
      tx: target.x,
      ty: target.y,
      size: index % 11 === 0 ? 2.1 : .9 + Math.random() * .8,
      phase: Math.random() * Math.PI * 2,
      tint: index % 7 === 0 ? '196,132,255' : '132,151,255',
    }));
    start = performance.now();
  };
  const draw = (now) => {
    const metrics = setupCanvas(canvas);
    if (!metrics) return;
    const { context, width, height } = metrics;
    context.clearRect(0, 0, width, height);
    const elapsed = now - start;
    const settle = Math.min(1, elapsed / 1250);
    const fade = elapsed > 2050 ? Math.max(0, 1 - (elapsed - 2050) / 620) : 1;
    context.globalCompositeOperation = 'lighter';
    particles.forEach((particle) => {
      const sway = Math.sin(now * .0014 + particle.phase) * (1 - settle) * 12;
      particle.x += (particle.tx + sway - particle.x) * (.018 + settle * .045);
      particle.y += (particle.ty - particle.y) * (.018 + settle * .045);
      const glow = .32 + .58 * settle;
      context.beginPath();
      context.fillStyle = `rgba(${particle.tint},${glow * fade})`;
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    });
    context.globalCompositeOperation = 'source-over';
    frame = requestAnimationFrame(draw);
  };
  rebuild();
  frame = requestAnimationFrame(draw);
  window.addEventListener('resize', rebuild);
  return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', rebuild); };
}

function startParticleField(canvas, { dark = false } = {}) {
  if (!canvas) return () => {};
  let particles = [];
  let frame = 0;
  let lastPaint = 0;
  const rebuild = () => {
    const metrics = setupCanvas(canvas);
    if (!metrics) return;
    const count = reduceMotionQuery.matches ? 14 : Math.round(clamp((metrics.width * metrics.height) / 26000, 18, 42));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * metrics.width,
      y: Math.random() * metrics.height,
      vx: (Math.random() - .5) * .18,
      vy: (Math.random() - .5) * .14,
      radius: .7 + Math.random() * 1.35,
      pulse: Math.random() * Math.PI * 2,
    }));
  };
  const draw = (now) => {
    frame = requestAnimationFrame(draw);
    if (document.hidden || canvas.closest('.hidden') || (!reduceMotionQuery.matches && now - lastPaint < 34)) return;
    lastPaint = now;
    const metrics = setupCanvas(canvas);
    if (!metrics) return;
    const { context, width, height } = metrics;
    context.clearRect(0, 0, width, height);
    particles.forEach((particle, index) => {
      if (!reduceMotionQuery.matches) {
        particle.x = (particle.x + particle.vx + width) % width;
        particle.y = (particle.y + particle.vy + height) % height;
      }
      const alpha = .18 + (Math.sin(now * .001 + particle.pulse) + 1) * .09;
      context.beginPath();
      context.fillStyle = dark ? `rgba(158,174,255,${alpha})` : `rgba(91,108,220,${alpha})`;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
      for (let near = index + 1; near < Math.min(index + 6, particles.length); near += 1) {
        const other = particles[near];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
        if (distance > 92) continue;
        context.beginPath();
        context.strokeStyle = dark ? `rgba(130,148,240,${(1 - distance / 92) * .09})` : `rgba(92,107,196,${(1 - distance / 92) * .07})`;
        context.moveTo(particle.x, particle.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
    });
  };
  rebuild();
  frame = requestAnimationFrame(draw);
  const observer = new ResizeObserver(rebuild);
  observer.observe(canvas);
  return () => { cancelAnimationFrame(frame); observer.disconnect(); };
}

function startLaunchExperience() {
  const overlay = $('#launch-experience');
  if (!overlay) return;
  const stopParticles = startLaunchParticles();
  const status = $('#launch-status');
  const updates = reduceMotionQuery.matches ? [] : [
    [520, '正在连接模板、记忆与工作区'],
    [1180, '正在聚合你的职业信息'],
    [1900, '工作台准备完成'],
  ];
  const timers = updates.map(([delay, text]) => setTimeout(() => { status.textContent = text; }, delay));
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    overlay.classList.add('is-leaving');
    setTimeout(() => { overlay.classList.add('hidden'); stopParticles(); }, reduceMotionQuery.matches ? 20 : 680);
  };
  $('#skip-launch').addEventListener('click', finish, { once: true });
  setTimeout(finish, reduceMotionQuery.matches ? 850 : 2700);
  setTimeout(finish, 5200);
}

const PROCESS_STAGES = {
  import: {
    kicker: '原始简历解析', title: '正在导入你的经历',
    stages: ['等待选择本地文件', '安全解析文档结构', '建立经历与技能索引', '准备进入改造工作台'],
  },
  generate: {
    kicker: '智能成品生成', title: '正在生成成品简历',
    stages: ['读取真实经历与求职目标', '匹配招聘需求与 ATS 关键词', '重组信息层级与成果表达', '应用模板和排版参数'],
  },
};

function beginProcessExperience(mode) {
  ui.processController?.cancel();
  const config = PROCESS_STAGES[mode];
  const overlay = $('#process-experience');
  overlay.dataset.mode = mode;
  overlay.dataset.state = 'running';
  $('#process-kicker').textContent = config.kicker;
  $('#process-title').textContent = config.title;
  $('#process-status').textContent = config.stages[0];
  $('#process-progress-bar').style.width = '8%';
  overlay.classList.remove('hidden');
  let index = 0;
  let closed = false;
  const timer = setInterval(() => {
    index = Math.min(index + 1, config.stages.length - 1);
    $('#process-status').textContent = config.stages[index];
    $('#process-progress-bar').style.width = `${24 + index * 20}%`;
  }, 1150);
  const hide = () => { overlay.classList.add('hidden'); };
  const controller = {
    cancel() { if (closed) return; closed = true; clearInterval(timer); hide(); },
    fail(message = '处理未完成') { if (closed) return; closed = true; clearInterval(timer); $('#process-status').textContent = message; setTimeout(hide, 260); },
    complete(message) {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      overlay.dataset.state = 'complete';
      $('#process-title').textContent = mode === 'import' ? '经历已就位' : '简历成品已生成';
      $('#process-status').textContent = message || '准备完成';
      $('#process-progress-bar').style.width = '100%';
      setTimeout(hide, reduceMotionQuery.matches ? 30 : 780);
    },
  };
  ui.processController = controller;
  return controller;
}

function syncShowcasePreview() {
  const source = $('#resume-preview');
  const target = $('#showcase-preview');
  target.className = source.className.replace(/\bvisual-editing\b/g, '').trim();
  target.style.cssText = source.style.cssText;
  target.removeAttribute('contenteditable');
  target.innerHTML = source.innerHTML;
  $('#showcase-title').textContent = ui.state?.profile?.targetRole ? `${ui.state.profile.targetRole} · 简历成品` : '简历成品';
}

function setShowcaseEditing(enabled, { focus = false } = {}) {
  const showcase = $('#resume-showcase');
  const preview = $('#showcase-preview');
  ui.showcaseEditing = Boolean(enabled);
  showcase.classList.toggle('editing', ui.showcaseEditing);
  preview.classList.toggle('showcase-editing', ui.showcaseEditing);
  preview.contentEditable = ui.showcaseEditing ? 'true' : 'false';
  preview.spellcheck = true;
  $('#showcase-editor-toolbar').classList.toggle('hidden', !ui.showcaseEditing);
  $('#showcase-edit').classList.toggle('active', ui.showcaseEditing);
  $('#showcase-edit').textContent = ui.showcaseEditing ? '完成编辑' : '编辑内容';
  $('#showcase-save').classList.toggle('hidden', !ui.showcaseEditing);
  $('#showcase-edit-status').textContent = ui.showcaseDirty ? '有未保存修改' : '所见即所得 · 修改仅保存在本机';
  if (ui.showcaseEditing) syncEditorRibbon();
  if (focus && ui.showcaseEditing) preview.focus({ preventScroll: true });
}

function syncEditorRibbon() {
  $('#editor-template').value = $('#resume-template').value;
  $('#editor-font').value = $('#resume-font').value;
  $('#editor-accent').value = $('#resume-accent').value;
  $('#editor-finish').value = $('#resume-finish').value;
  $('#editor-scale').value = String(Math.round(clamp($('#resume-scale').value, 90, 112) / 5) * 5).replace('115', '112');
  if (![...$('#editor-scale').options].some((option) => option.value === $('#editor-scale').value)) $('#editor-scale').value = '100';
  const lineHeight = clamp($('#resume-line-height').value, 135, 175);
  $('#editor-line-height').value = String([140, 152, 164, 175].reduce((closest, value) => Math.abs(value - lineHeight) < Math.abs(closest - lineHeight) ? value : closest, 152));
}

function applyEditorDesignChange(editorField, sourceField) {
  sourceField.value = editorField.value;
  syncShowcaseToDraft();
  updateDraftPreview();
  const design = designValues();
  const preview = $('#showcase-preview');
  preview.className = `resume-preview template-${design.template} accent-${design.accent} font-${design.font} density-${design.density} finish-${design.finish} showcase-editing`;
  preview.style.setProperty('--resume-font-scale', design.fontScale / 100);
  preview.style.setProperty('--resume-line-height', design.lineHeight);
  preview.style.setProperty('--resume-page-margin', `${design.pageMargin}mm`);
  preview.style.setProperty('--resume-photo-fit', design.photoFit);
  const photoRatio = design.photoScale / 100;
  preview.style.setProperty('--resume-photo-width', `${Math.round(78 * photoRatio)}px`);
  preview.style.setProperty('--resume-photo-height', `${Math.round(104 * photoRatio)}px`);
  preview.style.setProperty('--resume-photo-space', `${Math.round(98 * photoRatio)}px`);
  preview.style.setProperty('--resume-photo-sidebar-space', `${Math.round(108 * photoRatio)}px`);
  ui.showcaseRevision += 1;
  ui.showcaseDirty = true;
  $('#showcase-edit-status').textContent = '有未保存修改';
  clearTimeout(syncShowcaseToDraft.autoSaveTimer);
  syncShowcaseToDraft.autoSaveTimer = setTimeout(() => saveShowcaseEdits({ silent: true }).catch((error) => showToast(`自动保存失败：${error.message}`, 'error')), 1400);
}

function restoreShowcaseSelection() {
  if (!ui.showcaseSelection) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(ui.showcaseSelection);
}

function syncShowcaseToDraft() {
  if (!ui.showcaseEditing) return '';
  const content = previewToResumeMarkdown($('#showcase-preview'));
  if (content) $('#draft-editor').value = content;
  ui.showcaseDirty = true;
  ui.previewDirty = true;
  $('#showcase-edit-status').textContent = '有未保存修改';
  return content;
}

async function saveShowcaseEdits({ silent = false } = {}) {
  if (!ui.showcaseEditing) return;
  if (ui.showcaseSaving && ui.showcaseSavePromise) {
    await ui.showcaseSavePromise;
    if (ui.showcaseDirty) return saveShowcaseEdits({ silent });
    return;
  }
  const content = syncShowcaseToDraft().trim();
  if (!content) throw new Error('简历内容不能为空。');
  const button = $('#showcase-save');
  const savingRevision = ui.showcaseRevision;
  ui.showcaseSaving = true;
  setButtonBusy(button, true, '保存中…');
  ui.showcaseSavePromise = api.saveDraft({ content, ...designValues() });
  try {
    ui.state = await ui.showcaseSavePromise;
    ui.showcaseDirty = ui.showcaseRevision !== savingRevision;
    ui.previewDirty = ui.showcaseDirty;
    renderStudio();
    $('#showcase-edit-status').textContent = ui.showcaseDirty ? '有新的未保存修改' : '已保存到本机';
    if (!silent) showToast('全屏编辑内容已保存');
  } finally {
    ui.showcaseSaving = false;
    ui.showcaseSavePromise = null;
    setButtonBusy(button, false);
  }
}

function updateShowcaseZoom() {
  const zoom = clamp($('#showcase-zoom').value, 52, 100);
  $('#showcase-zoom-value').textContent = `${zoom}%`;
  $('#showcase-preview').style.setProperty('--showcase-zoom', zoom / 100);
}

function openShowcase({ edit = false } = {}) {
  if (!$('#draft-editor').value.trim()) { showToast('请先生成或填写简历内容，再进入全屏成品模式', 'error'); return; }
  if (ui.visualEditing) syncPreviewToEditor();
  ui.showcaseEditing = false;
  ui.showcaseDirty = false;
  ui.showcaseRevision = 0;
  updateDraftPreview();
  syncShowcasePreview();
  updateShowcaseZoom();
  $('#resume-showcase').classList.remove('hidden');
  document.body.classList.add('showcase-open');
  setShowcaseEditing(edit, { focus: edit });
  ui.showcaseStop?.();
  ui.showcaseStop = startParticleField($('#showcase-particles'), { dark: true });
  if (!edit) $('#showcase-close').focus();
}

async function closeShowcase() {
  clearTimeout(syncShowcaseToDraft.autoSaveTimer);
  if (ui.showcaseEditing && ui.showcaseDirty) {
    try {
      let attempts = 0;
      while (ui.showcaseDirty && attempts < 3) { await saveShowcaseEdits({ silent: true }); attempts += 1; }
    }
    catch (error) { showToast(`保存失败：${error.message}`, 'error'); return; }
  }
  setShowcaseEditing(false);
  $('#resume-showcase').classList.add('hidden');
  document.body.classList.remove('showcase-open');
  ui.showcaseStop?.();
  ui.showcaseStop = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function markdown(value) {
  let safe = escapeHtml(value);
  safe = safe.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/^### (.+)$/gm, '<strong>$1</strong>');
  safe = safe.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  safe = safe.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return safe.split(/\n{2,}/).map((block) => block.startsWith('<ul>') || block.startsWith('<pre>') ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
}

function resumeMarkdown(value) {
  const lines = String(value || '').split(/\r?\n/);
  const output = [];
  let listOpen = false;
  let listType = 'ul';
  let headerOpen = false;
  let bodyOpen = false;
  let sectionOpen = false;
  let itemOpen = false;
  const closeList = () => { if (listOpen) output.push(`</${listType}>`); listOpen = false; };
  const closeItem = () => { closeList(); if (itemOpen) output.push('</div>'); itemOpen = false; };
  const closeSection = () => { closeItem(); if (sectionOpen) output.push('</section>'); sectionOpen = false; };
  const inline = (text) => escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  const typeFor = (title) => {
    if (/(概述|简介|优势|summary|profile|objective)/i.test(title)) return 'summary';
    if (/(技能|能力|专长|skill|competenc)/i.test(title)) return 'skills';
    if (/(工作|实习|任职|经历|experience|employment|work)/i.test(title)) return 'experience';
    if (/(项目|案例|project|portfolio)/i.test(title)) return 'projects';
    if (/(教育|学历|education|academic)/i.test(title)) return 'education';
    if (/(证书|认证|荣誉|奖项|语言|certif|award|language)/i.test(title)) return 'certifications';
    return 'general';
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) {
        closeSection();
        if (bodyOpen) { output.push('</div>'); bodyOpen = false; }
        if (!headerOpen) { output.push('<header class="resume-header">'); headerOpen = true; }
        output.push(`<h1>${inline(heading[2])}</h1>`);
      } else if (level === 2) {
        if (headerOpen) { closeList(); output.push('</header>'); headerOpen = false; }
        closeSection();
        if (!bodyOpen) { output.push('<div class="resume-body">'); bodyOpen = true; }
        const type = typeFor(heading[2]);
        output.push(`<section class="resume-section section-${type}" data-section-type="${type}"><h2>${inline(heading[2])}</h2>`);
        sectionOpen = true;
      } else {
        if (!bodyOpen && headerOpen) { output.push('</header><div class="resume-body">'); headerOpen = false; bodyOpen = true; }
        if (!sectionOpen) { output.push('<section class="resume-section section-general" data-section-type="general">'); sectionOpen = true; }
        closeItem();
        output.push(`<div class="resume-item"><h3>${inline(heading[2])}</h3>`);
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
      output.push(`<li>${inline((numbered || bullet)[1])}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${inline(line)}</p>`);
  }
  closeSection();
  if (headerOpen) output.push('</header>');
  if (bodyOpen) output.push('</div>');
  return output.join('');
}

function inlineDomMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  const content = [...node.childNodes].map(inlineDomMarkdown).join('');
  if ((tag === 'strong' || tag === 'b') && content.trim()) return `**${content.trim()}**`;
  if ((tag === 'em' || tag === 'i') && content.trim()) return `*${content.trim()}*`;
  if (tag === 'u' && content.trim()) return `++${content.trim()}++`;
  return content;
}

function previewToResumeMarkdown(preview) {
  const candidates = [...preview.querySelectorAll('h1, h2, h3, p, li, div')];
  const blocks = candidates.filter((element) => {
    if (element.tagName !== 'DIV') return true;
    if (element.classList.length) return false;
    if (element.querySelector('h1, h2, h3, p, li')) return false;
    return ![...element.children].some((child) => child.tagName === 'DIV');
  });
  const output = [];
  for (const block of blocks) {
    const text = inlineDomMarkdown(block)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
    if (!text) continue;
    const prefix = block.tagName === 'LI' && block.parentElement?.tagName === 'OL'
      ? '1. '
      : ({ H1: '# ', H2: '## ', H3: '### ', LI: '- ' })[block.tagName] || '';
    if (/^H[1-3]$/.test(block.tagName) && output.length && output.at(-1) !== '') output.push('');
    output.push(`${prefix}${text}`);
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function syncPreviewToEditor() {
  if (!ui.visualEditing) return;
  const content = previewToResumeMarkdown($('#resume-preview'));
  $('#draft-editor').value = content;
  ui.previewDirty = true;
  $('#visual-edit-state').textContent = '直接编辑中 · 已同步';
}

function applyVisualEditingState({ focus = false } = {}) {
  const preview = $('#resume-preview');
  const button = $('#toggle-visual-edit');
  preview.contentEditable = ui.visualEditing ? 'true' : 'false';
  preview.classList.toggle('visual-editing', ui.visualEditing);
  preview.setAttribute('aria-label', ui.visualEditing ? '可直接编辑的简历预览' : '简历预览');
  button.classList.toggle('active', ui.visualEditing);
  button.textContent = ui.visualEditing ? '完成直接编辑' : '全屏编辑';
  $('#visual-edit-state').textContent = ui.visualEditing ? (ui.previewDirty ? '直接编辑中 · 已同步' : '直接编辑中') : '只读预览';
  $('#visual-edit-hint').classList.toggle('visible', ui.visualEditing);
  if (focus && ui.visualEditing) preview.focus();
}

function setVisualEditing(enabled, options = {}) {
  if (enabled && !$('#draft-editor').value.trim()) {
    showToast('请先生成或填写简历内容，再直接编辑预览', 'error');
    return;
  }
  if (!enabled && ui.visualEditing) syncPreviewToEditor();
  ui.visualEditing = Boolean(enabled);
  ui.previewDirty = false;
  applyVisualEditingState(options);
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch { return ''; }
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}

function currentConversation() {
  return ui.state.conversations.find((item) => item.id === ui.activeConversationId) || null;
}

function switchView(view) {
  closeContextDrawer();
  ui.activeView = view;
  $('.sidebar').scrollTop = 0;
  $$('.view').forEach((element) => element.classList.toggle('active', element.id === `${view}-view`));
  $$('.nav-item').forEach((element) => element.classList.toggle('active', element.dataset.view === view));
  $('#page-title').textContent = ({ chat: '智能简历改造', studio: '简历成品', radar: '求职雷达', resume: '原始简历', memory: '长期记忆' })[view];
}

function openContextDrawer() {
  $('#context-panel').classList.add('open');
  $('#context-backdrop').classList.add('open');
}

function closeContextDrawer() {
  $('#context-panel')?.classList.remove('open');
  $('#context-backdrop')?.classList.remove('open');
}

function renderConversations() {
  const list = $('#conversation-list');
  if (!ui.state.conversations.length) {
    list.innerHTML = '<div style="color:#777e9a;font-size:10px;padding:8px 10px">还没有历史任务</div>';
    return;
  }
  list.innerHTML = ui.state.conversations.map((conversation) => `
    <div class="conversation-item ${conversation.id === ui.activeConversationId ? 'active' : ''}" data-conversation-id="${escapeHtml(conversation.id)}">
      <button title="${escapeHtml(conversation.title)}">${escapeHtml(conversation.title)}</button>
      <button class="conversation-delete" title="删除任务">×</button>
    </div>`).join('');
}

function renderProfile() {
  const profile = ui.state.profile;
  $('#target-company').value = profile.targetCompany || '';
  $('#target-role').value = profile.targetRole || '';
  $('#job-description').value = profile.jobDescription || '';
  if (document.activeElement !== $('#jd-workbench')) $('#jd-workbench').value = profile.jobDescription || '';
  $('#priorities').value = profile.priorities || '';
  const complete = Boolean(profile.targetCompany && profile.targetRole);
  $('#profile-state').textContent = complete ? '已建立' : '未完善';
  $('#profile-state').style.color = complete ? '#268a66' : '';
}

function renderSettingsSummary() {
  const settings = ui.state.settings;
  $('#settings-status').textContent = settings.hasApiKey && settings.model ? `已连接 · ${settings.model}` : '尚未配置';
}

function renderJobAnalysis() {
  const analysis = ui.state.profile.jdAnalysis;
  const holder = $('#jd-analysis');
  if (!analysis) {
    holder.innerHTML = '<div class="analysis-summary">粘贴完整 JD 后，将自动提取职责、硬性要求、加分项和 ATS 关键词。</div>';
    return;
  }
  const group = (title, items) => items?.length ? `<div class="analysis-group"><strong>${title}</strong><div class="tag-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div></div>` : '';
  const match = analysis.match;
  const matchCard = match?.evaluated ? `
    <div class="match-card">
      <div class="match-score"><strong>${match.score}</strong><span>岗位匹配分</span></div>
      <div class="match-meter"><i style="width:${Math.max(3, match.score)}%"></i></div>
      <small>基于 JD 硬性要求与关键词进行本地比对，不代表招聘结果。</small>
    </div>` : '';
  holder.innerHTML = `
    <div class="analysis-summary"><b>${escapeHtml(analysis.seniority || '岗位画像')}</b><br>${escapeHtml(analysis.summary || '已完成结构化识别')}</div>
    ${matchCard}
    ${group('硬性要求', analysis.requiredSkills)}
    ${group('核心职责', analysis.responsibilities)}
    ${group('ATS 关键词', analysis.keywords)}
    ${group('简历已覆盖', match?.matched)}
    ${group('简历待补齐', match?.missing)}
    ${group('需要补证据', analysis.evidenceGaps)}`;
}

function renderVisionReview() {
  const review = ui.state.resumes[0]?.visionReview;
  const holder = $('#resume-vision-result');
  if (!review) { holder.innerHTML = ''; return; }
  const list = (title, items) => items?.length ? `<h4>${title}</h4><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  holder.innerHTML = `<p>${escapeHtml(review.layoutSummary || '已完成识别')}</p>${list('主要问题', review.issues)}${list('改进建议', review.suggestions)}`;
}

function updateDraftPreview() {
  const preview = $('#resume-preview');
  const design = designValues();
  preview.className = `resume-preview template-${design.template} accent-${design.accent} font-${design.font} density-${design.density} finish-${design.finish}`;
  preview.style.setProperty('--resume-font-scale', design.fontScale / 100);
  preview.style.setProperty('--resume-line-height', design.lineHeight);
  preview.style.setProperty('--resume-page-margin', `${design.pageMargin}mm`);
  preview.innerHTML = resumeMarkdown($('#draft-editor').value);
  applyResumePhoto(preview, design);
  $$('[data-template-card]').forEach((card) => card.classList.toggle('active', card.dataset.templateCard === design.template));
  updateDesignParameterLabels();
  applyVisualEditingState();
  if (!ui.showcaseEditing && !$('#resume-showcase').classList.contains('hidden')) syncShowcasePreview();
}

function renderTemplateLibrary() {
  const catalog = ui.state.templateCatalog || [];
  const gallery = $('#template-gallery');
  gallery.innerHTML = catalog.map((template) => `
    <button type="button" class="template-card" data-template-card="${escapeHtml(template.id)}" title="${escapeHtml(template.description)}">
      <span class="template-mini mini-${escapeHtml(template.id)}"><i></i><i></i><i></i><i></i><i></i></span>
      <span class="template-card-copy"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.bestFor)}</small></span>
      <em>ATS ${escapeHtml(template.ats)}</em>
    </button>`).join('');
  $('#template-count').textContent = `${catalog.length} 套`;
  const recommendation = ui.state.templateRecommendation;
  $('#template-recommendation').textContent = recommendation
    ? `智能推荐：${recommendation.name} · ${recommendation.reason}`
    : '导入简历并识别 JD 后可获得智能推荐';
}

function renderStudio() {
  const draft = ui.state.optimizedResume || {};
  const sourceResume = ui.state.resumes[0];
  if (document.activeElement !== $('#draft-editor')) $('#draft-editor').value = draft.content || '';
  $('#resume-template').value = draft.template || 'professional';
  $('#resume-accent').value = draft.accent || 'indigo';
  $('#resume-font').value = draft.font || 'clean';
  $('#resume-density').value = draft.density || 'balanced';
  $('#resume-finish').value = draft.finish || 'soft';
  const parameterDefaults = DENSITY_PARAMETERS[draft.density] || DENSITY_PARAMETERS.balanced;
  $('#resume-scale').value = draft.fontScale ?? parameterDefaults.fontScale;
  $('#resume-line-height').value = Math.round((draft.lineHeight ?? parameterDefaults.lineHeight) * 100);
  $('#resume-page-margin').value = draft.pageMargin ?? parameterDefaults.pageMargin;
  const hasPhoto = Boolean(draft.photoDataUrl);
  $('#resume-photo-shape').value = draft.photoShape || 'rounded';
  $('#resume-photo-fit').value = draft.photoFit || 'cover';
  $('#resume-photo-scale').value = draft.photoScale ?? 100;
  $('#resume-photo-scale-value').textContent = `${draft.photoScale ?? 100}%`;
  $('#resume-photo-shape').disabled = !hasPhoto;
  $('#resume-photo-fit').disabled = !hasPhoto;
  $('#resume-photo-scale').disabled = !hasPhoto;
  $('#resume-photo-visible').checked = hasPhoto && draft.showPhoto !== false;
  $('#resume-photo-visible').disabled = !hasPhoto;
  $('#choose-resume-photo').textContent = hasPhoto ? '更换照片' : '添加证件照';
  $('#remove-resume-photo').classList.toggle('hidden', !hasPhoto);
  $('#resume-photo-thumb').innerHTML = hasPhoto ? `<img src="${draft.photoDataUrl}" alt="照片缩略图">` : '照片';
  const sourceHolder = $('#studio-resume-source');
  sourceHolder.classList.toggle('photo-synced', Boolean(sourceResume?.photoDetection?.detected));
  sourceHolder.innerHTML = sourceResume
    ? `<strong>${escapeHtml(sourceResume.name)}</strong><span>${sourceResume.needsVision ? '扫描件已保存，等待视觉识别' : `${sourceResume.characters.toLocaleString()} 字符已解析`}${sourceResume.photoDetection?.detected ? ' · 原照片已同步到成品' : sourceResume.photoDetection?.candidateCount ? ' · 未把图标误作照片' : ' · 暂未识别到照片'}</span>`
    : '<strong>尚未上传原简历</strong><span>支持 PDF、DOCX、TXT、Markdown 和 RTF</span>';
  $('#resume-vision').disabled = !sourceResume;
  renderTemplateLibrary();
  renderJobAnalysis();
  renderVisionReview();
  updateDraftPreview();
  const review = $('#draft-visual-review');
  review.classList.toggle('visible', Boolean(draft.visualReview));
  review.innerHTML = draft.visualReview ? `<strong>视觉模型审查</strong>${markdown(draft.visualReview)}` : '';
  const progress = $$('.studio-progress span');
  progress[0]?.classList.toggle('active', Boolean(sourceResume));
  progress[1]?.classList.toggle('active', Boolean(ui.state.profile.jdAnalysis));
  progress[2]?.classList.toggle('active', Boolean(draft.content));
  progress[3]?.classList.toggle('active', Boolean(draft.visualReview));
}

function renderCurrentResume() {
  const holder = $('#current-resume');
  const resume = ui.state.resumes[0];
  holder.innerHTML = resume ? `<div class="resume-chip"><span>当前简历</span><strong>${escapeHtml(resume.name)}</strong><small>${resume.needsVision ? '扫描版 · 等待视觉识别' : `${resume.characters.toLocaleString()} 字符 · 已在本机解析`}${resume.photoDetection?.detected ? ' · 照片已带入' : ''}</small></div>` : '';
  $$('.journey-step')[0]?.classList.toggle('done', Boolean(resume));
  $$('.journey-step')[1]?.classList.toggle('done', Boolean(ui.state.profile.targetCompany && ui.state.profile.targetRole));
}

function renderResumeList() {
  const list = $('#resume-list');
  if (!ui.state.resumes.length) {
    list.innerHTML = '<div class="empty-state">还没有导入简历。支持 PDF、DOCX、TXT 和 Markdown。</div>';
    return;
  }
  list.innerHTML = ui.state.resumes.map((resume, index) => `
    <article class="resume-card">
      <div class="file-icon">${escapeHtml(resume.name.split('.').pop().toUpperCase())}</div>
      <div><h3>${escapeHtml(resume.name)} ${index === 0 ? '<small style="color:#596be3">· 当前</small>' : ''}</h3><p>${escapeHtml(resume.text.slice(0, 240))}</p><small>${resume.characters.toLocaleString()} 字符 · ${formatDate(resume.createdAt)}</small></div>
      <button class="delete-button" data-delete-resume="${escapeHtml(resume.id)}">删除</button>
    </article>`).join('');
}

function renderMemories() {
  $('#memory-count').textContent = ui.state.memories.length;
  const list = $('#memory-list');
  if (!ui.state.memories.length) {
    list.innerHTML = '<div class="empty-state">尚无长期记忆。建议先记录真实经历、写作偏好和不能触碰的边界。</div>';
    return;
  }
  list.innerHTML = ui.state.memories.map((memory) => `
    <article class="memory-card"><i>◇</i><div><p>${escapeHtml(memory.content)}</p><small>${formatDate(memory.createdAt)}</small></div><button class="delete-button" data-delete-memory="${escapeHtml(memory.id)}">删除</button></article>`).join('');
}

function renderMessages() {
  const conversation = currentConversation();
  const hasMessages = Boolean(conversation?.messages?.length);
  const hasResume = Boolean(ui.state.resumes.length);
  $('#welcome').classList.toggle('hidden', hasMessages || hasResume);
  $('#chat-panel').classList.toggle('hidden', !hasMessages && !hasResume);
  $('#quick-prompts').classList.toggle('hidden', hasMessages);
  const messages = $('#messages');

  if (!hasMessages && hasResume) {
    messages.innerHTML = `<div class="message"><div class="avatar">舟</div><div class="message-body"><div class="message-meta">职舟</div><div class="message-content"><p>简历已经在本机解析完成。接下来请填写右侧的目标公司和岗位，或直接告诉我你的诉求。</p><p>我会先诊断，再和你逐项确认，不会替你编造经历。</p></div></div></div>`;
  } else {
    messages.innerHTML = (conversation?.messages || []).map((message) => `
      <div class="message ${message.role}">
        <div class="avatar">${message.role === 'user' ? '你' : 'R'}</div>
        <div class="message-body">
          <div class="message-meta">${message.role === 'user' ? '你' : '职舟'} · ${formatDate(message.createdAt)}</div>
          <div class="message-content">${markdown(message.content)}</div>
          ${message.sources?.length ? `<div class="sources">${message.sources.map((source, index) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${index + 1}. ${escapeHtml(source.title)}</a>`).join('')}</div>` : ''}
        </div>
      </div>`).join('');
  }
  if (ui.sending) messages.insertAdjacentHTML('beforeend', '<div class="message"><div class="avatar">R</div><div class="message-body"><div class="message-meta">正在分析</div><div class="message-content"><span class="typing"><i></i><i></i><i></i></span></div></div></div>');
  requestAnimationFrame(() => { $('#chat-panel').scrollTop = $('#chat-panel').scrollHeight; });
}

function interviewSourceLinks(pack, indexes = []) {
  const selected = indexes.length ? indexes.map((index) => ({ index, source: pack.sources?.[index - 1] })).filter((item) => item.source) : [];
  if (!selected.length) return '<span class="source-unlinked">公开趋势综合</span>';
  return selected.map(({ index, source }) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">来源 ${index}</a>`).join('');
}

function renderInterviewQuestion(item, pack, practice = false) {
  const points = item.answerPoints?.length ? `<ul>${item.answerPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : '<p>请结合自己的真实经历补充回答证据。</p>';
  return `<article class="intel-question ${practice ? 'practice-question' : ''}">
    <div class="question-meta"><span>${escapeHtml(item.category)}</span><b>${practice ? `${escapeHtml(item.difficulty)} · 原创练习` : `${escapeHtml(item.frequency)}频`}</b></div>
    <h4>${escapeHtml(item.question)}</h4>
    ${item.why ? `<p>${escapeHtml(item.why)}</p>` : ''}
    ${practice && item.basis ? `<div class="practice-basis">生成依据：${escapeHtml(item.basis)}</div>` : ''}
    <details><summary>${practice ? '查看解题方向' : '查看回答要点'}</summary>${points}</details>
    <footer>${interviewSourceLinks(pack, item.sourceIndexes)}</footer>
  </article>`;
}

function renderCareerIntelligence() {
  const intelligence = ui.state.careerIntelligence || {};
  const jobSearch = intelligence.jobSearch;
  const pack = intelligence.interviewPack;
  const profile = ui.state.profile || {};
  const query = jobSearch?.query || {};
  if (document.activeElement !== $('#intel-company')) $('#intel-company').value = query.company || pack?.company || profile.targetCompany || '';
  if (document.activeElement !== $('#intel-role')) $('#intel-role').value = query.role || pack?.role || profile.targetRole || '';
  if (document.activeElement !== $('#intel-location')) $('#intel-location').value = query.location || $('#intel-location').value || '中国';

  $('#job-result-count').textContent = `${jobSearch?.jobs?.length || 0} 条`;
  $('#job-search-summary').innerHTML = jobSearch
    ? `<p>${escapeHtml(jobSearch.summary)}</p><small>最近核验：${formatDate(jobSearch.searchedAt)} · 共 ${jobSearch.sources?.length || 0} 个公开来源</small>`
    : '';
  $('#job-results').innerHTML = jobSearch?.jobs?.length ? jobSearch.jobs.map((job) => `
    <article class="job-result-card">
      <div class="job-company-mark">${escapeHtml((job.company || '职').slice(0, 1))}</div>
      <div class="job-result-main">
        <div class="job-result-title"><div><h4>${escapeHtml(job.title)}</h4><p>${escapeHtml(job.company)}</p></div><span class="confidence-${job.confidence === '高' ? 'high' : job.confidence === '低' ? 'low' : 'medium'}">${escapeHtml(job.confidence)}可信度</span></div>
        <div class="job-meta"><span>${escapeHtml(job.location)}</span><span>${escapeHtml(job.employmentType)}</span><span>${escapeHtml(job.salary)}</span><span>${escapeHtml(job.publishedAt)}</span></div>
        ${job.highlights?.length ? `<ul>${job.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        <div class="apply-method"><strong>投递方式</strong><span>${escapeHtml(job.applyMethod)}</span></div>
        <footer><a href="${escapeHtml(job.sourceUrl)}" target="_blank" rel="noreferrer">来源：${escapeHtml(job.sourceTitle)}</a><small>截止：${escapeHtml(job.deadline)}</small><a class="apply-link" href="${escapeHtml(job.applyUrl)}" target="_blank" rel="noreferrer">打开投递页面 →</a></footer>
      </div>
    </article>`).join('') : '<div class="intel-empty">暂无可核验结果。可以扩大地区范围，或只填写岗位名称后再次搜索。</div>';

  $('#interview-source-count').textContent = `${pack?.sources?.length || 0} 个来源`;
  if (!pack) {
    $('#interview-overview').innerHTML = '';
    $('#interview-results').innerHTML = '<div class="intel-empty">填写目标公司和岗位后，可生成近三年公开面经趋势与原创预测练习题。</div>';
    return;
  }
  const allSources = pack.sources?.length ? `<div class="intel-source-strip">${pack.sources.map((source, index) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${index + 1}. ${escapeHtml(source.title)}</a>`).join('')}</div>` : '';
  $('#interview-overview').innerHTML = `<p>${escapeHtml(pack.overview || '已完成公开资料归纳。')}</p>${pack.likelyStages?.length ? `<div class="stage-flow">${pack.likelyStages.map((stage, index) => `<span><i>${index + 1}</i>${escapeHtml(stage)}</span>`).join('')}</div>` : ''}${allSources}`;
  $$('#interview-tabs [data-intel-tab]').forEach((button) => button.classList.toggle('active', button.dataset.intelTab === ui.intelTab));
  const mapping = {
    hr: () => pack.hrQuestions?.map((item) => renderInterviewQuestion(item, pack)).join(''),
    role: () => pack.roleQuestions?.map((item) => renderInterviewQuestion(item, pack)).join(''),
    written: () => pack.writtenPractice?.map((item) => renderInterviewQuestion(item, pack, true)).join(''),
    plan: () => `<ol class="preparation-plan">${(pack.preparationPlan || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`,
  };
  const content = mapping[ui.intelTab]?.() || '';
  $('#interview-results').innerHTML = content || '<div class="intel-empty">当前公开来源不足以支持这一部分，请更换关键词后重新生成。</div>';
}

function renderAll() {
  if (!ui.activeConversationId && ui.state.conversations[0]) ui.activeConversationId = ui.state.conversations[0].id;
  renderConversations();
  renderProfile();
  renderSettingsSummary();
  renderCurrentResume();
  renderResumeList();
  renderMemories();
  renderStudio();
  renderCareerIntelligence();
  renderMessages();
}

async function importResume(event) {
  const returnToStudio = event?.currentTarget?.dataset.importDestination === 'studio'
    || $('.nav-item.active')?.dataset.view === 'studio';
  const process = beginProcessExperience('import');
  try {
    const result = await api.importResume();
    if (!result.canceled) {
      ui.state = result.state;
      renderAll();
      switchView(returnToStudio ? 'studio' : 'chat');
      const completion = result.photoImported
        ? '文档经历与简历照片已完成解析'
        : result.needsVision ? '已导入，扫描页等待视觉识别' : '文档结构与经历已完成解析';
      process.complete(completion);
      const message = result.photoImported
        ? '已在本机识别简历照片，并自动带入新的简历成品'
        : result.needsVision
          ? '检测到扫描版 PDF，请到“简历成品”运行视觉识别'
          : result.photoCandidateCount
            ? '检测到文档图片，但未把图标或整页扫描图误作证件照'
            : '简历已在本机解析完成';
      showToast(message);
    } else process.cancel();
  } catch (error) { process.fail('导入未完成'); showToast(error.message, 'error'); }
}

async function chooseResumePhoto() {
  const button = $('#choose-resume-photo');
  setButtonBusy(button, true, '处理照片中…');
  try {
    const result = await api.chooseResumePhoto();
    if (result.canceled) return;
    ui.state = result.state;
    renderStudio();
    showToast('照片已在本机完成裁切和隐私处理');
  } catch (error) { showToast(error.message, 'error'); }
  finally { setButtonBusy(button, false); }
}

async function removeResumePhoto() {
  try {
    ui.state = await api.removeResumePhoto();
    renderStudio();
    showToast('已从简历成品中移除照片');
  } catch (error) { showToast(error.message, 'error'); }
}

async function saveResumePhotoSettings() {
  updateDraftPreview();
  const revision = (ui.photoSettingsRevision || 0) + 1;
  ui.photoSettingsRevision = revision;
  try {
    const state = await api.saveResumePhotoSettings({
      photoShape: $('#resume-photo-shape').value,
      photoFit: $('#resume-photo-fit').value,
      photoScale: clamp($('#resume-photo-scale').value, 75, 130),
      showPhoto: $('#resume-photo-visible').checked,
    });
    if (revision === ui.photoSettingsRevision) ui.state = state;
  } catch (error) {
    if (revision === ui.photoSettingsRevision) renderStudio();
    showToast(error.message, 'error');
  }
}

async function createConversation() {
  try {
    const result = await api.createConversation();
    ui.state = result.state;
    ui.activeConversationId = result.conversationId;
    switchView('chat');
    renderAll();
    $('#message-input').focus();
  } catch (error) { showToast(error.message, 'error'); }
}

function openSettings() {
  const settings = ui.state.settings;
  $('#api-mode').value = settings.apiMode;
  $('#base-url').value = settings.baseUrl;
  $('#model').value = settings.model;
  $('#vision-model').value = settings.visionModel || '';
  $('#search-mode').value = settings.searchMode;
  $('#api-key').value = '';
  $('#tavily-key').value = '';
  $('#api-key-hint').textContent = settings.hasApiKey ? '已安全保存密钥；留空不会覆盖。' : '尚未保存密钥。';
  $('#tavily-key-hint').textContent = settings.hasTavilyKey ? '已安全保存密钥；留空不会覆盖。' : '尚未保存密钥。';
  toggleTavilyRow();
  $('#settings-modal').classList.remove('hidden');
}

function closeSettings() { $('#settings-modal').classList.add('hidden'); }
function toggleTavilyRow() { $('#tavily-row').classList.toggle('hidden', $('#search-mode').value !== 'tavily'); }

function settingsDraft() {
  return {
    apiMode: $('#api-mode').value,
    baseUrl: $('#base-url').value.trim(),
    model: $('#model').value.trim(),
    visionModel: $('#vision-model').value.trim(),
    apiKey: $('#api-key').value.trim(),
    searchMode: $('#search-mode').value,
    tavilyKey: $('#tavily-key').value.trim(),
  };
}

function setButtonBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.classList.add('busy');
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.classList.remove('busy');
    button.disabled = false;
  }
}

async function analyzeJobDescription(description, openStudio = true) {
  const content = String(description || '').trim();
  if (content.length < 40 || ui.analyzingJd) return;
  if (!ui.state.settings.hasApiKey || !ui.state.settings.model) {
    showToast('已检测到招聘需求，请先配置智能模型后再识别', 'error');
    return;
  }
  ui.analyzingJd = true;
  const buttons = [$('#analyze-jd'), $('#analyze-jd-context')];
  buttons.forEach((button) => setButtonBusy(button, true, '正在识别…'));
  try {
    ui.state = await api.analyzeJobDescription(content);
    renderAll();
    if (openStudio) switchView('studio');
    showToast('已识别招聘需求，并提取岗位关键词');
  } catch (error) { showToast(error.message, 'error'); }
  finally {
    ui.analyzingJd = false;
    buttons.forEach((button) => setButtonBusy(button, false));
  }
}

function careerIntelQuery() {
  return {
    company: $('#intel-company').value.trim(),
    role: $('#intel-role').value.trim(),
    location: $('#intel-location').value.trim() || '中国',
  };
}

function setCareerIntelStatus(message, error = false) {
  const holder = $('#career-intel-status');
  holder.textContent = message;
  holder.classList.toggle('error', error);
}

async function searchCareerJobs() {
  if (ui.careerSearching) return;
  const query = careerIntelQuery();
  if (!query.company && !query.role) { showToast('请至少填写目标公司或岗位', 'error'); return; }
  ui.careerSearching = true;
  setButtonBusy($('#search-jobs'), true, '正在核验公开职位…');
  setCareerIntelStatus('正在搜索公司官网、公开招聘平台和可信媒体线索，并核验投递入口…');
  try {
    ui.state = await api.searchJobs(query);
    renderAll();
    switchView('radar');
    setCareerIntelStatus('搜索完成。请打开来源页面确认岗位仍在招聘后再投递。');
    showToast(`已找到 ${ui.state.careerIntelligence?.jobSearch?.jobs?.length || 0} 条可核验线索`);
  } catch (error) {
    setCareerIntelStatus(error.message, true);
    showToast(error.message, 'error');
  } finally {
    ui.careerSearching = false;
    setButtonBusy($('#search-jobs'), false);
  }
}

async function buildCareerInterviewPack() {
  if (ui.interviewBuilding) return;
  const query = careerIntelQuery();
  if (!query.company || !query.role) { showToast('请同时填写目标公司和岗位', 'error'); return; }
  ui.interviewBuilding = true;
  setButtonBusy($('#build-interview-pack'), true, '正在整理近年公开资料…');
  setCareerIntelStatus('正在归纳近三年公开面经，区分 HR 问题、岗位问题和原创笔试趋势练习…');
  try {
    ui.state = await api.buildInterviewPack(query);
    ui.intelTab = 'hr';
    renderAll();
    switchView('radar');
    setCareerIntelStatus('面试情报已生成。公开面经仅供参考，练习题均为趋势推测而非真实在用题。');
    showToast('面试情报与原创练习题已生成');
  } catch (error) {
    setCareerIntelStatus(error.message, true);
    showToast(error.message, 'error');
  } finally {
    ui.interviewBuilding = false;
    setButtonBusy($('#build-interview-pack'), false);
  }
}

async function saveDraft(silent = false) {
  if (ui.visualEditing) syncPreviewToEditor();
  const content = $('#draft-editor').value.trim();
  if (!content) throw new Error('请先生成或填写简历内容。');
  ui.state = await api.saveDraft({
    content,
    ...designValues(),
  });
  renderStudio();
  if (!silent) showToast('简历成品已保存');
}

async function generateDraft() {
  if (ui.generatingDraft) return;
  const button = $('#generate-draft');
  ui.generatingDraft = true;
  setVisualEditing(false);
  setButtonBusy(button, true, '正在生成…');
  const process = beginProcessExperience('generate');
  try {
    ui.state = await api.generateDraft(designValues());
    renderAll();
    process.complete('内容重组与视觉排版已经完成');
    showToast('针对性简历已生成，可继续编辑和换版式');
  } catch (error) { process.fail('生成未完成'); showToast(error.message, 'error'); }
  finally { ui.generatingDraft = false; setButtonBusy(button, false); }
}

async function analyzeOriginalResume() {
  if (ui.runningVision) return;
  const button = $('#resume-vision');
  const hadPhoto = Boolean(ui.state?.optimizedResume?.photoDataUrl);
  ui.runningVision = true;
  setButtonBusy(button, true, '视觉模型识别中…');
  try {
    ui.state = await api.analyzeResumeVision();
    renderAll();
    showToast(!hadPhoto && ui.state.optimizedResume?.photoDataUrl
      ? '视觉模型已定位原简历照片，并在本机裁切带入成品'
      : '原简历视觉识别与版式检查完成');
  } catch (error) { showToast(error.message, 'error'); }
  finally { ui.runningVision = false; setButtonBusy(button, false); }
}

async function reviewDraftVision() {
  if (ui.runningVision) return;
  const button = $('#review-draft');
  ui.runningVision = true;
  setButtonBusy(button, true, '正在检查页面…');
  try {
    await saveDraft(true);
    ui.state = await api.reviewDraftVision();
    renderAll();
    showToast('视觉模型已检查实际 A4 页面');
  } catch (error) { showToast(error.message, 'error'); }
  finally { ui.runningVision = false; setButtonBusy(button, false); }
}

async function exportDraft(format) {
  try {
    await saveDraft(true);
    const result = await api.exportDraft(format);
    if (!result.canceled) showToast(`已导出 ${format === 'docx' ? 'Word' : 'PDF'} 文件`);
  } catch (error) { showToast(error.message, 'error'); }
}

async function bootstrap() {
  try {
    ui.state = await api.getState();
    renderAll();
  } catch (error) {
    showToast(`启动失败：${error.message}`, 'error');
  }
}

$$('[data-import-resume]').forEach((button) => button.addEventListener('click', importResume));
$$('[data-ui-theme-option]').forEach((button) => button.addEventListener('click', () => applyUiTheme(button.dataset.uiThemeOption)));
$$('.nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#career-intel-form').addEventListener('submit', (event) => { event.preventDefault(); searchCareerJobs(); });
$('#build-interview-pack').addEventListener('click', buildCareerInterviewPack);
$('#interview-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-intel-tab]');
  if (!button) return;
  ui.intelTab = button.dataset.intelTab;
  renderCareerIntelligence();
});
$('#new-chat-button').addEventListener('click', createConversation);
$('#settings-button').addEventListener('click', openSettings);
$('#context-toggle').addEventListener('click', openContextDrawer);
$('#context-close').addEventListener('click', closeContextDrawer);
$('#context-backdrop').addEventListener('click', closeContextDrawer);
$('#settings-close').addEventListener('click', closeSettings);
$('#settings-modal').addEventListener('click', (event) => { if (event.target === $('#settings-modal')) closeSettings(); });
$('#search-mode').addEventListener('change', toggleTavilyRow);
$('#analyze-jd').addEventListener('click', () => analyzeJobDescription($('#jd-workbench').value));
$('#analyze-jd-context').addEventListener('click', () => analyzeJobDescription($('#job-description').value));
[$('#jd-workbench'), $('#job-description')].forEach((field) => field.addEventListener('paste', () => {
  setTimeout(() => {
    const value = field.value.trim();
    if (field === $('#jd-workbench')) $('#job-description').value = value;
    else $('#jd-workbench').value = value;
    if (value.length >= 80) analyzeJobDescription(value);
  }, 80);
}));
$('#generate-draft').addEventListener('click', generateDraft);
$('#resume-vision').addEventListener('click', analyzeOriginalResume);
$('#review-draft').addEventListener('click', reviewDraftVision);
$('#save-draft').addEventListener('click', async () => { try { await saveDraft(); } catch (error) { showToast(error.message, 'error'); } });
$('#export-word').addEventListener('click', () => exportDraft('docx'));
$('#export-pdf').addEventListener('click', () => exportDraft('pdf'));
$('#draft-editor').addEventListener('input', updateDraftPreview);
[$('#resume-template'), $('#resume-accent'), $('#resume-font'), $('#resume-finish')].forEach((field) => field.addEventListener('change', updateDraftPreview));
$('#resume-density').addEventListener('change', () => {
  const parameters = DENSITY_PARAMETERS[$('#resume-density').value] || DENSITY_PARAMETERS.balanced;
  $('#resume-scale').value = parameters.fontScale;
  $('#resume-line-height').value = Math.round(parameters.lineHeight * 100);
  $('#resume-page-margin').value = parameters.pageMargin;
  updateDraftPreview();
});
[$('#resume-scale'), $('#resume-line-height'), $('#resume-page-margin')].forEach((field) => field.addEventListener('input', updateDraftPreview));
$('#choose-resume-photo').addEventListener('click', chooseResumePhoto);
$('#remove-resume-photo').addEventListener('click', removeResumePhoto);
[$('#resume-photo-shape'), $('#resume-photo-fit'), $('#resume-photo-visible')].forEach((field) => field.addEventListener('change', saveResumePhotoSettings));
$('#resume-photo-scale').addEventListener('input', () => {
  $('#resume-photo-scale-value').textContent = `${$('#resume-photo-scale').value}%`;
  updateDraftPreview();
  saveResumePhotoSettings();
});
$('#toggle-visual-edit').addEventListener('click', () => openShowcase({ edit: true }));
$('#resume-preview').addEventListener('input', () => {
  if (!ui.visualEditing) return;
  clearTimeout(syncPreviewToEditor.timer);
  syncPreviewToEditor.timer = setTimeout(syncPreviewToEditor, 80);
});
$('#resume-preview').addEventListener('paste', (event) => {
  if (!ui.visualEditing) return;
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain').slice(0, 20000) || '';
  document.execCommand('insertText', false, text);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#resume-showcase').classList.contains('hidden')) {
    event.preventDefault();
    closeShowcase();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
  if (ui.showcaseEditing) {
    event.preventDefault();
    saveShowcaseEdits().catch((error) => showToast(error.message, 'error'));
    return;
  }
  if (!ui.visualEditing && document.activeElement !== $('#draft-editor')) return;
  event.preventDefault();
  saveDraft().catch((error) => showToast(error.message, 'error'));
});
$('#template-gallery').addEventListener('click', (event) => {
  const card = event.target.closest('[data-template-card]');
  if (!card) return;
  $('#resume-template').value = card.dataset.templateCard;
  updateDraftPreview();
});
$('#apply-template-recommendation').addEventListener('click', () => {
  const recommendation = ui.state.templateRecommendation;
  if (!recommendation) return;
  $('#resume-template').value = recommendation.id;
  updateDraftPreview();
  showToast(`已采用“${recommendation.name}”模板`);
});
$('#design-presets').addEventListener('click', (event) => {
  const button = event.target.closest('[data-design-preset]');
  if (button) applyDesignPreset(button.dataset.designPreset);
});
$('#fullscreen-preview').addEventListener('click', () => openShowcase());
$('#showcase-close').addEventListener('click', closeShowcase);
$('#showcase-edit').addEventListener('click', async () => {
  if (!ui.showcaseEditing) { setShowcaseEditing(true, { focus: true }); return; }
  try {
    if (ui.showcaseDirty) await saveShowcaseEdits({ silent: true });
    setShowcaseEditing(false);
    syncShowcasePreview();
  } catch (error) { showToast(error.message, 'error'); }
});
$('#showcase-save').addEventListener('click', () => saveShowcaseEdits().catch((error) => showToast(error.message, 'error')));
$('#showcase-export-pdf').addEventListener('click', async () => {
  try {
    if (ui.showcaseEditing && ui.showcaseDirty) await saveShowcaseEdits({ silent: true });
    await exportDraft('pdf');
  } catch (error) { showToast(error.message, 'error'); }
});
$('#showcase-preview').addEventListener('input', () => {
  if (!ui.showcaseEditing) return;
  ui.showcaseRevision += 1;
  ui.showcaseDirty = true;
  $('#showcase-edit-status').textContent = '有未保存修改';
  clearTimeout(syncShowcaseToDraft.timer);
  syncShowcaseToDraft.timer = setTimeout(syncShowcaseToDraft, 260);
  clearTimeout(syncShowcaseToDraft.autoSaveTimer);
  syncShowcaseToDraft.autoSaveTimer = setTimeout(() => {
    if (ui.showcaseEditing && ui.showcaseDirty) saveShowcaseEdits({ silent: true }).catch((error) => showToast(`自动保存失败：${error.message}`, 'error'));
  }, 1400);
});
$('#showcase-preview').addEventListener('paste', (event) => {
  if (!ui.showcaseEditing) return;
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain').slice(0, 30000) || '';
  document.execCommand('insertText', false, text);
});
$('#showcase-editor-toolbar').addEventListener('mousedown', (event) => {
  if (event.target.closest('[data-editor-command]')) event.preventDefault();
});
$('#showcase-editor-toolbar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-editor-command]');
  if (!button || !ui.showcaseEditing) return;
  $('#showcase-preview').focus({ preventScroll: true });
  restoreShowcaseSelection();
  document.execCommand(button.dataset.editorCommand, false, button.dataset.editorValue || null);
  if (button.dataset.editorCommand !== 'copy') {
    ui.showcaseRevision += 1;
    ui.showcaseDirty = true;
    $('#showcase-edit-status').textContent = '有未保存修改';
  }
});
[
  [$('#editor-template'), $('#resume-template')],
  [$('#editor-font'), $('#resume-font')],
  [$('#editor-accent'), $('#resume-accent')],
  [$('#editor-finish'), $('#resume-finish')],
  [$('#editor-scale'), $('#resume-scale')],
  [$('#editor-line-height'), $('#resume-line-height')],
].forEach(([editorField, sourceField]) => editorField.addEventListener('change', () => applyEditorDesignChange(editorField, sourceField)));
$('#editor-block-style').addEventListener('change', (event) => {
  if (!ui.showcaseEditing) return;
  $('#showcase-preview').focus({ preventScroll: true });
  restoreShowcaseSelection();
  document.execCommand('formatBlock', false, event.target.value);
  ui.showcaseRevision += 1;
  ui.showcaseDirty = true;
  $('#showcase-edit-status').textContent = '有未保存修改';
});
document.addEventListener('selectionchange', () => {
  if (!ui.showcaseEditing) return;
  const selection = window.getSelection();
  if (!selection.rangeCount || !$('#showcase-preview').contains(selection.anchorNode)) return;
  ui.showcaseSelection = selection.getRangeAt(0).cloneRange();
});
$('#showcase-zoom').addEventListener('input', updateShowcaseZoom);
$('#showcase-system-fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('#resume-showcase').requestFullscreen();
  } catch (error) { showToast(`无法进入系统全屏：${error.message}`, 'error'); }
});
document.addEventListener('fullscreenchange', () => {
  $('#showcase-system-fullscreen').textContent = document.fullscreenElement ? '退出系统全屏' : '进入系统全屏';
});
$('#process-minimize').addEventListener('click', () => $('#process-experience').classList.add('hidden'));

$('#conversation-list').addEventListener('click', async (event) => {
  const row = event.target.closest('[data-conversation-id]');
  if (!row) return;
  if (event.target.closest('.conversation-delete')) {
    if (!confirm('确定删除这个改造任务吗？')) return;
    ui.state = await api.deleteConversation(row.dataset.conversationId);
    if (ui.activeConversationId === row.dataset.conversationId) ui.activeConversationId = ui.state.conversations[0]?.id || null;
  } else {
    ui.activeConversationId = row.dataset.conversationId;
    switchView('chat');
  }
  renderAll();
});

$('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    ui.state = await api.saveProfile({
      targetCompany: $('#target-company').value,
      targetRole: $('#target-role').value,
      jobDescription: $('#job-description').value,
      priorities: $('#priorities').value,
    });
    renderAll();
    closeContextDrawer();
    showToast('求职目标已保存');
  } catch (error) { showToast(error.message, 'error'); }
});

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    ui.state = await api.saveSettings(settingsDraft());
    renderAll();
    closeSettings();
    showToast('模型设置已保存');
  } catch (error) { showToast(error.message, 'error'); }
});

$('#test-connection').addEventListener('click', async () => {
  const button = $('#test-connection');
  button.disabled = true;
  button.textContent = '测试中…';
  try {
    const result = await api.testConnection(settingsDraft());
    showToast(result.message || '连接成功');
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = '测试连接'; }
});

$('#clear-data-button').addEventListener('click', async () => {
  if (!confirm('这会清空简历、对话、记忆和密钥，且无法恢复。确定继续吗？')) return;
  try {
    ui.state = await api.clearLocalData();
    ui.activeConversationId = null;
    renderAll();
    closeSettings();
    showToast('本地数据已清空');
  } catch (error) { showToast(error.message, 'error'); }
});

$('#composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#message-input');
  const message = input.value.trim();
  if (!message || ui.sending) return;
  ui.sending = true;
  input.value = '';
  input.style.height = 'auto';
  $('#send-button').disabled = true;
  const optimistic = { id: 'pending', role: 'user', content: message, createdAt: new Date().toISOString() };
  let conversation = currentConversation();
  if (!conversation) {
    conversation = { id: 'pending', title: message.slice(0, 24), messages: [] };
    ui.state.conversations.unshift(conversation);
    ui.activeConversationId = 'pending';
  }
  conversation.messages.push(optimistic);
  renderMessages();
  try {
    const result = await api.sendMessage({
      conversationId: ui.activeConversationId === 'pending' ? null : ui.activeConversationId,
      message,
      webSearch: $('#web-search').checked,
    });
    ui.state = result.state;
    ui.activeConversationId = result.conversationId;
  } catch (error) {
    ui.state = await api.getState();
    if (ui.activeConversationId === 'pending') ui.activeConversationId = ui.state.conversations[0]?.id || null;
    showToast(error.message, 'error');
  } finally {
    ui.sending = false;
    $('#send-button').disabled = false;
    renderAll();
    input.focus();
  }
});

$('#message-input').addEventListener('input', (event) => {
  event.target.style.height = 'auto';
  event.target.style.height = `${Math.min(event.target.scrollHeight, 130)}px`;
});
$('#message-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('#composer').requestSubmit();
  }
});

$('#quick-prompts').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  $('#message-input').value = button.textContent;
  $('#message-input').focus();
});

$('#resume-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-resume]');
  if (!button || !confirm('确定删除这份本地简历吗？')) return;
  try { ui.state = await api.removeResume(button.dataset.deleteResume); renderAll(); showToast('简历已删除'); }
  catch (error) { showToast(error.message, 'error'); }
});

$('#memory-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#memory-input');
  try { ui.state = await api.addMemory(input.value); input.value = ''; renderAll(); showToast('已加入长期记忆'); }
  catch (error) { showToast(error.message, 'error'); }
});

$('#memory-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-memory]');
  if (!button) return;
  try { ui.state = await api.removeMemory(button.dataset.deleteMemory); renderAll(); showToast('记忆已删除'); }
  catch (error) { showToast(error.message, 'error'); }
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 1080) closeContextDrawer();
});

let initialUiTheme = 'midnight';
try { initialUiTheme = localStorage.getItem('resume-reshape-ui-theme') || initialUiTheme; } catch {}
applyUiTheme(initialUiTheme);
installPointerSpotlight();
startLaunchExperience();
ui.ambientStop = startParticleField($('#ambient-particles'));
bootstrap();
