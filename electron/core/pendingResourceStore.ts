// 资源审核 — 待审核列表持久化存储

import * as fs from 'fs'
import * as path from 'path'

export interface PendingResourceItem {
  id: string
  name: string
  resourceType: string
  targetRepo: string
  category: string
  techStack: string[]
  sourceUrl: string
  summary: string
  rawContent: string
  status: 'pending' | 'audited' | 'approved' | 'rejected'
  auditScore: number
  auditNotes: string
  formattedContent: string
  auditedAt: string
  createdAt: string
}

interface PendingResourcesData {
  items: PendingResourceItem[]
  updatedAt: string
}

const DEFAULTS: PendingResourcesData = {
  items: [],
  updatedAt: new Date().toISOString(),
}

class PendingResourceStore {
  private data: PendingResourcesData
  private savePath: string

  constructor() {
    this.savePath = this.getSavePath()
    this.data = this.load()
  }

  get items(): PendingResourceItem[] { return [...this.data.items] }

  getPendingCount(): number {
    return this.data.items.filter(i => i.status === 'pending').length
  }

  getAuditedCount(): number {
    return this.data.items.filter(i => i.status === 'audited').length
  }

  getItem(id: string): PendingResourceItem | undefined {
    return this.data.items.find(i => i.id === id)
  }

  getItemsByStatus(status: string): PendingResourceItem[] {
    return this.data.items.filter(i => i.status === status)
  }

  /** 查找重复项：按 id > name+repo > sourceUrl 优先级匹配 */
  findDuplicate(item: PendingResourceItem): PendingResourceItem | null {
    // 1. 精确 ID 匹配
    const byId = this.data.items.find(i => i.id === item.id)
    if (byId) return byId

    // 2. 同仓库 + 同名
    const byName = this.data.items.find(i =>
      i.name === item.name && i.targetRepo === item.targetRepo
    )
    if (byName) return byName

    // 3. 相同来源 URL（非空）
    if (item.sourceUrl) {
      const byUrl = this.data.items.find(i =>
        i.sourceUrl === item.sourceUrl && i.sourceUrl.length > 0
      )
      if (byUrl) return byUrl
    }

    return null
  }

  /** 如果非重复则添加，返回是否实际添加 */
  addItemIfNew(item: PendingResourceItem): { added: boolean; duplicateOf?: string } {
    const dup = this.findDuplicate(item)
    if (dup) {
      console.log('[pendingStore] 跳过重复项:', item.name, '→ 重复于:', dup.name, '(id:', dup.id, ')')
      return { added: false, duplicateOf: dup.id }
    }
    this.data.items.push(item)
    this.save()
    return { added: true }
  }

  addItem(item: PendingResourceItem): void {
    // 向下兼容：直接添加不做去重（collectorEngine 使用 addItemIfNew）
    this.data.items.push(item)
    this.save()
  }

  /** 批量去重检查：返回需要添加的新项 */
  filterDuplicates(items: PendingResourceItem[]): PendingResourceItem[] {
    const newItems: PendingResourceItem[] = []
    for (const item of items) {
      if (!this.findDuplicate(item)) {
        newItems.push(item)
      }
    }
    return newItems
  }

  /** 批量添加（带去重） */
  addItems(items: PendingResourceItem[]): { added: number; skipped: number } {
    const newItems = this.filterDuplicates(items)
    for (const item of newItems) {
      this.data.items.push(item)
    }
    if (newItems.length > 0) this.save()
    return { added: newItems.length, skipped: items.length - newItems.length }
  }

  /** 检查指定 ID 是否在任意状态存在 */
  exists(id: string): boolean {
    return this.data.items.some(i => i.id === id)
  }

  /** 根据 sourceUrl 检查是否已有条目（跨仓库） */
  existsByUrl(url: string): boolean {
    if (!url) return false
    return this.data.items.some(i => i.sourceUrl === url)
  }

  removeItem(id: string): boolean {
    const before = this.data.items.length
    this.data.items = this.data.items.filter(i => i.id !== id)
    if (this.data.items.length !== before) {
      this.save()
      return true
    }
    return false
  }

  updateItem(id: string, updates: Partial<PendingResourceItem>): boolean {
    const item = this.data.items.find(i => i.id === id)
    if (!item) return false
    Object.assign(item, updates)
    this.save()
    return true
  }

  getConfig(): PendingResourcesData {
    return { items: [...this.data.items], updatedAt: this.data.updatedAt }
  }

  private getSavePath(): string {
    const appData = process.env.APPDATA || path.join(process.env.HOME || '.', 'AppData', 'Roaming')
    const dir = path.join(appData, 'dbghf')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'pending-resources.json')
  }

  private load(): PendingResourcesData {
    try {
      if (!fs.existsSync(this.savePath)) return { ...DEFAULTS }
      const raw = fs.readFileSync(this.savePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return {
        items: parsed.items ?? [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      }
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

export const pendingResourceStore = new PendingResourceStore()
