// CollectorEngine — 多线程采集调度核心
// 借鉴 BatchRunner 并行模式，扩展进程池管理 + 断点续采

import * as path from 'path'
import * as fs from 'fs-extra'
import { EventEmitter } from 'events'
import { ClaudeRunner, RunnerConfig, RunnerEvent } from './claudeRunner'
import { outputParser } from './outputParser'
import { sourceConfig, SourceConfig } from '../config/sourceConfig'
import { pendingResourceStore } from '../core/pendingResourceStore'
import { db } from '../core/database'

export interface ProgressEvent {
  type: 'source_start' | 'source_done' | 'source_error' | 'runner_start' | 'runner_progress' | 'runner_done' | 'runner_error' | 'item_collected'
  sourceId: string
  sourceName?: string
  data?: any
  progress?: {
    totalBatches: number
    completedBatches: number
    totalItems: number
    collectedItems: number
    failedItems: number
    runningRunners: number
  }
}

export interface CollectResult {
  sourceId: string
  collected: number
  failed: number
  rejected: number
  durationMs: number
  status: 'done' | 'aborted' | 'error'
  error?: string
}

interface CollectorState {
  sources: Record<string, {
    lastRunAt?: string
    totalBatches: number
    completedBatches: number[]
    failedBatches: number[]
    runningBatch: number | null
    totalItems: number
    collectedItems: number
  }>
}

export class CollectorEngine extends EventEmitter {
  private running = false
  private abortController: AbortController | null = null
  private pool: Map<string, ClaudeRunner> = new Map()
  private maxConcurrency = 4
  private currentSourceId: string | null = null

  constructor() {
    super()
    this.maxConcurrency = Math.min(
      require('os').cpus().length - 1,
      6
    )
    if (this.maxConcurrency < 1) this.maxConcurrency = 1
  }

  isRunning(): boolean {
    return this.running
  }

  getCurrentSourceId(): string | null {
    return this.currentSourceId
  }

  getPoolStatus(): Array<{ taskId: string; state: string; progress: { collected: number; batchIndex: number } }> {
    return Array.from(this.pool.entries()).map(([taskId, runner]) => ({
      taskId,
      state: runner.getState(),
      progress: runner.getProgress(),
    }))
  }

  async runSource(sourceId: string): Promise<CollectResult> {
    if (this.running) {
      return { sourceId, collected: 0, failed: 0, rejected: 0, durationMs: 0, status: 'error', error: '已有采集任务运行中' }
    }

    const source = sourceConfig.getSource(sourceId)
    if (!source) {
      return { sourceId, collected: 0, failed: 0, rejected: 0, durationMs: 0, status: 'error', error: `采集源 ${sourceId} 不存在` }
    }

    this.running = true
    this.currentSourceId = sourceId
    this.abortController = new AbortController()
    this.pool.clear()

    const startTime = Date.now()
    let totalCollected = 0
    let totalFailed = 0
    let totalRejected = 0

    const workDir = this.prepareWorkDir(source)

    // 计算分片 — 每个 batch 由 batchSize 条数据组成
    const totalBatches = Math.max(1, Math.ceil(20 / source.batchSize)) // 默认 20 条，可配置
    const activeSlots = Math.min(source.parallelism, this.maxConcurrency)

    const progress: ProgressEvent['progress'] = {
      totalBatches,
      completedBatches: 0,
      totalItems: totalBatches * source.batchSize,
      collectedItems: 0,
      failedItems: 0,
      runningRunners: 0,
    }

    // 尝试恢复断点
    const state = await this.loadState()
    const sourceState = state.sources[sourceId]
    const completedBatches = new Set(sourceState?.completedBatches || [])
    const failedBatches = new Set(sourceState?.failedBatches || [])

    this.emit('progress', {
      type: 'source_start',
      sourceId,
      sourceName: source.name,
      progress: { ...progress },
    } as ProgressEvent)

    // 构建待执行 batch 列表
    const pendingBatches: Array<{ batchIndex: number; prompt: string }> = []
    for (let i = 0; i < totalBatches; i++) {
      if (completedBatches.has(i) || failedBatches.has(i)) continue
      pendingBatches.push({
        batchIndex: i,
        prompt: this.buildBatchPrompt(source, i, totalBatches),
      })
    }

    try {
      while (pendingBatches.length > 0 || this.pool.size > 0) {
        if (this.abortController.signal.aborted) break

        // 填充空闲槽位
        while (this.pool.size < activeSlots && pendingBatches.length > 0) {
          const batch = pendingBatches.shift()!
          const taskId = `${sourceId}-batch-${batch.batchIndex}`
          const runner = new ClaudeRunner()

          runner.on('event', (event: RunnerEvent) => {
            this.handleRunnerEvent(event, source, progress)
          })

          const config: RunnerConfig = {
            taskId,
            prompt: batch.prompt,
            targetRepo: source.targetRepo,
            workDir,
            timeout: 120000,
            batchIndex: batch.batchIndex,
            totalBatches,
          }

          this.pool.set(taskId, runner)
          progress.runningRunners = this.pool.size

          this.emit('progress', {
            type: 'runner_start',
            sourceId,
            sourceName: source.name,
            progress: { ...progress },
          } as ProgressEvent)

          // 启动 runner（异步，不等待）
          runner.start(config).catch(err => {
            console.error(`[CollectorEngine] Runner ${taskId} 启动失败:`, err)
          })

          // 更新断点状态
          sourceState && (sourceState.runningBatch = batch.batchIndex)
          await this.saveState(state)
        }

        // 等待任一进程完成（或超时 3 秒后继续检查）
        await this.waitForAnyRunner(3000)
      }
    } catch (e: any) {
      totalFailed++
      this.emit('progress', {
        type: 'source_error',
        sourceId,
        sourceName: source.name,
        data: { error: e.message },
        progress: { ...progress },
      } as ProgressEvent)
    }

    // 汇总结果
    for (const [taskId, runner] of this.pool) {
      const runnerProgress = runner.getProgress()
      totalCollected += runnerProgress.collected
    }

    this.running = false
    this.pool.clear()
    this.currentSourceId = null

    const durationMs = Date.now() - startTime
    const result: CollectResult = {
      sourceId,
      collected: progress.collectedItems,
      failed: progress.failedItems,
      rejected: totalRejected,
      durationMs,
      status: this.abortController.signal.aborted ? 'aborted' : 'done',
    }

    // 清理状态
    if (sourceState) {
      sourceState.runningBatch = null
      sourceState.lastRunAt = new Date().toISOString()
      await this.saveState(state)
    }

    this.emit('progress', {
      type: 'source_done',
      sourceId,
      sourceName: source.name,
      progress: { ...progress },
      data: result,
    } as ProgressEvent)

    // 如果配置了自动提交，触发审核+提交流程
    if (source.autoSubmit && progress.collectedItems > 0) {
      this.emit('auto_submit', { sourceId, targetRepo: source.targetRepo })
    }

    return result
  }

  abort(): void {
    this.abortController?.abort()
    for (const [, runner] of this.pool) {
      runner.abort()
    }
    this.running = false
  }

  private handleRunnerEvent(event: RunnerEvent, source: SourceConfig, progress: NonNullable<ProgressEvent['progress']>): void {
    switch (event.type) {
      case 'yaml_block': {
        if (event.data?.frontmatter) {
          try {
            const item = outputParser.toPendingItem(
              { frontmatter: event.data.frontmatter, body: event.data.body || '', raw: event.data.raw || '' },
              source.targetRepo,
              source.id,
            )
            const dedupResult = pendingResourceStore.addItemIfNew(item)
            if (dedupResult.added) {
              progress.collectedItems++
              this.emit('progress', {
                type: 'item_collected',
                sourceId: source.id,
                sourceName: source.name,
                data: { item: item.name, id: item.id },
                progress: { ...progress },
              } as ProgressEvent)
            } else {
              this.emit('progress', {
                type: 'item_collected',
                sourceId: source.id,
                sourceName: source.name,
                data: { item: item.name, id: item.id, skipped: true, duplicateOf: dedupResult.duplicateOf },
                progress: { ...progress },
              } as ProgressEvent)
            }
          } catch {
            progress.failedItems++
          }
        }
        break
      }
      case 'progress': {
        if (event.progress) {
          this.emit('progress', {
            type: 'runner_progress',
            sourceId: source.id,
            sourceName: source.name,
            data: event.progress,
            progress: { ...progress },
          } as ProgressEvent)
        }
        break
      }
      case 'complete': {
        const taskId = event.taskId
        this.pool.delete(taskId)
        progress.completedBatches++
        progress.runningRunners = this.pool.size
        this.emit('progress', {
          type: 'runner_done',
          sourceId: source.id,
          sourceName: source.name,
          data: { taskId, collected: event.data?.collected || 0 },
          progress: { ...progress },
        } as ProgressEvent)

        // 更新断点
        this.updateCheckpoint(source.id, event.batchIndex, 'complete')
        break
      }
      case 'error':
      case 'timeout': {
        const taskId = event.taskId
        this.pool.delete(taskId)
        progress.failedItems++
        progress.runningRunners = this.pool.size
        this.emit('progress', {
          type: 'runner_error',
          sourceId: source.id,
          sourceName: source.name,
          data: { taskId, error: event.error },
          progress: { ...progress },
        } as ProgressEvent)

        this.updateCheckpoint(source.id, event.batchIndex, 'failed')
        break
      }
    }
  }

  private buildBatchPrompt(source: SourceConfig, batchIndex: number, totalBatches: number): string {
    const offset = batchIndex * source.batchSize
    const limit = source.batchSize
    return `${source.prompt}

批次信息：第 ${batchIndex + 1}/${totalBatches} 批，本批处理第 ${offset + 1}-${offset + limit} 条数据。
请确保每条数据格式完整、YAML frontmatter 正确。`
  }

  private prepareWorkDir(source: SourceConfig): string {
    const tmpDir = path.join(db.DATA_DIR, 'collector-tmp', source.id)
    fs.ensureDirSync(tmpDir)
    return tmpDir
  }

  private async waitForAnyRunner(ms: number): Promise<void> {
    if (this.pool.size === 0) return

    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms)

      const checkDone = () => {
        if (this.pool.size === 0) {
          clearTimeout(timeout)
          resolve()
        }
      }

      // 监听 runner 完成事件来加速等待
      for (const [, runner] of this.pool) {
        runner.once('complete', checkDone)
        runner.once('error', checkDone)
      }

      setTimeout(() => {
        for (const [, runner] of this.pool) {
          runner.removeListener('complete', checkDone)
          runner.removeListener('error', checkDone)
        }
      }, ms)
    })
  }

  private async loadState(): Promise<CollectorState> {
    const raw = await db.getCollectorState()
    return raw || { sources: {} }
  }

  private async saveState(state: CollectorState): Promise<void> {
    await db.setCollectorState(state)
  }

  private async updateCheckpoint(sourceId: string, batchIndex: number, status: 'complete' | 'failed'): Promise<void> {
    const state = await this.loadState()
    if (!state.sources[sourceId]) {
      state.sources[sourceId] = { totalBatches: 0, completedBatches: [], failedBatches: [], runningBatch: null, totalItems: 0, collectedItems: 0 }
    }
    const s = state.sources[sourceId]
    if (status === 'complete') {
      if (!s.completedBatches.includes(batchIndex)) s.completedBatches.push(batchIndex)
    } else {
      if (!s.failedBatches.includes(batchIndex)) s.failedBatches.push(batchIndex)
    }
    s.runningBatch = null
    await this.saveState(state)
  }
}

export const collectorEngine = new CollectorEngine()
