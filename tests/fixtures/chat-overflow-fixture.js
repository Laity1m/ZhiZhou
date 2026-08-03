const messages = document.querySelector('#messages');
const longText = '这是一段用于验证聊天记录滚动区域的长消息。输入框应始终固定在当前窗口底部，只有消息列表自身可以滚动。'.repeat(10);

for (let index = 0; index < 12; index += 1) {
  const message = document.createElement('article');
  message.className = `message ${index % 2 === 0 ? 'user' : 'assistant'}`;
  message.innerHTML = `
    <div class="avatar">${index % 2 === 0 ? '你' : 'R'}</div>
    <div class="message-body">
      <div class="message-meta">测试消息 ${index + 1}</div>
      <div class="message-content">${longText}</div>
    </div>`;
  messages.appendChild(message);
}
