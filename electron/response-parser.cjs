function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function textFromPart(part, depth = 0) {
  if (depth > 5 || part == null) return '';
  if (typeof part === 'string') return cleanText(part);
  if (Array.isArray(part)) {
    return part.map((item) => textFromPart(item, depth + 1)).filter(Boolean).join('\n').trim();
  }
  if (typeof part !== 'object') return '';

  // Compatible APIs variously use text, value, content or parts for a text block.
  const candidates = [
    part.text,
    part.value,
    part.content,
    part.output_text,
    part.parts,
  ];
  for (const candidate of candidates) {
    const text = textFromPart(candidate, depth + 1);
    if (text) return text;
  }
  return '';
}

function streamChunk(payload) {
  const choice = payload?.choices?.[0];
  const delta = choice?.delta;
  const candidates = [
    delta?.content,
    payload?.type === 'response.output_text.delta' ? payload.delta : '',
    payload?.delta?.text,
    payload?.content_block?.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate;
    if (Array.isArray(candidate)) {
      const value = candidate.map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      }).join('');
      if (value) return value;
    }
  }
  return '';
}

function reasoningStreamChunk(payload) {
  const delta = payload?.choices?.[0]?.delta;
  const candidates = [delta?.reasoning_content, delta?.reasoning, payload?.delta?.thinking];
  return candidates.find((value) => typeof value === 'string' && value) || '';
}

function finalEventText(payload) {
  const candidates = [
    payload?.choices?.[0]?.message?.content,
    payload?.message?.content,
    payload?.response?.output_text,
    payload?.response?.output,
    payload?.content,
  ];
  for (const candidate of candidates) {
    const text = textFromPart(candidate);
    if (text) return text;
  }
  return '';
}

function parseRawResponseText(raw) {
  const source = cleanText(String(raw || '').replace(/^\uFEFF/, ''));
  if (!source) throw new Error('AI 接口返回了空文本响应。');

  if (/^\s*<(?:!doctype|html|head|body)\b/i.test(source)) {
    throw new Error('AI 接口返回的是 HTML 网页，不是模型结果。请检查 API 地址是否填写到正确的 /v1 路径。');
  }

  // A UTF-8 BOM or an incorrect content-type can make valid JSON enter the raw branch.
  if (/^[{[]/.test(source)) {
    try {
      const parsed = JSON.parse(source);
      return extractResponseText(parsed);
    } catch (error) {
      if (!/JSON|position|Unexpected token|Expected property/i.test(String(error?.message))) throw error;
    }
  }

  const jsonPayloads = [];
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    let value = line.trim();
    if (!value || value.startsWith(':') || /^event:/i.test(value)) continue;
    if (/^data:/i.test(value)) value = value.slice(5).trimStart();
    if (!value || value === '[DONE]') continue;
    try {
      jsonPayloads.push(JSON.parse(value));
    } catch {
      // Non-JSON lines are handled as plain text below.
    }
  }

  if (jsonPayloads.length) {
    const contentChunks = jsonPayloads.map(streamChunk).filter(Boolean);
    if (contentChunks.length) return contentChunks.join('').trim();

    const finalTexts = jsonPayloads.map(finalEventText).filter(Boolean);
    if (finalTexts.length) return finalTexts.join('').trim();

    const reasoningChunks = jsonPayloads.map(reasoningStreamChunk).filter(Boolean);
    if (reasoningChunks.length) return reasoningChunks.join('').trim();

    const shapes = jsonPayloads.slice(0, 3).map(responseShape).filter(Boolean).join(' | ');
    throw new Error(`接口返回了流式数据，但流中没有文本片段。${shapes ? ` 数据结构：${shapes}` : ''}`);
  }

  if (/\bdata\s*:/i.test(source) || /\bevent\s*:/i.test(source)) {
    throw new Error('接口返回了无法识别的流式数据。请确认中转站提供 OpenAI 兼容的 SSE 格式。');
  }

  return source;
}

function responseShape(body) {
  const top = body && typeof body === 'object' ? Object.keys(body).slice(0, 12) : [];
  const choice = body?.choices?.[0];
  const message = choice?.message;
  const details = [
    top.length ? `顶层字段：${top.join(', ')}` : '',
    choice && typeof choice === 'object' ? `choice 字段：${Object.keys(choice).slice(0, 10).join(', ')}` : '',
    message && typeof message === 'object' ? `message 字段：${Object.keys(message).slice(0, 10).join(', ')}` : '',
    choice?.finish_reason ? `finish_reason：${choice.finish_reason}` : '',
    body?.status ? `status：${body.status}` : '',
    body?.incomplete_details?.reason ? `未完成原因：${body.incomplete_details.reason}` : '',
  ].filter(Boolean);
  return details.join('；');
}

function extractResponseText(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('AI 接口返回了空响应或非 JSON 对象。');
  }

  // Some compatible services return an error object with HTTP 200.
  if (body.error) {
    const message = typeof body.error === 'string'
      ? body.error
      : body.error.message || body.error.type || JSON.stringify(body.error).slice(0, 300);
    throw new Error(`AI 服务返回异常：${message}`);
  }

  if (typeof body.raw === 'string') return parseRawResponseText(body.raw);

  // OpenAI Responses API returns message content blocks in output[].
  if (Array.isArray(body.output)) {
    const parts = [];
    for (const item of body.output) {
      const text = textFromPart(item?.content);
      if (text) parts.push(text);
    }
    if (parts.length) return [...new Set(parts)].join('\n').trim();
  }

  const choice = body.choices?.[0];
  const message = choice?.message;
  const candidates = [
    body.output_text,
    message?.content,
    choice?.text,
    body.message?.content,
    body.content,
    body.response,
    body.answer,
    body.completion,
    body.generated_text,
    body.result?.content,
    body.data?.output_text,
    body.data?.content,
    body.candidates?.[0]?.content?.parts,
    // A few reasoning-model gateways put the only generated text here.
    message?.reasoning_content,
    message?.reasoning,
  ];

  for (const candidate of candidates) {
    const text = textFromPart(candidate);
    if (text) return text;
  }

  const shape = responseShape(body);
  throw new Error(`接口返回成功，但未找到可显示的文本内容。${shape ? ` 返回结构：${shape}` : ''}`);
}

module.exports = { extractResponseText, parseRawResponseText, responseShape, textFromPart };
