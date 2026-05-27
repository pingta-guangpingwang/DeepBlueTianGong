// 资源仓库管理引擎 — 独立模块（从天工提取，动态仓库配置）
// 管理多个本地资源仓库的初始化、同步、检索、贡献

import * as path from 'path'
import * as fs from 'fs-extra'
import * as yaml from 'js-yaml'
import { repoConfig } from '../config/repoConfig'

// ---- 类型 ----

export interface ResourceItem {
  id: string
  name: string
  type: string
  category: string
  subcategory?: string
  tech_stack: string[]
  style_tags: string[]
  use_cases: string[]
  score: number
  rating_count: number
  usage_count: number
  source_url: string
  summary: string
  summary_en?: string
  file: string
  repo: string
  rawYaml?: Record<string, any>
  body?: string
}

export interface QueryParams {
  query: string
  repo?: string | 'all'
  type?: string
  category?: string
  techStack?: string[]
  maxResults?: number
  minScore?: number
}

interface ManifestItem {
  id: string
  name: string
  type: string
  category: string
  tech_stack: string[]
  style_tags: string[]
  score: number
  rating_count?: number
  source_url: string
  summary: string
  summary_en?: string
  file: string
  facets?: Record<string, any>
}

interface Manifest {
  updated: string
  total: number
  items: ManifestItem[]
}

function getResourceDir(): string {
  const appData = process.env.APPDATA || path.join(process.env.HOME || 'C:\\Users\\admin', 'AppData', 'Roaming')
  return path.join(appData, 'dbghf', 'resources')
}

function getRepoPath(repo: string): string {
  return path.join(getResourceDir(), repo)
}

function getRepoList(): string[] {
  return repoConfig.getVisibleRepos().map(r => r.name)
}

// ---- ResourceStore ----

class ResourceStore {
  private initialized = false
  private manifests: Map<string, Manifest> = new Map()
  private aiManifests: Map<string, ManifestItem[]> = new Map()
  private aiIndexes: Map<string, ManifestItem[]> = new Map()
  private resourceDir: string
  private _lastLoadTime = 0
  private _localChangesCache: Map<string, { time: number; data: Array<{ path: string; status: string }> }> = new Map()
  private _changesCacheTTL = 3000

  constructor() {
    this.resourceDir = getResourceDir()
  }

  // ============ 初始化 ============

  /** 检查资源目录是否存在且已初始化 */
  isInitialized(): boolean {
    if (this.initialized) return true
    const repos = getRepoList()
    for (const repo of repos) {
      if (fs.existsSync(path.join(getRepoPath(repo), 'manifest.json'))) {
        this.initialized = true
        return true
      }
    }
    return false
  }

  /** 自动同步所有已克隆仓库到最新，然后重载 manifest */
  async autoSyncAll(): Promise<{ synced: string[]; message: string }> {
    await this.ensureManifestsLoaded()
    const synced: string[] = []
    const repos = getRepoList()
    for (const repo of repos) {
      const repoPath = getRepoPath(repo)
      if (!fs.existsSync(path.join(repoPath, '.git'))) continue
      try {
        const branch = await this.git(repo, 'rev-parse --abbrev-ref HEAD')
        const fetchR = await this.gitSilent(repo, `fetch origin ${branch}`, 15000)
        if (!fetchR.ok) continue
        const before = await this.git(repo, 'rev-parse HEAD')
        const after = await this.git(repo, `rev-parse origin/${branch}`)
        if (before !== after) {
          const pullR = await this.gitSilent(repo, `pull --ff-only origin ${branch}`, 30000)
          if (pullR.ok) synced.push(repo)
        }
      } catch { /* 静默跳过 */ }
    }
    if (synced.length > 0) await this.loadManifests()
    return { synced, message: synced.length > 0 ? `已同步 ${synced.join(', ')}` : '所有仓库已是最新' }
  }

  /** 确保 manifest 已加载到内存 */
  async ensureManifestsLoaded(): Promise<void> {
    if (!this.isInitialized()) return
    const repos = getRepoList()
    const diskRepos = repos.filter(r => fs.existsSync(path.join(getRepoPath(r), 'manifest.json')))
    const loadedRepos = repos.filter(r => this.manifests.has(r))
    if (loadedRepos.length < diskRepos.length) {
      const now = Date.now()
      if (now - this._lastLoadTime < 5000) {
        console.log('[ensureManifestsLoaded] 距上次加载不足 5 秒，跳过')
        return
      }
      console.log('[ensureManifestsLoaded] 磁盘有', diskRepos.length, '个仓库，内存仅加载', loadedRepos.length, '个，重新加载')
      await this.loadManifests()
    }
  }

  /** 加载所有仓库的 manifest 索引到内存 */
  async loadManifests(): Promise<boolean> {
    if (!this.isInitialized()) return false

    const repos = getRepoList()
    for (const repo of repos) {
      const manifestPath = path.join(getRepoPath(repo), 'manifest.json')
      const aiManifestPath = path.join(getRepoPath(repo), 'manifest.ai.json')

      try {
        if (fs.existsSync(manifestPath)) {
          const raw = await fs.readFile(manifestPath, 'utf-8')
          this.manifests.set(repo, JSON.parse(raw))
        }
        if (fs.existsSync(aiManifestPath)) {
          const raw = await fs.readFile(aiManifestPath, 'utf-8')
          const parsed = JSON.parse(raw)
          this.aiManifests.set(repo, parsed.items || [])
          this.aiIndexes.set(repo, parsed.items || [])
        } else if (this.manifests.has(repo)) {
          const mf = this.manifests.get(repo)!
          const items = mf.items as ManifestItem[] || []
          this.aiIndexes.set(repo, items)
          this.aiManifests.set(repo, items)
        }
      } catch {
        // 某个仓库不存在不影响其他
      }
    }

    this._lastLoadTime = Date.now()
    this._localChangesCache.clear()
    this.initialized = true
    return true
  }

  /** 获取本地资源目录路径 */
  getResourceDir(): string {
    return this.resourceDir
  }

  // ============ 查询 ============

  /** 核心检索接口 */
  queryResources(params: QueryParams): ResourceItem[] {
    if (!this.initialized) return []

    const maxResults = params.maxResults || 5
    const minScore = params.minScore || 0
    const repos = params.repo && params.repo !== 'all'
      ? [params.repo]
      : getRepoList()

    const allResults: ResourceItem[] = []
    const query = params.query?.toLowerCase() || ''

    for (const repo of repos) {
      const items = this.aiIndexes.get(repo) || []
      for (const item of items) {
        if (item.score < minScore) continue
        if (!this.matchesFilters(item, params)) continue

        if (!query) {
          allResults.push(this.toResourceItem(item, repo))
          continue
        }

        const score = this.calcRelevance(item, query)
        if (score > 0) {
          allResults.push(this.toResourceItem(item, repo))
        }
      }
    }

    allResults.sort((a, b) => b.score - a.score)
    return allResults.slice(0, maxResults)
  }

  /** 计算关键词匹配度 */
  private calcRelevance(item: ManifestItem, query: string): number {
    let score = 0
    const q = query.toLowerCase()
    if (item.name.toLowerCase().includes(q)) score += 3
    if (item.summary.toLowerCase().includes(q)) score += 2
    if (item.category.toLowerCase().includes(q)) score += 1
    for (const t of item.tech_stack || []) {
      if (t.toLowerCase().includes(q) || q.includes(t.toLowerCase())) score += 1
    }
    for (const s of item.style_tags || []) {
      if (s.toLowerCase().includes(q) || q.includes(s.toLowerCase())) score += 0.5
    }
    const queryWords = q.split(/\s+/)
    for (const word of queryWords) {
      if (word.length < 2) continue
      if (item.name.toLowerCase().includes(word)) score += 1
      if (item.summary.toLowerCase().includes(word)) score += 0.5
      for (const t of item.tech_stack || []) {
        if (t.toLowerCase().includes(word)) score += 0.5
      }
    }
    return score
  }

  /** 按筛选条件过滤 */
  filterResources(filters: {
    repo?: string
    type?: string
    category?: string
    techStack?: string[]
    minScore?: number
  }): ResourceItem[] {
    return this.queryResources({
      query: '',
      ...filters,
      maxResults: 100,
    })
  }

  /** 获取单个资源详情（含正文） */
  async getResourceDetail(id: string): Promise<ResourceItem | null> {
    const repos = getRepoList()
    for (const repo of repos) {
      const manifest = this.manifests.get(repo)
      if (!manifest) continue
      const found = manifest.items.find(i => i.id === id)
      if (found) {
        const item = this.toResourceItem(found, repo)
        try {
          const filePath = path.join(getRepoPath(repo), found.file)
          if (fs.existsSync(filePath)) {
            const raw = await fs.readFile(filePath, 'utf-8')
            const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
            if (fmMatch) {
              item.body = fmMatch[2] || ''
              const fm = yaml.load(fmMatch[1]) as Record<string, any> | null
              if (fm) {
                if (!item.summary_en && fm.summary_en) item.summary_en = String(fm.summary_en).replace(/\s+/g, ' ').trim()
                if (!item.facets && fm.facets) item.facets = fm.facets as Record<string, any>
                item.rawYaml = fm
              }
            } else {
              item.body = raw
            }
          }
        } catch { /* 正文读取失败不影响基本信息 */ }
        return item
      }
    }
    return null
  }

  /** 获取全部资源摘要列表 */
  getAllResources(repo?: string): ResourceItem[] {
    const repos = repo ? [repo] : getRepoList()
    const results: ResourceItem[] = []
    for (const r of repos) {
      const manifest = this.manifests.get(r)
      if (manifest) {
        for (const item of manifest.items) {
          results.push(this.toResourceItem(item, r))
        }
      }
    }
    return results.sort((a, b) => b.score - a.score)
  }

  // ============ 用户添加 ============

  /** 用户添加资源 */
  async addResource(resource: Omit<ResourceItem, 'file'> & { content: string; facets?: Record<string, any> }, repo: string): Promise<{ success: boolean; path?: string }> {
    console.log('[addResource] 写入:', resource.name, '->', repo, resource.type, resource.category)
    const repoPath = getRepoPath(repo)
    if (!fs.existsSync(repoPath)) {
      console.log('[addResource] 仓库目录不存在:', repoPath); return { success: false }
    }

    const category = (resource.category || 'other').replace(/[/\\, ]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const typeDir = repoConfig.getTypeDir(repo, resource.type)
    const dir = path.join(repoPath, typeDir, category)
    fs.ensureDirSync(dir)

    const fileName = (resource.id || `resource-${Date.now().toString(36)}`) + '.md'
    const filePath = path.join(dir, fileName)

    const yamlBlock = yaml.dump({
      name: resource.name,
      id: resource.id,
      type: resource.type,
      category: resource.category,
      subcategory: resource.subcategory || '',
      tech_stack: resource.tech_stack || [],
      style_tags: resource.style_tags || [],
      use_cases: resource.use_cases || [],
      score: resource.score || 3.0,
      rating_count: 1,
      usage_count: 0,
      last_verified: new Date().toISOString().slice(0, 10),
      source_url: resource.source_url || '',
      author: 'user',
      version: '1.0',
      created: new Date().toISOString().slice(0, 10),
      updated: new Date().toISOString().slice(0, 10),
      summary: resource.summary || '',
    })
    const content = `---\n${yamlBlock}---\n\n${resource.content || ''}`
    await fs.writeFile(filePath, content, 'utf-8')
    console.log('[addResource] 文件已写入:', filePath)

    const relFile = path.relative(repoPath, filePath).replace(/\\/g, '/')
    const manifestItem: ManifestItem = {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      category: resource.category,
      tech_stack: resource.tech_stack || [],
      style_tags: resource.style_tags || [],
      score: resource.score || 3.0,
      rating_count: 1,
      source_url: resource.source_url || '',
      summary: resource.summary || '',
      file: relFile,
      facets: resource.facets,
    }
    const aiItems = this.aiIndexes.get(repo) || []
    aiItems.push(manifestItem)
    this.aiIndexes.set(repo, aiItems)
    const mf = this.manifests.get(repo)
    if (mf) {
      mf.items.push(manifestItem)
      mf.total = mf.items.length
      mf.updated = new Date().toISOString()
    }
    console.log('[addResource] 索引已更新:', resource.name, '->', repo, '当前索引数:', aiItems.length)

    return { success: true, path: filePath }
  }

  // ============ Git 同步 ============

  private async git(repo: string, args: string, timeout: number = 15000): Promise<string> {
    const { execSync } = await import('child_process')
    return execSync(`git ${args}`, { cwd: getRepoPath(repo), encoding: 'utf-8', timeout }).trim()
  }

  private async gitSilent(repo: string, args: string, timeout: number = 15000): Promise<{ ok: boolean; output: string }> {
    try {
      const output = await this.git(repo, args, timeout)
      return { ok: true, output }
    } catch (e: any) {
      return { ok: false, output: e.stderr || e.message || String(e) }
    }
  }

  /** 检查仓库是否是 git 仓库 */
  async isGitRepo(repo: string): Promise<boolean> {
    const repoPath = getRepoPath(repo)
    if (!fs.existsSync(path.join(repoPath, '.git'))) return false
    const r = await this.gitSilent(repo, 'rev-parse --git-dir')
    return r.ok
  }

  /** 获取仓库综合状态 */
  async getRepoStatus(repo: string): Promise<{
    exists: boolean
    isGit: boolean
    branch: string
    remote: string
    behind: number
    ahead: number
    changes: Array<{ path: string; status: string }>
    lastCommit: { hash: string; message: string; date: string } | null
  }> {
    const repoPath = getRepoPath(repo)
    const exists = fs.existsSync(repoPath)
    if (!exists) {
      return { exists: false, isGit: false, branch: '', remote: '', behind: 0, ahead: 0, changes: [], lastCommit: null }
    }

    const isGit = await this.isGitRepo(repo)
    if (!isGit) {
      return { exists: true, isGit: false, branch: '', remote: '', behind: 0, ahead: 0, changes: [], lastCommit: null }
    }

    const branch = await this.git(repo, 'rev-parse --abbrev-ref HEAD').catch(() => 'unknown')
    const remote = await this.git(repo, 'remote get-url origin').catch(() => '')

    let behind = 0
    let ahead = 0
    try {
      await this.git(repo, 'fetch origin --quiet', 30000)
      const branchInfo = await this.git(repo, `rev-list --left-right --count origin/${branch}...${branch}`).catch(() => '')
      if (branchInfo) {
        const parts = branchInfo.split('\t')
        behind = parseInt(parts[0] || '0', 10)
        ahead = parseInt(parts[1] || '0', 10)
      }
    } catch { /* 网络不可达等 */ }

    const changes = await this.getLocalChanges(repo)

    let lastCommit = null
    try {
      const log = await this.git(repo, 'log -1 --format="%H||%s||%ai"')
      const [hash, message, date] = log.split('||')
      if (hash) lastCommit = { hash: hash.slice(0, 8), message, date }
    } catch { /* ignore */ }

    return { exists: true, isGit: true, branch, remote, behind, ahead, changes, lastCommit }
  }

  /** 同步拉取 */
  async syncRepo(repo: string): Promise<{ success: boolean; message: string; pulled: number }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库', pulled: 0 }
    }

    const changes = await this.getLocalChanges(repo)
    if (changes.length > 0) {
      return { success: false, message: '有未提交的本地变更，请先提交或暂存', pulled: 0 }
    }

    const fetchR = await this.gitSilent(repo, 'fetch origin --quiet', 30000)
    if (!fetchR.ok) return { success: false, message: `Fetch 失败: ${fetchR.output}`, pulled: 0 }

    const branch = await this.git(repo, 'rev-parse --abbrev-ref HEAD').catch(() => 'main')
    const before = await this.git(repo, 'rev-parse HEAD').catch(() => '')
    const pullR = await this.gitSilent(repo, `pull --ff-only origin ${branch}`, 30000)
    if (!pullR.ok) {
      return { success: false, message: `Pull 失败: ${pullR.output}`, pulled: 0 }
    }

    const after = await this.git(repo, 'rev-parse HEAD').catch(() => '')
    const pulled = before !== after ? 1 : 0

    if (pulled) await this.loadManifests()

    return { success: true, message: pulled ? '已同步到最新' : '已是最新', pulled }
  }

  /** 检查是否有远程更新 */
  async checkForUpdates(repo: string): Promise<{ success: boolean; hasUpdates: boolean; behind: number; message: string }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, hasUpdates: false, behind: 0, message: '不是 Git 仓库' }
    }

    const fetchR = await this.gitSilent(repo, 'fetch origin --quiet', 30000)
    if (!fetchR.ok) return { success: false, hasUpdates: false, behind: 0, message: `Fetch 失败: ${fetchR.output}` }

    const branch = await this.git(repo, 'rev-parse --abbrev-ref HEAD').catch(() => 'main')
    const revR = await this.gitSilent(repo, `rev-list --count HEAD..origin/${branch}`)
    const behind = revR.ok ? parseInt(revR.output || '0', 10) : 0

    return {
      success: true,
      hasUpdates: behind > 0,
      behind,
      message: behind > 0 ? `发现 ${behind} 个新提交` : '已是最新',
    }
  }

  /** 强制拉取最新代码 */
  async forcePullOrAbort(repo: string): Promise<{ success: boolean; message: string }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库' }
    }

    const branch = await this.git(repo, 'rev-parse --abbrev-ref HEAD').catch(() => 'main')

    const fetchR = await this.gitSilent(repo, `fetch origin ${branch}`, 30000)
    if (!fetchR.ok) {
      return { success: false, message: `网络获取失败: ${fetchR.output}。请检查网络连接后重试。` }
    }

    try {
      const behindCount = await this.git(repo, `rev-list --count HEAD..origin/${branch}`)
      if (parseInt(behindCount, 10) <= 0) {
        return { success: true, message: '已是最新' }
      }
    } catch { /* 如果 rev-list 失败则继续 pull */ }

    const pullR = await this.gitSilent(repo, `pull --ff-only origin ${branch}`, 30000)
    if (!pullR.ok) {
      if (pullR.output.toLowerCase().includes('conflict') || pullR.output.includes('CONFLICT')) {
        return { success: false, message: `拉取冲突: 远程仓库有冲突，请手动解决后再提交。\n${pullR.output.slice(0, 200)}` }
      }
      return { success: false, message: `拉取失败: ${pullR.output}。提交已中止，请检查后重试。` }
    }

    await this.loadManifests()
    return { success: true, message: '已拉取最新代码' }
  }

  // ============ 贡献流程 ============

  /** 获取本地变更文件列表 */
  async getLocalChanges(repo: string): Promise<Array<{ path: string; status: string }>> {
    const repoPath = getRepoPath(repo)
    if (!fs.existsSync(path.join(repoPath, '.git'))) return []

    const cached = this._localChangesCache.get(repo)
    if (cached && Date.now() - cached.time < this._changesCacheTTL) return cached.data

    try {
      const { execSync } = await import('child_process')
      const output = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8', timeout: 10000 })
      const raw = output.trim().split('\n').filter(Boolean).map(line => {
        const status = line.slice(0, 2).trim()
        let filePath = line.slice(3).trim()
        if (filePath.startsWith('"') && filePath.endsWith('"')) {
          filePath = filePath.slice(1, -1)
            .replace(/\\t/g, '\t')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
        }
        return { path: filePath, status }
      })

      const expanded: Array<{ path: string; status: string }> = []
      for (const entry of raw) {
        if (entry.path.endsWith('/') || entry.path.endsWith('\\')) {
          const dirPath = entry.path.replace(/[/\\]$/, '')
          const absDir = path.join(repoPath, dirPath)
          try {
            const walkDir = (dir: string, base: string) => {
              const entries = fs.readdirSync(dir, { withFileTypes: true })
              for (const e of entries) {
                const rel = base ? `${base}/${e.name}` : e.name
                if (e.isDirectory()) {
                  walkDir(path.join(dir, e.name), rel)
                } else {
                  expanded.push({ path: rel, status: entry.status })
                }
              }
            }
            walkDir(absDir, dirPath)
          } catch { /* 目录读取失败则跳过 */ }
        } else {
          expanded.push(entry)
        }
      }
      this._localChangesCache.set(repo, { time: Date.now(), data: expanded })
      return expanded
    } catch (e) {
      console.log("[getLocalChanges]", repo, "error:", e)
      return []
    }
  }

  /** 分类变更文件：仅新增(??/A/AM) vs 被阻止(M/D/R等) */
  async getNewFilesOnly(repo: string): Promise<{
    newFiles: Array<{ path: string; status: string }>
    blockedFiles: Array<{ path: string; status: string }>
  }> {
    const allChanges = await this.getLocalChanges(repo)
    const newFiles: Array<{ path: string; status: string }> = []
    const blockedFiles: Array<{ path: string; status: string }> = []
    const ALLOWED = new Set(['??', 'A', 'AM'])
    const BLOCKED = new Set(['M', 'MM', 'D', 'R', 'RM', 'RD', 'C', 'U', 'UU', 'UA', 'AU', 'DD', 'AA'])

    for (const change of allChanges) {
      if (change.path.endsWith('/') || change.path.endsWith('\\')) continue
      if (ALLOWED.has(change.status)) {
        newFiles.push(change)
      } else if (BLOCKED.has(change.status)) {
        blockedFiles.push(change)
      } else {
        blockedFiles.push(change)
      }
    }
    return { newFiles, blockedFiles }
  }

  /** 校验单个资源文件的 YAML frontmatter — 从仓库配置读取必填字段和有效类型 */
  async validateNewFileYaml(repo: string, filePath: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    const repoPath = getRepoPath(repo)
    const fullPath = path.join(repoPath, filePath)

    try {
      const st = await fs.stat(fullPath)
      if (st.isDirectory()) {
        return { valid: false, errors: [`${filePath} 是一个目录，不是资源文件，请清理后重试`] }
      }
      const raw = await fs.readFile(fullPath, 'utf-8')
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!fmMatch) {
        return { valid: false, errors: [`文件 ${filePath} 缺少 YAML frontmatter (--- 块)`] }
      }

      let fm: Record<string, any>
      try {
        fm = (yaml.load(fmMatch[1]) as Record<string, any>) || {}
      } catch (e: any) {
        return { valid: false, errors: [`文件 ${filePath} 的 YAML frontmatter 解析失败: ${e.message}`] }
      }

      const REQUIRED_FIELDS = repoConfig.getRequiredFields(repo)
      for (const field of REQUIRED_FIELDS) {
        if (!fm[field] || (typeof fm[field] === 'string' && fm[field].trim() === '')) {
          errors.push(`文件 ${filePath} 缺少必填字段: ${field}`)
        }
      }

      const VALID_TYPES = repoConfig.getValidTypes(repo)
      if (fm.type && VALID_TYPES.length > 0 && !VALID_TYPES.includes(fm.type)) {
        errors.push(`文件 ${filePath} 的 type 字段值 "${fm.type}" 不在有效类型列表中`)
      }

      return { valid: errors.length === 0, errors }
    } catch (e: any) {
      return { valid: false, errors: [`无法读取文件 ${filePath}: ${e.message}`] }
    }
  }

  /** 基础 YAML 校验：仅检查变更 .md 文件的必填字段，不阻止修改/删除 */
  async validateCommitYaml(repo: string): Promise<{
    valid: boolean
    errors: string[]
    filesToCommit: Array<{ path: string; status: string }>
  }> {
    const allChanges = await this.getLocalChanges(repo)
    if (allChanges.length === 0) {
      return { valid: true, errors: [], filesToCommit: [] }
    }

    const errors: string[] = []
    const filesToCommit: Array<{ path: string; status: string }> = []
    // 排除纯删除(D)和目录，其余都纳入提交
    for (const change of allChanges) {
      if (change.path.endsWith('/') || change.path.endsWith('\\')) continue
      if (change.status === 'D') continue
      filesToCommit.push(change)

      if (!change.path.endsWith('.md')) continue
      const yamlResult = await this.validateNewFileYaml(repo, change.path)
      if (!yamlResult.valid) {
        errors.push(...yamlResult.errors)
      }
    }

    return { valid: errors.length === 0, errors, filesToCommit }
  }

  /** 提交范围验证：仅新增文件 + YAML 必填字段 */
  async validateCommitScope(repo: string): Promise<{
    valid: boolean
    errors: string[]
    newFiles: Array<{ path: string; status: string }>
    blockedFiles: Array<{ path: string; status: string }>
  }> {
    const errors: string[] = []
    const { newFiles, blockedFiles } = await this.getNewFilesOnly(repo)

    if (newFiles.length === 0 && blockedFiles.length === 0) {
      return { valid: true, errors: [], newFiles: [], blockedFiles: [] }
    }

    if (blockedFiles.length > 0) {
      const fileList = blockedFiles.map(f => `  [${f.status}] ${f.path}`).join('\n')
      errors.push(
        `发现 ${blockedFiles.length} 个不允许提交的文件（仅允许新增文件，不支持修改或删除已有文件）:\n${fileList}`
      )
    }

    for (const file of newFiles) {
      const yamlResult = await this.validateNewFileYaml(repo, file.path)
      if (!yamlResult.valid) {
        errors.push(...yamlResult.errors)
      }
    }

    return { valid: errors.length === 0, errors, newFiles, blockedFiles }
  }

  /** 创建贡献分支 */
  async createContributionBranch(repo: string, branchName: string): Promise<{ success: boolean; message: string }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库' }
    }

    const changes = await this.getLocalChanges(repo)
    if (changes.length > 0) {
      return { success: false, message: '有未提交的本地变更，请先提交' }
    }

    const syncR = await this.syncRepo(repo)
    if (!syncR.success) return { success: false, message: `同步失败: ${syncR.message}` }

    const r = await this.gitSilent(repo, `checkout -b ${branchName}`)
    if (!r.ok) return { success: false, message: `创建分支失败: ${r.output}` }

    return { success: true, message: `已创建分支: ${branchName}` }
  }

  /** 全部提交：git add --all + commit（不做范围限制） */
  async commitAll(repo: string, message: string): Promise<{ success: boolean; message: string }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库' }
    }

    const addR = await this.gitSilent(repo, 'add --all')
    if (!addR.ok) return { success: false, message: `Git add 失败: ${addR.output}` }

    const commitR = await this.gitSilent(repo, `commit -m "${message}"`)
    if (!commitR.ok) return { success: false, message: `提交失败: ${commitR.output}` }

    return { success: true, message: '提交成功' }
  }

  /** 提交变更 */
  async commitChanges(repo: string, message: string, files?: string[]): Promise<{ success: boolean; message: string }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库' }
    }

    let filesToAdd: string[]
    if (files && files.length > 0) {
      filesToAdd = files
    } else {
      const { newFiles, blockedFiles } = await this.getNewFilesOnly(repo)
      if (blockedFiles.length > 0) {
        const blockedList = blockedFiles.map(f => `  [${f.status}] ${f.path}`).join('\n')
        return { success: false, message: `提交范围检查失败: 存在 ${blockedFiles.length} 个不允许的文件（修改/删除）:\n${blockedList}\n\n仅支持提交新增文件。请先处理这些文件后再提交。` }
      }
      filesToAdd = newFiles.map(f => f.path)
    }

    if (filesToAdd.length === 0) {
      return { success: false, message: '没有需要提交的变更' }
    }

    for (const file of filesToAdd) {
      const addR = await this.gitSilent(repo, `add "${file}"`)
      if (!addR.ok) return { success: false, message: `Git add 失败 (${file}): ${addR.output}` }
    }

    const escaped = message.replace(/"/g, '\\"')
    const commitR = await this.gitSilent(repo, `commit -m "${escaped}"`)
    if (!commitR.ok) return { success: false, message: `提交失败: ${commitR.output}` }

    return { success: true, message: `提交成功 (${filesToAdd.length} 个文件)` }
  }

  /** 推送分支 */
  async pushBranch(repo: string, branchName: string): Promise<{ success: boolean; message: string }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库' }
    }

    if (!await this.isGitHubAuthenticated()) {
      return { success: false, message: 'GitHub 未登录，请在终端执行: gh auth login' }
    }

    const r = await this.gitSilent(repo, `push -u origin ${branchName}`, 30000)
    if (!r.ok) {
      const output = r.output.toLowerCase()
      if (output.includes('permission') || output.includes('authentication') || output.includes('denied')) {
        return { success: false, message: 'GitHub 认证失败，请在终端执行: gh auth login' }
      }
      return { success: false, message: `推送失败: ${r.output}` }
    }

    return { success: true, message: '推送成功' }
  }

  /** 安全推送：遇到 non-fast-forward 拒绝则 pull --rebase 后重试一次 */
  async safePushBranch(repo: string, branchName: string): Promise<{ success: boolean; message: string; retried: boolean }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库', retried: false }
    }

    if (!await this.isGitHubAuthenticated()) {
      return { success: false, message: 'GitHub 未登录，请在终端执行: gh auth login', retried: false }
    }

    let r = await this.gitSilent(repo, `push -u origin ${branchName}`, 30000)
    if (r.ok) {
      return { success: true, message: '推送成功', retried: false }
    }

    const outputLower = r.output.toLowerCase()
    const isRejected = outputLower.includes('rejected') ||
      outputLower.includes('non-fast-forward') ||
      outputLower.includes('fetch first') ||
      outputLower.includes('updates were rejected')

    if (isRejected) {
      const pullR = await this.gitSilent(repo, `pull --rebase origin ${branchName}`, 30000)
      if (!pullR.ok) {
        return { success: false, message: `推送被拒绝，尝试自动合并失败: ${pullR.output}。请手动处理冲突后重试。`, retried: true }
      }

      r = await this.gitSilent(repo, `push -u origin ${branchName}`, 30000)
      if (r.ok) {
        return { success: true, message: '推送成功 (已自动合并远程更新)', retried: true }
      }
      return { success: false, message: `推送失败 (重试后仍失败): ${r.output}`, retried: true }
    }

    if (outputLower.includes('permission') || outputLower.includes('authentication') || outputLower.includes('denied')) {
      return { success: false, message: 'GitHub 认证失败，请在终端执行: gh auth login', retried: false }
    }

    return { success: false, message: `推送失败: ${r.output}`, retried: false }
  }

  /** 检查 gh CLI 是否可用 */
  async isGhAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process')
      execSync('gh --version', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /** 检查 gh CLI 是否已登录 GitHub */
  async isGitHubAuthenticated(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process')
      execSync('gh auth status', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /** 创建 Pull Request */
  async createPullRequest(repo: string, branchName: string, title: string, body: string): Promise<{ success: boolean; message: string; url?: string }> {
    if (!await this.isGitRepo(repo)) {
      return { success: false, message: '不是 Git 仓库' }
    }

    if (!await this.isGhAvailable()) {
      return { success: false, message: 'GitHub CLI (gh) 未安装，请执行: winget install GitHub.cli' }
    }

    if (!await this.isGitHubAuthenticated()) {
      return { success: false, message: 'GitHub 未登录，请在终端执行: gh auth login' }
    }

    const escapedTitle = title.replace(/"/g, '\\"')
    const escapedBody = body.replace(/"/g, '\\"').replace(/\n/g, '\\n')

    const repoPath = getRepoPath(repo)
    try {
      const { execSync } = await import('child_process')
      const output = execSync(
        `gh pr create --title "${escapedTitle}" --body "${escapedBody}" --base main --head ${branchName}`,
        { cwd: repoPath, encoding: 'utf-8', timeout: 30000 },
      )
      const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/)
      return { success: true, message: 'PR 创建成功', url: urlMatch ? urlMatch[0] : output.trim() }
    } catch (e: any) {
      return { success: false, message: `PR 创建失败: ${e.stderr || e.message}` }
    }
  }

  // ============ 初始化 ============

  /** 克隆仓库到本地 */
  async cloneRepo(repo: string, remoteUrl?: string): Promise<{ success: boolean; message: string }> {
    const repoPath = getRepoPath(repo)

    if (fs.existsSync(path.join(repoPath, '.git'))) {
      return { success: true, message: '仓库已存在' }
    }

    const cfg = repoConfig.getRepo(repo)
    const url = remoteUrl || cfg?.remote || `https://github.com/pingta-guangpingwang/${repo}.git`

    const parentDir = path.dirname(repoPath)
    fs.ensureDirSync(parentDir)

    if (fs.existsSync(repoPath)) {
      fs.removeSync(repoPath)
    }

    try {
      const { execSync } = await import('child_process')
      execSync(`git clone --depth 1 ${url} "${repoPath}"`, { encoding: 'utf-8', timeout: 60000 })
      await this.loadManifests()
      return { success: true, message: '克隆成功' }
    } catch (e: any) {
      return { success: false, message: `克隆失败: ${e.stderr || e.message}` }
    }
  }

  /** 检查 git 是否可用 */
  async isGitAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process')
      execSync('git --version', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  // ============ 评分 ============

  /** 更新资源评分 */
  async rateResource(id: string, score: number): Promise<void> {
    const repos = getRepoList()
    for (const repo of repos) {
      const manifest = this.manifests.get(repo)
      if (!manifest) continue
      const item = manifest.items.find(i => i.id === id)
      if (item) {
        const oldScore = item.score
        const oldCount = item.rating_count || 0
        item.score = Number(((oldScore * oldCount + score) / (oldCount + 1)).toFixed(1))
        item.rating_count = oldCount + 1
        try {
          manifest.updated = new Date().toISOString()
          manifest.total = manifest.items.length
          await fs.writeFile(
            path.join(getRepoPath(repo), 'manifest.json'),
            JSON.stringify(manifest, null, 2),
            'utf-8',
          )
        } catch { /* 写回失败不影响内存状态 */ }
        return
      }
    }
  }

  /** 获取评分排行榜 */
  getLeaderboard(category?: string, limit: number = 20): ResourceItem[] {
    const all = this.getAllResources()
    const filtered = category ? all.filter(r => r.category === category) : all
    return filtered.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  // ============ 辅助 ============

  private matchesFilters(item: ManifestItem, params: QueryParams): boolean {
    if (params.type && item.type !== params.type) return false
    if (params.category && item.category !== params.category) return false
    if (params.techStack && params.techStack.length > 0) {
      const hasMatch = params.techStack.some(t =>
        item.tech_stack.some(it => it.toLowerCase().includes(t.toLowerCase()))
      )
      if (!hasMatch) return false
    }
    return true
  }

  private toResourceItem(item: ManifestItem, repo: string): ResourceItem {
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      tech_stack: item.tech_stack || [],
      style_tags: item.style_tags || [],
      use_cases: [],
      score: item.score || 0,
      rating_count: 0,
      usage_count: 0,
      source_url: item.source_url || '',
      summary: item.summary || '',
      summary_en: item.summary_en,
      file: item.file || '',
      repo,
      facets: item.facets,
    }
  }
}

export const resourceStore = new ResourceStore()
