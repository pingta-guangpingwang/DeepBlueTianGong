// 仓库配置系统 — 每个仓库自描述分类法，引擎不硬编码领域知识

import * as fs from 'fs'
import * as path from 'path'

export interface RepoTaxonomyType {
  id: string
  label: string
  dir: string
}

export interface RepoTaxonomy {
  types: RepoTaxonomyType[]
  categories: string[]
  requiredFields: string[]
  optionalFields?: string[]
}

export interface RepoConfig {
  name: string
  label: string
  labelEn?: string
  remote: string
  visible: boolean
  taxonomy: RepoTaxonomy
}

interface AppConfig {
  version: string
  repos: RepoConfig[]
}

const DEFAULTS: AppConfig = {
  version: '1.0',
  repos: [],
}

class RepoConfigStore {
  private config: AppConfig
  private configPath: string

  constructor() {
    this.configPath = this.getConfigPath()
    this.config = this.load()
  }

  getRepos(): RepoConfig[] {
    return this.config.repos
  }

  getVisibleRepos(): RepoConfig[] {
    return this.config.repos.filter(r => r.visible)
  }

  getRepo(name: string): RepoConfig | undefined {
    return this.config.repos.find(r => r.name === name)
  }

  getTaxonomy(repo: string): RepoTaxonomy | undefined {
    return this.getRepo(repo)?.taxonomy
  }

  getTypeDir(repo: string, type: string): string {
    const cfg = this.getRepo(repo)
    const typeDef = cfg?.taxonomy.types.find(t => t.id === type)
    return typeDef?.dir || 'other'
  }

  getValidTypes(repo: string): string[] {
    const cfg = this.getRepo(repo)
    return cfg?.taxonomy.types.map(t => t.id) || []
  }

  getRequiredFields(repo: string): string[] {
    const cfg = this.getRepo(repo)
    return cfg?.taxonomy.requiredFields || ['id', 'name', 'type', 'category', 'summary']
  }

  addRepo(repo: RepoConfig): void {
    if (this.config.repos.find(r => r.name === repo.name)) return
    this.config.repos.push(repo)
    this.save()
  }

  removeRepo(name: string): boolean {
    const before = this.config.repos.length
    this.config.repos = this.config.repos.filter(r => r.name !== name)
    if (this.config.repos.length !== before) {
      this.save()
      return true
    }
    return false
  }

  updateRepo(name: string, updates: Partial<RepoConfig>): boolean {
    const repo = this.config.repos.find(r => r.name === name)
    if (!repo) return false
    Object.assign(repo, updates)
    this.save()
    return true
  }

  private getConfigPath(): string {
    const appData = process.env.APPDATA || path.join(process.env.HOME || '.', 'AppData', 'Roaming')
    const dir = path.join(appData, 'dbghf')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, 'repos.json')
  }

  private load(): AppConfig {
    try {
      if (!fs.existsSync(this.configPath)) return { ...DEFAULTS }
      const raw = fs.readFileSync(this.configPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return { ...DEFAULTS }
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmp = this.configPath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf-8')
      fs.renameSync(tmp, this.configPath)
    } catch { /* 保存失败不影响主流程 */ }
  }
}

export const repoConfig = new RepoConfigStore()
