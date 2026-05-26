// 采集源配置 — 定义数据源、目标仓库、调度策略

import * as fs from 'fs'
import * as path from 'path'

export interface SourceConfig {
  id: string
  name: string
  targetRepo: string
  prompt: string
  schedule: string
  parallelism: number
  batchSize: number
  enabled: boolean
  autoSubmit: boolean
}

interface SourceConfigsData {
  sources: SourceConfig[]
  updatedAt: string
}

const DEFAULTS: SourceConfigsData = {
  sources: [],
  updatedAt: new Date().toISOString(),
}

class SourceConfigStore {
  private data: SourceConfigsData
  private savePath: string

  constructor() {
    this.savePath = this.getSavePath()
    this.data = this.load()
  }

  getSources(): SourceConfig[] {
    return [...this.data.sources]
  }

  getEnabledSources(): SourceConfig[] {
    return this.data.sources.filter(s => s.enabled)
  }

  getSource(id: string): SourceConfig | undefined {
    return this.data.sources.find(s => s.id === id)
  }

  addSource(s: SourceConfig): void {
    if (this.data.sources.find(e => e.id === s.id)) return
    this.data.sources.push(s)
    this.save()
  }

  removeSource(id: string): boolean {
    const before = this.data.sources.length
    this.data.sources = this.data.sources.filter(s => s.id !== id)
    if (this.data.sources.length !== before) {
      this.save()
      return true
    }
    return false
  }

  updateSource(id: string, updates: Partial<SourceConfig>): boolean {
    const source = this.data.sources.find(s => s.id === id)
    if (!source) return false
    Object.assign(source, updates)
    this.save()
    return true
  }

  private getSavePath(): string {
    const appData = process.env.APPDATA || path.join(process.env.HOME || '.', 'AppData', 'Roaming')
    const dir = path.join(appData, 'dbghf')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'sources.json')
  }

  private load(): SourceConfigsData {
    try {
      if (!fs.existsSync(this.savePath)) return { ...DEFAULTS }
      const raw = fs.readFileSync(this.savePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return { ...DEFAULTS }
    }
  }

  private save(): void {
    try {
      this.data.updatedAt = new Date().toISOString()
      const dir = path.dirname(this.savePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmp = this.savePath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      fs.renameSync(tmp, this.savePath)
    } catch { /* 保存失败不影响主流程 */ }
  }
}

export const sourceConfig = new SourceConfigStore()
