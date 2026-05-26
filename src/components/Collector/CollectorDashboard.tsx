import { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import type { CollectorEvent, SourceConfig } from '../../types/electron'

interface RunnerState {
  taskId: string
  state: string
  progress: { collected: number; batchIndex: number }
}

interface HistoryEntry {
  sourceId: string
  sourceName: string
  startedAt: string
  finishedAt?: string
  collected: number
  failed: number
  durationMs: number
  status: string
}

export default function CollectorDashboard() {
  const { state } = useAppContext()
  const [running, setRunning] = useState(false)
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null)
  const [pool, setPool] = useState<RunnerState[]>([])
  const [progress, setProgress] = useState<any>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [recentItems, setRecentItems] = useState<Array<{ name: string; id: string }>>([])

  const loadStatus = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const status = await api.collectorStatus()
    setRunning(status.running)
    setCurrentSourceId(status.currentSourceId)
    setPool(status.pool || [])
    const hist = await api.collectorHistory()
    setHistory(hist || [])
  }, [])

  useEffect(() => {
    loadStatus()
    const api = window.electronAPI
    if (!api) return

    const unsub = api.collectorOnEvent((event: CollectorEvent) => {
      if (event.type === 'source_start' || event.type === 'runner_start' ||
          event.type === 'runner_done' || event.type === 'runner_error' ||
          event.type === 'runner_progress' || event.type === 'item_collected') {
        setRunning(true)
        if (event.progress) setProgress(event.progress)
      }
      if (event.type === 'source_done' || event.type === 'source_error') {
        setRunning(false)
        if (event.progress) setProgress(event.progress)
        loadStatus()
      }
      if (event.type === 'item_collected' && event.data) {
        setRecentItems(prev => {
          const next = [{ name: event.data.item || event.data.id, id: event.data.id }, ...prev]
          return next.slice(0, 20)
        })
      }
      // 实时更新 pool 状态
      loadStatus()
    })

    // 定时刷新 pool 状态
    const interval = setInterval(loadStatus, 2000)
    return () => { unsub(); clearInterval(interval) }
  }, [loadStatus])

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
  }

  const formatTime = (iso: string) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const currentSource = state.sources.find((s: SourceConfig) => s.id === currentSourceId)

  return (
    <div className="collector-dashboard">
      {/* 运行状态面板 */}
      {running && (
        <section className="section running-section">
          <h2>
            <span className="spinner" />
            正在采集: {currentSource?.name || currentSourceId || '...'}
          </h2>

          {progress && (
            <div className="progress-summary">
              <span>完成: {progress.completedBatches}/{progress.totalBatches} 批</span>
              <span>已采集: {progress.collectedItems} 条</span>
              <span>运行中: {progress.runningRunners} 线程</span>
            </div>
          )}

          {/* Runner 状态卡片 */}
          {pool.length > 0 && (
            <div className="runner-cards">
              {pool.map((runner: RunnerState) => (
                <div key={runner.taskId} className={`runner-card state-${runner.state}`}>
                  <div className="runner-header">
                    <span>Runner #{runner.progress.batchIndex + 1}</span>
                    <span className={`runner-state ${runner.state}`}>
                      {runner.state === 'running' ? '运行中' : runner.state === 'done' ? '完成' : runner.state}
                    </span>
                  </div>
                  <div className="runner-body">
                    <div className="runner-progress-bar">
                      <div
                        className="runner-progress-fill"
                        style={{ width: `${runner.state === 'done' ? 100 : Math.min(95, runner.progress.collected * 10)}%` }}
                      />
                    </div>
                    <span className="runner-count">{runner.progress.collected} 条</span>
                  </div>
                </div>
              ))}
              {/* 空闲槽位 */}
              {pool.length < 4 && Array.from({ length: Math.max(0, 3 - pool.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="runner-card empty">
                  <div className="runner-header">
                    <span>等待中...</span>
                  </div>
                  <div className="runner-body">
                    <div className="runner-progress-bar"><div className="runner-progress-fill" style={{ width: '0%' }} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 最近采集项 */}
          {recentItems.length > 0 && (
            <div className="recent-items">
              <span className="recent-label">最近采集:</span>
              {recentItems.slice(0, 8).map((item, i) => (
                <span key={i} className="recent-item">{item.name}</span>
              ))}
            </div>
          )}

          <button className="btn btn-danger" onClick={() => window.electronAPI?.collectorAbort()}>
            中止采集
          </button>
        </section>
      )}

      {/* 数据源列表 */}
      <section className="section">
        <h2>数据源</h2>
        {state.sources.length === 0 ? (
          <div className="empty-state">
            <p>暂无采集源配置</p>
            <p className="hint">请在「配置」标签页中添加数据源和目标仓库</p>
          </div>
        ) : (
          <div className="source-cards">
            {state.sources.map((source: any) => (
              <div key={source.id} className={`source-card ${source.enabled ? 'enabled' : 'disabled'}`}>
                <div className="source-header">
                  <span className="source-name">{source.name}</span>
                  <span className={`source-badge ${source.enabled ? 'on' : 'off'}`}>
                    {source.enabled ? '启用' : '禁用'}
                  </span>
                </div>
                <div className="source-meta">
                  <span>目标: {source.targetRepo}</span>
                  <span>并行: {source.parallelism} 线程</span>
                  <span>批量: {source.batchSize} 条/线程</span>
                  <span>调度: {source.schedule}</span>
                  <span>自动提交: {source.autoSubmit ? '是' : '否'}</span>
                </div>
                <p className="source-prompt">{source.prompt}</p>
                <div className="source-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={running}
                    onClick={() => window.electronAPI?.collectorRun(source.id)}
                  >
                    立即采集
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 采集历史 */}
      <section className="section">
        <h2>采集历史</h2>
        {history.length === 0 ? (
          <div className="empty-state">
            <p>暂无采集记录</p>
          </div>
        ) : (
          <div className="history-list">
            {history.map((entry, i) => (
              <div key={i} className={`history-entry status-${entry.status}`}>
                <span className="history-name">{entry.sourceName || entry.sourceId}</span>
                <span className="history-time">{formatTime(entry.startedAt)}</span>
                <span className="history-duration">{formatDuration(entry.durationMs)}</span>
                <span className="history-collected">✓ {entry.collected} 条</span>
                {entry.failed > 0 && <span className="history-failed">✗ {entry.failed} 条</span>}
                <span className={`history-status ${entry.status}`}>
                  {entry.status === 'running' ? '运行中' :
                   entry.status === 'done' ? '完成' :
                   entry.status === 'aborted' ? '已中止' : '错误'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
