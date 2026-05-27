"use strict";
// 深蓝天工 · 知识采集引擎 — Electron 主进程
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// 早期检测：ELECTRON_RUN_AS_NODE 会导致 Electron 以纯 Node.js 模式运行
// 注意：getenv() 在 C/C++ 中对空字符串也会返回非 NULL（即真值），
// 所以必须完全删除此变量，不能仅设为空字符串。
if (process.env.ELECTRON_RUN_AS_NODE !== undefined) {
    console.error('');
    console.error('========================================');
    console.error('  错误: ELECTRON_RUN_AS_NODE 环境变量已设置');
    console.error('========================================');
    console.error('');
    console.error('此变量会导致 Electron 以纯 Node.js 模式运行，app 对象不可用。');
    console.error('请先清除此环境变量后再启动：');
    console.error('');
    console.error('  Windows CMD:  set ELECTRON_RUN_AS_NODE=');
    console.error('  Windows PS:   Remove-Item Env:\\ELECTRON_RUN_AS_NODE');
    console.error('  Git Bash:     unset ELECTRON_RUN_AS_NODE');
    console.error('');
    console.error('或直接使用 start.bat 启动（已自动清除）。');
    console.error('');
    process.exit(1);
}
console.log('[TianGong] 诊断: ELECTRON_RUN_AS_NODE=', JSON.stringify(process.env.ELECTRON_RUN_AS_NODE));
console.log('[TianGong] 诊断: NODE_ENV=', JSON.stringify(process.env.NODE_ENV));
console.log('[TianGong] 诊断: __dirname=', __dirname);
console.log('[TianGong] 诊断: 开始加载依赖...');
const electron_1 = require("electron");
console.log('[TianGong] 诊断: electron 导入成功, app.commandLine=', typeof electron_1.app?.commandLine);
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const resourceIpc_1 = require("./ipc/resourceIpc");
const pendingIpc_1 = require("./ipc/pendingIpc");
const collectorIpc_1 = require("./ipc/collectorIpc");
const repoIpc_1 = require("./ipc/repoIpc");
const skillIpc_1 = require("./ipc/skillIpc");
console.log('[TianGong] 诊断: IPC 模块导入成功');
const skillRegistry_1 = require("./collector/skillRegistry");
const sourceConfig_1 = require("./config/sourceConfig");
console.log('[TianGong] 诊断: 所有模块导入成功');
const preloadPath = path.join(__dirname, 'preload.js');
console.log('[TianGong] 诊断: preload 路径=', preloadPath, '存在=', fs.existsSync(preloadPath));
electron_1.app.commandLine.appendSwitch('disable-gpu-sandbox');
let mainWindow = null;
function createMainWindow() {
    console.log('[TianGong] 诊断: 开始创建 BrowserWindow...');
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        title: '深蓝天工 · 知识采集引擎',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });
    console.log('[TianGong] 诊断: BrowserWindow 创建成功');
    win.once('ready-to-show', () => {
        win.show();
    });
    if (process.env.NODE_ENV === 'development') {
        let port = process.env.VITE_DEV_PORT || '29348';
        // 读取 Vite 实际端口（strictPort 模式下通常一致，但做兜底）
        try {
            const portFile = path.join(__dirname, '..', '.vite', 'port');
            if (fs.existsSync(portFile)) {
                port = fs.readFileSync(portFile, 'utf-8').trim();
            }
        }
        catch { /* fallback to env/default */ }
        const devUrl = `http://localhost:${port}`;
        console.log('[TianGong] 诊断: 开发模式, 加载 URL=', devUrl);
        win.loadURL(devUrl);
    }
    else {
        const prodPath = path.join(__dirname, '..', 'dist', 'index.html');
        console.log('[TianGong] 诊断: 生产模式, 加载文件=', prodPath, '存在=', fs.existsSync(prodPath));
        win.loadFile(prodPath);
    }
    return win;
}
async function registerAllHandlers() {
    console.log('[TianGong] 诊断: 开始注册 IPC 处理器...');
    electron_1.Menu.setApplicationMenu(null);
    (0, resourceIpc_1.registerResourceIpc)();
    (0, pendingIpc_1.registerPendingIpc)();
    (0, collectorIpc_1.registerCollectorIpc)();
    (0, repoIpc_1.registerRepoIpc)();
    (0, skillIpc_1.registerSkillIpc)();
    console.log('[TianGong] 诊断: IPC 处理器注册完成');
    // 初始化 Skill 系统
    sourceConfig_1.sourceConfig.ensureSkillIds();
    await skillRegistry_1.skillRegistry.discover();
    const manifests = skillRegistry_1.skillRegistry.getKnownManifests();
    console.log('[TianGong] 已发现 Skills:', manifests.map(m => m.id).join(', ') || '(无)');
    // 窗口控制
    electron_1.ipcMain.handle('window:minimize', () => mainWindow?.minimize());
    electron_1.ipcMain.handle('window:maximize', () => {
        if (mainWindow?.isMaximized())
            mainWindow.unmaximize();
        else
            mainWindow?.maximize();
    });
    electron_1.ipcMain.handle('window:close', () => mainWindow?.close());
}
// ---- 单实例锁 ----
const MY_PID = process.pid;
console.log('[TianGong] 进程启动 PID=', MY_PID);
const gotLock = electron_1.app.requestSingleInstanceLock();
console.log('[TianGong] 单实例锁:', gotLock ? '已获取' : '未获取', 'PID=', MY_PID);
if (!gotLock) {
    console.log('[TianGong] 已有实例运行中，本进程退出 PID=', MY_PID);
    electron_1.app.exit(0);
}
electron_1.app.on('second-instance', () => {
    console.log('[TianGong] 收到 second-instance 事件，显示主窗口 PID=', MY_PID);
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.focus();
    }
});
// ---- 生命周期 ----
electron_1.app.whenReady().then(async () => {
    console.log('[TianGong] app.whenReady 开始初始化 PID=', MY_PID);
    try {
        mainWindow = createMainWindow();
        console.log('[TianGong] 诊断: 主窗口创建完成, 开始注册处理器...');
        await registerAllHandlers();
        console.log('[TianGong] 诊断: 初始化全部完成');
    }
    catch (err) {
        console.error('[TianGong] 诊断: 初始化失败:', err?.message || err);
        console.error(err?.stack);
    }
});
const forceExit = (sig) => process.on(sig, () => {
    console.log('[TianGong] 收到', sig, '信号，退出');
    electron_1.app.quit();
    setTimeout(() => { console.log('[TianGong] quit 超时，强制退出'); electron_1.app.exit(0); }, 2000);
});
forceExit('SIGINT');
forceExit('SIGTERM');
forceExit('SIGHUP');
electron_1.app.on('window-all-closed', () => {
    console.log('[TianGong] 所有窗口已关闭，退出进程');
    electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (mainWindow) {
        mainWindow.show();
    }
    else {
        mainWindow = createMainWindow();
    }
});
process.on('uncaughtException', (err) => {
    console.error('[TianGong] ========================================');
    console.error('[TianGong] 未捕获异常:', err.message);
    console.error('[TianGong] 异常类型:', err.name);
    console.error(err.stack);
    console.error('[TianGong] ========================================');
});
process.on('unhandledRejection', (reason) => {
    console.error('[TianGong] ========================================');
    console.error('[TianGong] 未处理的 Promise 拒绝:', reason);
    if (reason instanceof Error) {
        console.error('[TianGong] 错误类型:', reason.name);
        console.error(reason.stack);
    }
    console.error('[TianGong] ========================================');
});
