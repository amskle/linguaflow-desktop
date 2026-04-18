const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, screen } = require('electron');
const { keyboard, Key } = require("@nut-tree/nut-js");

let mainWindow;
let bubbleWindow;

function createWindow() {
    // 1. 创建主面板窗口 (对应原先的 popup)
    mainWindow = new BrowserWindow({
        width: 400,
        height: 580,
        show: true, // 默认隐藏，可以通过系统托盘或快捷键呼出
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    mainWindow.loadFile('index.html');

    // 2. 创建划词翻译悬浮气泡窗口
    bubbleWindow = new BrowserWindow({
        width: 380,
        height: 250,
        frame: false,        // 无边框
        transparent: true,   // 背景透明，实现气泡悬浮效果
        alwaysOnTop: true,   // 永远置顶
        show: false,         // 初始隐藏
        skipTaskbar: true,   // 不在任务栏显示
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    bubbleWindow.loadFile('bubble.html');

    // 监听失去焦点事件，自动隐藏气泡
    bubbleWindow.on('blur', () => {
        bubbleWindow.hide();
    });
}

app.whenReady().then(() => {
    createWindow();

    // 注册全局划词快捷键 (例如 Alt+T)
    // 注意：这里回调函数前面加了 async
    globalShortcut.register('Alt+T', async () => {
        // 备份当前剪贴板 (可选)
        const oldText = clipboard.readText();

        // 使用 nut-js 模拟按下复制快捷键 (Mac 是 command+c，Windows 是 control+c)
        const modifier = process.platform === 'darwin' ? Key.LeftSuper : Key.LeftControl;
        await keyboard.type(modifier, Key.C);

        // 等待 150 毫秒让系统完成复制动作 (稍微延长一点更稳妥)
        setTimeout(() => {
            const selectedText = clipboard.readText();

            // 如果提取到了文本
            if (selectedText && selectedText.trim().length > 0) {
                // 获取当前鼠标位置
                const cursorPoint = screen.getCursorScreenPoint();

                // 将气泡窗口移动到鼠标附近并显示
                bubbleWindow.setPosition(cursorPoint.x + 15, cursorPoint.y + 15);
                bubbleWindow.show();

                // 将提取到的文本发送给气泡窗口进行翻译
                bubbleWindow.webContents.send('translate-request', selectedText.trim());
            }
        }, 150);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});