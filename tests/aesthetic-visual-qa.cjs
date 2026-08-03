const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { buildResumeHtml } = require('../electron/resume-workflow.cjs');

app.setPath('userData', path.join(__dirname, '..', 'tmp', 'electron-qa-profile'));
app.commandLine.appendSwitch('disable-gpu');

const CONTENT = `# 林知夏
产品策略与增长负责人｜上海｜138 0000 0000｜lin@example.com

## 职业概述
8 年互联网产品与增长经验，擅长把复杂业务拆成可验证的产品路径。近三年聚焦企业服务与 AI 工具，从用户研究、策略设计到跨团队落地全程负责。

## 核心能力
- 产品策略与路线图规划｜用户研究与数据分析｜跨团队项目推进
- AI 产品设计｜增长实验｜商业化与关键客户交付

## 工作经历
### 澄明科技｜产品策略负责人｜2022.06–至今
- 重新梳理从线索到续费的核心旅程，与销售和交付团队共同建立分层运营机制，重点客户续约沟通周期缩短约 30%。
- 主导 AI 助手从概念验证到正式上线，结合 20 余场用户访谈调整信息架构，首月覆盖 4 个核心业务场景。
- 建立双周产品评审与指标复盘机制，让需求优先级、实验结果和业务反馈形成稳定闭环。

### 远岸互联｜高级产品经理｜2018.07–2022.05
- 负责企业协作产品的增长与体验，围绕新用户首周行为设计引导流程，使关键功能启用率从 46% 提升至 63%。
- 与设计、研发及客户成功团队推进多个版本交付，并将高频客诉沉淀为可复用的体验检查清单。

## 代表项目
### 行业知识助手｜产品负责人
- 将散落在文档、工单与培训资料中的知识重组为可追溯答案，设计引用来源、纠错反馈和权限边界。
- 通过小范围共创测试验证真实使用场景，再逐步扩展至售前、交付和内部培训。

## 教育经历
华东理工大学｜信息管理与信息系统｜本科｜2014–2018

## 其他
英语 CET-6｜长期关注信息设计、服务体验与生成式 AI 产品。`;

app.whenReady().then(async () => {
  const outputDir = process.env.RESUME_QA_DIR;
  if (!outputDir) throw new Error('请通过 RESUME_QA_DIR 指定视觉验证输出目录。');
  fs.mkdirSync(outputDir, { recursive: true });
  const templates = (process.env.RESUME_QA_TEMPLATES || 'professional,editorial').split(',').filter(Boolean);
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    for (const template of templates) {
      const html = buildResumeHtml(CONTENT, {
        template,
        accent: template === 'editorial' ? 'burgundy' : 'navy',
        font: template === 'editorial' ? 'song' : 'clean',
        density: 'balanced',
        finish: process.env.RESUME_QA_FINISH || 'soft',
      });
      const htmlPath = path.join(outputDir, `${template}.html`);
      fs.writeFileSync(htmlPath, html);
      await window.loadFile(htmlPath);
      const pdf = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(path.join(outputDir, `${template}.pdf`), pdf);
    }
    console.log(`视觉验证 PDF 已生成：${templates.join('、')}`);
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
});
