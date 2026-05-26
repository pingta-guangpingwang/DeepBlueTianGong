// 采集控制 IPC 处理器 — 连接 CollectorEngine

import { ipcMain, BrowserWindow } from 'electron'
import { collectorEngine, ProgressEvent, CollectResult } from '../collector/collectorEngine'
import { scheduler } from '../collector/scheduler'
import { sourceConfig } from '../config/sourceConfig'

// 采集历史
const collectorHistory: Array<{
  sourceId: string
  sourceName: string
  startedAt: string
  finishedAt?: string
  collected: number
  failed: number
  rejected: number
  durationMs: number
  status: 'running' | 'done' | 'aborted' | 'error'
}> = []

// 设置引擎联动
scheduler.setEngine(collectorEngine)

// 监听引擎进度，推送到渲染进程
collectorEngine.on('progress', (event: ProgressEvent) => {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('collector:event', event)
  }
})

// 监听自动提交
collectorEngine.on('auto_submit', async ({ sourceId, targetRepo }) => {
  console.log('[CollectorIPC] 自动提交流程触发:', sourceId, '->', targetRepo)
  // 由 pendingIpc 的 contribution:commit-all 处理
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('collector:event', {
      type: 'auto_submit_triggered',
      sourceId,
      targetRepo,
      message: '采集完成，触发自动审核+提交',
    })
  }
})

export function registerCollectorIpc(): void {

  ipcMain.handle('collector:run', async (event, sourceId: string) => {
    const source = sourceConfig.getSource(sourceId)
    if (!source) {
      return { success: false, message: `采集源 ${sourceId} 不存在` }
    }

    if (collectorEngine.isRunning()) {
      return { success: false, message: '已有采集任务运行中，请等待完成或先中止' }
    }

    const entry = {
      sourceId,
      sourceName: source.name,
      startedAt: new Date().toISOString(),
      collected: 0,
      failed: 0,
      rejected: 0,
      durationMs: 0,
      status: 'running' as const,
    }
    collectorHistory.unshift(entry)

    // 异步运行，不阻塞 IPC 返回
    collectorEngine.runSource(sourceId).then((result: CollectResult) => {
      const running = collectorHistory.find(h => h.sourceId === sourceId && h.status === 'running')
      if (running) {
        running.status = result.status
        running.finishedAt = new Date().toISOString()
        running.collected = result.collected
        running.failed = result.failed
        running.rejected = result.rejected
        running.durationMs = result.durationMs
      }
    }).catch((err) => {
      const running = collectorHistory.find(h => h.sourceId === sourceId && h.status === 'running')
      if (running) {
        running.status = 'error'
        running.finishedAt = new Date().toISOString()
      }
      console.error('[CollectorIPC] 采集失败:', err)
    })

    return { success: true, message: `采集任务已启动: ${source.name}` }
  })

  ipcMain.handle('collector:abort', async () => {
    collectorEngine.abort()
    const running = collectorHistory.find(h => h.status === 'running')
    if (running) {
      running.status = 'aborted'
      running.finishedAt = new Date().toISOString()
    }
    return { success: true, message: '采集已中止' }
  })

  ipcMain.handle('collector:status', async () => {
    return {
      running: collectorEngine.isRunning(),
      currentSourceId: collectorEngine.getCurrentSourceId(),
      pool: collectorEngine.getPoolStatus(),
      history: collectorHistory.slice(0, 10),
    }
  })

  ipcMain.handle('collector:history', async () => {
    return collectorHistory
  })
}
