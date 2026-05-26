// 采集控制 IPC 处理器

import { ipcMain, BrowserWindow } from 'electron'

// 采集状态（Phase 3 实现采集引擎后连接）
let collectorRunning = false
let collectorHistory: Array<{
  sourceId: string
  startedAt: string
  finishedAt?: string
  collected: number
  failed: number
  status: 'running' | 'done' | 'aborted' | 'error'
}> = []

export function registerCollectorIpc(): void {

  ipcMain.handle('collector:run', async (event, sourceId: string) => {
    if (collectorRunning) {
      return { success: false, message: '已有采集任务运行中' }
    }
    // Phase 3: 连接 CollectorEngine
    const win = BrowserWindow.fromWebContents(event.sender)
    collectorRunning = true
    const entry = {
      sourceId,
      startedAt: new Date().toISOString(),
      collected: 0,
      failed: 0,
      status: 'running' as const,
    }
    collectorHistory.unshift(entry)

    if (win) {
      win.webContents.send('collector:event', {
        type: 'started',
        sourceId,
        message: `采集任务已启动: ${sourceId}`,
      })
    }

    // 占位：实际采集由 CollectorEngine 驱动
    return { success: true, message: '采集任务已启动' }
  })

  ipcMain.handle('collector:abort', async () => {
    collectorRunning = false
    const running = collectorHistory.find(h => h.status === 'running')
    if (running) {
      running.status = 'aborted'
      running.finishedAt = new Date().toISOString()
    }
    return { success: true, message: '采集已中止' }
  })

  ipcMain.handle('collector:status', async () => {
    return {
      running: collectorRunning,
      currentTask: collectorHistory.find(h => h.status === 'running') || null,
    }
  })

  ipcMain.handle('collector:history', async () => {
    return collectorHistory
  })
}
