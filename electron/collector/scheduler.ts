// Scheduler — Cron 定时调度器
// 解析 cron 表达式，定时触发采集任务

import { sourceConfig, SourceConfig } from '../config/sourceConfig'
import { CollectorEngine } from './collectorEngine'

interface ScheduleEntry {
  sourceId: string
  cron: string
  enabled: boolean
  nextRunAt: Date | null
  lastRunAt?: string
}

interface ParsedCron {
  minute: number[]
  hour: number[]
  dayOfMonth: number[]
  month: number[]
  dayOfWeek: number[]
}

export class CollectorScheduler {
  private engine: CollectorEngine | null = null
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private running = false

  setEngine(engine: CollectorEngine): void {
    this.engine = engine
  }

  /** 加载所有启用的定时采集源并启动定时器 */
  start(): void {
    if (this.running) return
    this.running = true

    const sources = sourceConfig.getEnabledSources()
    for (const source of sources) {
      if (source.schedule && source.schedule !== 'manual') {
        this.scheduleSource(source)
      }
    }

    // 每分钟检查一次是否有新任务需要调度
    const checkInterval = setInterval(() => {
      const currentSources = sourceConfig.getEnabledSources()
      for (const source of currentSources) {
        if (source.schedule && source.schedule !== 'manual' && !this.timers.has(source.id)) {
          this.scheduleSource(source)
        }
        if ((!source.enabled || source.schedule === 'manual') && this.timers.has(source.id)) {
          this.unscheduleSource(source.id)
        }
      }
    }, 60000)

    this.timers.set('__check_interval__', checkInterval)
  }

  /** 停止所有定时器 */
  stop(): void {
    this.running = false
    for (const [id, timer] of this.timers) {
      if (id === '__check_interval__') {
        clearInterval(timer)
      } else {
        clearTimeout(timer)
      }
    }
    this.timers.clear()
  }

  /** 手动触发一次采集 */
  async triggerNow(sourceId: string): Promise<void> {
    if (!this.engine) {
      console.error('[Scheduler] 采集引擎未设置')
      return
    }
    if (this.engine.isRunning()) {
      console.log('[Scheduler] 采集引擎正忙，跳过触发:', sourceId)
      return
    }
    console.log('[Scheduler] 手动触发采集:', sourceId)
    await this.engine.runSource(sourceId)
  }

  /** 计算下次执行时间 */
  calculateNextRun(cron: string): Date | null {
    try {
      const parsed = this.parseCron(cron)
      if (!parsed) return null

      const now = new Date()
      // 简单实现：查找下一个匹配的时间（最多查找 365 天）
      for (let daysAhead = 0; daysAhead < 365; daysAhead++) {
        const candidate = new Date(now)
        candidate.setDate(candidate.getDate() + daysAhead)
        candidate.setSeconds(0)
        candidate.setMilliseconds(0)

        // 遍历每天的所有分钟组合
        for (const hour of parsed.hour) {
          for (const minute of parsed.minute) {
            candidate.setHours(hour, minute)
            if (candidate > now &&
              parsed.month.includes(candidate.getMonth() + 1) &&
              parsed.dayOfMonth.includes(candidate.getDate()) &&
              parsed.dayOfWeek.includes(candidate.getDay())) {
              return candidate
            }
          }
        }
      }
      return null
    } catch {
      return null
    }
  }

  private scheduleSource(source: SourceConfig): void {
    const nextRun = this.calculateNextRun(source.schedule)
    if (!nextRun) {
      console.log(`[Scheduler] 无法计算 ${source.id} 的下次执行时间`)
      return
    }

    const delayMs = nextRun.getTime() - Date.now()
    if (delayMs <= 0) return

    console.log(`[Scheduler] ${source.id} 下次执行: ${nextRun.toLocaleString()} (${Math.round(delayMs / 1000 / 60)} 分钟后)`)

    const timer = setTimeout(async () => {
      this.timers.delete(source.id)
      if (!this.engine) return

      try {
        await this.engine.runSource(source.id)
      } catch (e) {
        console.error(`[Scheduler] ${source.id} 采集失败:`, e)
      }

      // 调度下一次
      const updatedSource = sourceConfig.getSource(source.id)
      if (updatedSource?.enabled && updatedSource.schedule !== 'manual') {
        this.scheduleSource(updatedSource)
      }
    }, delayMs)

    this.timers.set(source.id, timer)
  }

  private unscheduleSource(sourceId: string): void {
    const timer = this.timers.get(sourceId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(sourceId)
      console.log(`[Scheduler] 取消调度: ${sourceId}`)
    }
  }

  /** 解析标准 5 字段 cron 表达式 */
  private parseCron(expr: string): ParsedCron | null {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return null

    try {
      return {
        minute: this.parseField(parts[0], 0, 59),
        hour: this.parseField(parts[1], 0, 23),
        dayOfMonth: this.parseField(parts[2], 1, 31),
        month: this.parseField(parts[3], 1, 12),
        dayOfWeek: this.parseField(parts[4], 0, 6),
      }
    } catch {
      return null
    }
  }

  private parseField(field: string, min: number, max: number): number[] {
    if (field === '*') {
      const result: number[] = []
      for (let i = min; i <= max; i++) result.push(i)
      return result
    }

    const values = new Set<number>()

    for (const part of field.split(',')) {
      if (part.includes('/')) {
        // 步长: */5 或 1-30/5
        const [range, stepStr] = part.split('/')
        const step = parseInt(stepStr, 10)
        let rangeMin: number, rangeMax: number
        if (range === '*') {
          rangeMin = min; rangeMax = max
        } else if (range.includes('-')) {
          [rangeMin, rangeMax] = range.split('-').map(n => parseInt(n, 10))
        } else {
          rangeMin = parseInt(range, 10); rangeMax = max
        }
        for (let i = rangeMin; i <= rangeMax; i += step) {
          if (i >= min && i <= max) values.add(i)
        }
      } else if (part.includes('-')) {
        const [lo, hi] = part.split('-').map(n => parseInt(n, 10))
        for (let i = lo; i <= hi; i++) {
          if (i >= min && i <= max) values.add(i)
        }
      } else {
        const n = parseInt(part, 10)
        if (n >= min && n <= max) values.add(n)
      }
    }

    return Array.from(values).sort((a, b) => a - b)
  }
}

export const scheduler = new CollectorScheduler()
