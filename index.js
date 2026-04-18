
/* ========== 语言配置 ========== */
const LANGUAGES = [
    { code: 'auto', name: '自动检测' },
    { code: 'zh-CN', name: '中文简体' },
    { code: 'zh-TW', name: '中文繁体' },
    { code: 'en', name: '英语' },
    { code: 'ja', name: '日语' },
    { code: 'ko', name: '韩语' },
    { code: 'fr', name: '法语' },
    { code: 'de', name: '德语' },
    { code: 'es', name: '西班牙语' },
    { code: 'ru', name: '俄语' },
    { code: 'pt', name: '葡萄牙语' },
    { code: 'it', name: '意大利语' },
    { code: 'ar', name: '阿拉伯语' },
    { code: 'th', name: '泰语' },
    { code: 'vi', name: '越南语' },
    { code: 'id', name: '印尼语' },
    { code: 'nl', name: '荷兰语' },
    { code: 'pl', name: '波兰语' },
    { code: 'tr', name: '土耳其语' },
    { code: 'sv', name: '瑞典语' },
];
/* ========== DOM 元素引用 ========== */
const $sourceLang = document.getElementById('sourceLang');
const $targetLang = document.getElementById('targetLang');
const $sourceText = document.getElementById('sourceText');
const $resultContent = document.getElementById('resultContent');
const $charCount = document.getElementById('charCount');
const $translateBtn = document.getElementById('translateBtn');
const $swapBtn = document.getElementById('swapBtn');
const $copyBtn = document.getElementById('copyBtn');
const $speakBtn = document.getElementById('speakBtn');
const $pasteBtn = document.getElementById('pasteBtn');
const $clearBtn = document.getElementById('clearBtn');
const $historyBtn = document.getElementById('historyBtn');
const $historyPanel = document.getElementById('historyPanel');
const $historyList = document.getElementById('historyList');
const $closeHistoryBtn = document.getElementById('closeHistoryBtn');
const $clearHistoryBtn = document.getElementById('clearHistoryBtn');
const $detectedLang = document.getElementById('detectedLang');
const $toast = document.getElementById('toast');
/* ========== 状态 ========== */
let isTranslating = false;
let history = [];
let debounceTimer = null;
/* ========== 初始化 ========== */
async function init() {
    // 渲染语言选择器
    renderLanguageOptions();
    // 从 storage 加载设置
    try {
        const data = {
            sourceLang: localStorage.getItem('sourceLang'),
            targetLang: localStorage.getItem('targetLang'),
            history: JSON.parse(localStorage.getItem('history') || '[]')
        };
        if (data.sourceLang) $sourceLang.value = data.sourceLang;
        if (data.targetLang) $targetLang.value = data.targetLang;
        else $targetLang.value = 'zh-CN'; // 默认目标语言
        if (data.history) history = data.history;
    } catch (e) {
        // 非 Chrome 环境下的回退
        $targetLang.value = 'zh-CN';
    }
    renderHistory();
    // 尝试获取当前页面选中的文字
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.text && response.text.trim()) {
                    $sourceText.value = response.text.trim();
                    updateCharCount();
                    doTranslate();
                }
            });
        }
    } catch (e) {
        // 非 Chrome 环境忽略
    }
    bindEvents();
}
/* ========== 渲染语言选项 ========== */
function renderLanguageOptions() {
    LANGUAGES.forEach(lang => {
        // 源语言包含"自动检测"
        const optS = document.createElement('option');
        optS.value = lang.code;
        optS.textContent = lang.name;
        $sourceLang.appendChild(optS);
        // 目标语言不包含"自动检测"
        if (lang.code !== 'auto') {
            const optT = document.createElement('option');
            optT.value = lang.code;
            optT.textContent = lang.name;
            $targetLang.appendChild(optT);
        }
    });
    $sourceLang.value = 'auto';
    $targetLang.value = 'zh-CN';
}
/* ========== 事件绑定 ========== */
function bindEvents() {
    // 输入时自动翻译（防抖）
    $sourceText.addEventListener('input', () => {
        updateCharCount();
        clearTimeout(debounceTimer);
        if ($sourceText.value.trim()) {
            debounceTimer = setTimeout(doTranslate, 600);
        } else {
            clearResult();
        }
    });
    // 翻译按钮
    $translateBtn.addEventListener('click', doTranslate);
    // 交换语言
    $swapBtn.addEventListener('click', swapLanguages);
    // 复制结果
    $copyBtn.addEventListener('click', copyResult);
    // 朗读结果
    $speakBtn.addEventListener('click', speakResult);
    // 粘贴
    $pasteBtn.addEventListener('click', pasteFromClipboard);
    // 清空输入
    $clearBtn.addEventListener('click', clearAll);
    // 语言变更时保存
    $sourceLang.addEventListener('change', saveLangSettings);
    $targetLang.addEventListener('change', () => {
        saveLangSettings();
        if ($sourceText.value.trim()) doTranslate();
    });
    // 历史面板
    $historyBtn.addEventListener('click', () => $historyPanel.classList.add('open'));
    $closeHistoryBtn.addEventListener('click', () => $historyPanel.classList.remove('open'));
    $clearHistoryBtn.addEventListener('click', clearHistory);
    // 键盘快捷键
    $sourceText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            doTranslate();
        }
    });
}
/* ========== 简易语言检测 ========== */
function detectLanguage(text) {
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u0400-\u04ff]/.test(text)) return 'ru';
    if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
    return 'en';
}
/* ========== 翻译核心逻辑 ========== */
async function doTranslate() {
    const text = $sourceText.value.trim();
    if (!text || isTranslating) return;
    let sourceCode = $sourceLang.value;
    const targetCode = $targetLang.value;
    // 自动检测源语言
    if (sourceCode === 'auto') {
        sourceCode = detectLanguage(text);
        // 显示检测到的语言
        const detected = LANGUAGES.find(l => l.code === sourceCode);
        if (detected) {
            $detectedLang.textContent = `检测到：${detected.name}`;
        }
    } else {
        $detectedLang.textContent = '';
    }
    // 源语言和目标语言相同，无需翻译
    if (sourceCode === targetCode) {
        showResult(text);
        return;
    }
    setTranslating(true);
    try {
        const result = await translateText(text, sourceCode, targetCode);
        showResult(result);
        // 保存到历史
        addToHistory({
            source: text,
            target: result,
            from: sourceCode,
            to: targetCode,
            time: Date.now()
        });
    } catch (err) {
        showError(err.message || '翻译请求失败，请检查网络');
    } finally {
        setTranslating(false);
    }
}
/* ========== 调用翻译 API ========== */
async function translateText(text, from, to) {
    // 处理语言代码（MyMemory 使用 zh-CN 格式）
    const langPair = `${from}|${to}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('网络请求失败');
    const data = await response.json();
    if (data.responseStatus === 200 && data.responseData) {
        let translated = data.responseData.translatedText;
        // 如果有更好的匹配，使用匹配结果
        if (data.matches && data.matches.length > 0) {
            const bestMatch = data.matches.reduce((best, m) => {
                return (m.quality && parseInt(m.quality) > parseInt(best.quality || '0')) ? m : best;
            }, data.matches[0]);
            if (bestMatch.translation && parseInt(bestMatch.quality || '0') > 70) {
                translated = bestMatch.translation;
            }
        }
        return translated;
    }
    throw new Error(data.responseDetails || '翻译服务返回错误');
}
/* ========== UI 状态更新 ========== */
function setTranslating(state) {
    isTranslating = state;
    $translateBtn.disabled = state;
    if (state) {
        $translateBtn.innerHTML = '<div class="spinner"></div><span>翻译中...</span>';
    } else {
        $translateBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i><span>翻译</span>';
    }
}
function showResult(text) {
    $resultContent.textContent = text;
    $resultContent.classList.remove('result-placeholder');
    $resultContent.classList.add('translated');
    setTimeout(() => $resultContent.classList.remove('translated'), 300);
}
function showError(msg) {
    $resultContent.innerHTML = `<span style="color:var(--error);">${msg}</span>`;
    $resultContent.classList.remove('result-placeholder');
}
function clearResult() {
    $resultContent.innerHTML = '<span class="result-placeholder">翻译结果将在此显示</span>';
    $detectedLang.textContent = '';
}
function updateCharCount() {
    const len = $sourceText.value.length;
    $charCount.textContent = `${len} / 500`;
    $charCount.classList.toggle('warning', len > 450);
}
/* ========== 交换语言 ========== */
function swapLanguages() {
    // 不交换"自动检测"
    if ($sourceLang.value === 'auto') {
        showToast('自动检测模式下无法交换语言', 'error');
        return;
    }
    const tempLang = $sourceLang.value;
    $sourceLang.value = $targetLang.value;
    $targetLang.value = tempLang;
    // 同时交换文本
    const resultText = $resultContent.textContent;
    if (resultText && !$resultContent.classList.contains('result-placeholder')) {
        $sourceText.value = resultText;
        updateCharCount();
        doTranslate();
    }
    saveLangSettings();
}
/* ========== 复制结果 ========== */
async function copyResult() {
    const text = $resultContent.textContent;
    if (!text || $resultContent.querySelector('.result-placeholder')) return;
    try {
        await navigator.clipboard.writeText(text);
        showToast('已复制到剪贴板', 'success');
    } catch (e) {
        // 回退方案
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('已复制到剪贴板', 'success');
    }
}
/* ========== 朗读结果 ========== */
function speakResult() {
    const text = $resultContent.textContent;
    if (!text || $resultContent.querySelector('.result-placeholder')) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = $targetLang.value;
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
        showToast('正在朗读...', 'success');
    } else {
        showToast('当前浏览器不支持语音合成', 'error');
    }
}
/* ========== 粘贴 ========== */
async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        $sourceText.value = text;
        updateCharCount();
        if (text.trim()) doTranslate();
    } catch (e) {
        showToast('无法访问剪贴板', 'error');
    }
}
/* ========== 清空 ========== */
function clearAll() {
    $sourceText.value = '';
    updateCharCount();
    clearResult();
    $sourceText.focus();
}
/* ========== 保存语言设置 ========== */
function saveLangSettings() {
    try {
        chrome.storage.local.set({
            sourceLang: $sourceLang.value,
            targetLang: $targetLang.value
        });
    } catch (e) { /* 非 Chrome 环境忽略 */ }
}
/* ========== 历史记录 ========== */
function addToHistory(item) {
    // 去重：如果源文本和语言对相同，更新时间
    const idx = history.findIndex(h =>
        h.source === item.source && h.from === item.from && h.to === item.to
    );
    if (idx !== -1) {
        history.splice(idx, 1);
    }
    history.unshift(item);
    // 最多保留50条
    if (history.length > 50) history = history.slice(0, 50);
    saveHistory();
    renderHistory();
}
function saveHistory() {
    try {
        chrome.storage.local.set({ history });
    } catch (e) { /* 忽略 */ }
}
function renderHistory() {
    if (history.length === 0) {
        $historyList.innerHTML = `
	        <div class="history-empty">
	          <i class="fa-regular fa-clock"></i>
	          暂无翻译历史
	        </div>`;
        return;
    }
    $historyList.innerHTML = history.map((item, i) => {
        const fromName = (LANGUAGES.find(l => l.code === item.from) || {}).name || item.from;
        const toName = (LANGUAGES.find(l => l.code === item.to) || {}).name || item.to;
        const timeStr = formatTime(item.time);
        return `
    <div class="history-item" data-index="${i}">
        <div class="history-item-source">${escapeHtml(item.source)}</div>
        <div class="history-item-target">${escapeHtml(item.target)}</div>
        <div class="history-item-lang">${fromName} → ${toName} · ${timeStr}</div>
        <button class="history-item-delete" data-del="${i}" title="删除" aria-label="删除">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>`;
    }).join('');
    // 绑定点击事件
    $historyList.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.history-item-delete')) return;
            const idx = parseInt(el.dataset.index);
            const item = history[idx];
            if (item) {
                $sourceText.value = item.source;
                $sourceLang.value = item.from;
                $targetLang.value = item.to;
                updateCharCount();
                doTranslate();
                $historyPanel.classList.remove('open');
            }
        });
    });
    // 删除按钮
    $historyList.querySelectorAll('.history-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.del);
            history.splice(idx, 1);
            saveHistory();
            renderHistory();
        });
    });
}
function clearHistory() {
    history = [];
    saveHistory();
    renderHistory();
    showToast('历史已清空', 'success');
}
/* ========== 工具函数 ========== */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
let toastTimer = null;
function showToast(msg, type = 'success') {
    clearTimeout(toastTimer);
    const iconMap = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation'
    };
    $toast.className = `toast ${type}`;
    $toast.innerHTML = `<i class="fa-solid ${iconMap[type] || iconMap.success}"></i>${msg}`;
    requestAnimationFrame(() => {
        $toast.classList.add('show');
    });
    toastTimer = setTimeout(() => {
        $toast.classList.remove('show');
    }, 2000);
}
/* ========== 启动 ========== */
init();
