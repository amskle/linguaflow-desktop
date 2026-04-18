const { ipcRenderer } = require('electron');

// 监听 main.js 发来的 'translate-request' 事件
ipcRenderer.on('translate-request', async (event, text) => {
  const resultDiv = document.getElementById('lf-bubble-text');
  const langDiv = document.getElementById('lf-bubble-lang');
  
  resultDiv.innerHTML = '正在翻译...';
  
  try {
    // 这里调用你之前的 API 逻辑
    // 注意：如果你需要翻译超过 500 字，你需要更换 API 提供商
    // 或者在这里将 text 按照标点符号进行分段，使用 Promise.all 并发请求，最后拼接
    const result = await callTranslateAPI(text, 'auto', 'zh-CN'); 
    resultDiv.innerText = result;
  } catch (error) {
    resultDiv.innerText = '翻译失败: ' + error.message;
  }
});

async function callTranslateAPI(text, from, to) {
  // 复用你之前的 translateText 逻辑
  const langPair = `${from}|${to}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error('API Error');
}