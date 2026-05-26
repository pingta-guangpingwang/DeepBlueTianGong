// 深蓝天工 · 知识采集引擎 — Electron 主进程

import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import * as path from 'path'
import { registerResourceIpc } from './ipc/resourceIpc'
import { registerPendingIpc } from './ipc/pendingIpc'
import { registerCollectorIpc } from './ipc/collectorIpc'
import { registerRepoIpc } from './ipc/repoIpc'

const preloadPath = path.join(__dirname, 'preload.js')

app.commandLine.appendSwitch('disable-gpu-sandbox')

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
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
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (process.env.NODE_ENV === 'development') {
    const port = process.env.VITE_DEV_PORT || '29348'
    win.loadURL(`http://localhost:${port}`)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  return win
}

function registerAllHandlers() {
  Menu.setApplicationMenu(null)
  registerResourceIpc()
  registerPendingIpc()
  registerCollectorIpc()
  registerRepoIpc()

  // 窗口控制
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
}

// ---- 单实例锁 ----

const MY_PID = process.pid
console.log('[TianGong] 进程启动 PID=', MY_PID)

const gotLock = app.requestSingleInstanceLock()
console.log('[TianGong] 单实例锁:', gotLock ? '已获取' : '未获取', 'PID=', MY_PID)

if (!gotLock) {
  console.log('[TianGong] 已有实例运行中，本进程退出 PID=', MY_PID)
  app.exit(0)
}

app.on('second-instance', () => {
  console.log('[TianGong] 收到 second-instance 事件，显示主窗口 PID=', MY_PID)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ---- 生命周期 ----

app.whenReady().then(async () => {
  console.log('[TianGong] app.whenReady 开始初始化 PID=', MY_PID)
  mainWindow = createMainWindow()
  registerAllHandlers()
})

const forceExit = (sig: string) => process.on(sig, () => {
  console.log('[TianGong] 收到', sig, '信号，退出')
  app.quit()
  setTimeout(() => { console.log('[TianGong] quit 超时，强制退出'); app.exit(0) }, 2000)
})
forceExit('SIGINT')
forceExit('SIGTERM')
forceExit('SIGHUP')

app.on('window-all-closed', () => {
  console.log('[TianGong] 所有窗口已关闭，退出进程')
  app.quit()
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
  } else {
    mainWindow = createMainWindow()
  }
})

process.on('uncaughtException', (err) => {
  console.error('[TianGong] 未捕获异常:', err.message)
  console.error(err.stack)
})
process.on('unhandledRejection', (reason) => {
  console.error('[TianGong] 未处理的 Promise 拒绝:', reason)
})
