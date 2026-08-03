const assert = require('node:assert/strict');
const test = require('node:test');
const { extractResponseText, parseRawResponseText, responseShape } = require('../electron/response-parser.cjs');

test('parses Chat Completions string content', () => {
  assert.equal(extractResponseText({
    choices: [{ message: { content: '  正常回答  ' } }],
  }), '正常回答');
});

test('parses compatible content arrays', () => {
  assert.equal(extractResponseText({
    choices: [{ message: { content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] } }],
  }), '第一段\n第二段');
});

test('parses Responses API output blocks', () => {
  assert.equal(extractResponseText({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Responses 回答' }] }],
  }), 'Responses 回答');
});

test('parses nested text value and reasoning gateway fallback', () => {
  assert.equal(extractResponseText({
    choices: [{ message: { content: [{ text: { value: '嵌套回答' } }] } }],
  }), '嵌套回答');
  assert.equal(extractResponseText({
    choices: [{ message: { content: '', reasoning_content: '仅推理字段返回' } }],
  }), '仅推理字段返回');
});

test('parses Ollama and Gemini native-shaped responses', () => {
  assert.equal(extractResponseText({ message: { content: 'Ollama 回答' } }), 'Ollama 回答');
  assert.equal(extractResponseText({ candidates: [{ content: { parts: [{ text: 'Gemini 回答' }] } }] }), 'Gemini 回答');
});

test('surfaces response shape when text is missing', () => {
  assert.match(responseShape({ choices: [{ finish_reason: 'length', message: { role: 'assistant' } }] }), /finish_reason：length/);
  assert.throws(
    () => extractResponseText({ choices: [{ finish_reason: 'length', message: { role: 'assistant' } }] }),
    /返回结构.*finish_reason：length/,
  );
});

test('treats HTTP-200 error objects as errors', () => {
  assert.throws(() => extractResponseText({ error: { message: 'model unavailable' } }), /model unavailable/);
});

test('parses Chat Completions SSE returned by a relay', () => {
  const raw = [
    'data: {"choices":[{"delta":{"content":"你"}}]}',
    'data: {"choices":[{"delta":{"content":" 好"}}]}',
    'data: [DONE]',
  ].join('\n\n');
  assert.equal(extractResponseText({ raw, contentType: 'text/event-stream' }), '你 好');
});

test('parses Responses API SSE deltas', () => {
  const raw = [
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"第一段"}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"第二段"}',
  ].join('\n');
  assert.equal(parseRawResponseText(raw), '第一段第二段');
});

test('parses NDJSON and plain-text responses', () => {
  const ndjson = [
    '{"message":{"content":"本地"},"done":false}',
    '{"message":{"content":"模型"},"done":true}',
  ].join('\n');
  assert.equal(parseRawResponseText(ndjson), '本地模型');
  assert.equal(parseRawResponseText('纯文本回答'), '纯文本回答');
});

test('explains HTML responses caused by an incorrect endpoint', () => {
  assert.throws(
    () => parseRawResponseText('<!doctype html><html><body>gateway</body></html>'),
    /返回的是 HTML 网页.*API 地址/,
  );
});
