# Skill 采集架构 — 可插拔数据源技能系统

## 一、核心原则

```
AI 是大脑（决定要什么）
Skill 是手脚（怎么获取）
引擎是脊椎（调度 + 容错 + 管线）
```

**三个硬约束**：

| 原则 | 说明 |
|------|------|
| **模块隔离** | 一个 Skill 炸了不影响其他 Skill 和引擎 |
| **热插拔** | 安装/卸载/更新 Skill 不需要重启引擎 |
| **AI 可设计** | AI 可以读取 Skill 模板 → 生成新 Skill → 安装使用 |

---

## 二、架构对比

### 改前（硬编码）

```
SourceConfig.type = 'claude' | 'crawler' | 'api'
    │
    ├─ if type === 'claude'  → new ClaudeRunner()
    ├─ if type === 'crawler' → new CrawlerRunner()
    └─ if type === 'api'     → new ApiRunner()

问题：
  ✗ 新增采集方式 = 改引擎代码
  ✗ 类型爆炸（RSS? GraphQL? 数据库?）
  ✗ AI 无法自行扩展
  ✗ 错误会蔓延（一个 runner 异常影响引擎循环）
```

### 改后（Skill 插件）

```
SourceConfig.skillId = 'web-crawler'
    │
    └─ skillRegistry.get(skillId) → Skill 实例
         │
         └─ skill.collect(config) → AsyncIterable<ParsedBlock>

每个 Skill = 独立目录 + manifest.json + index.ts
引擎不关心 Skill 内部实现
错误隔离：try/catch 包裹每次 skill.collect() 调用
```

---

## 三、Skill 接口规范

```typescript
// electron/collector/skills/types.ts

/** Skill 元数据（manifest.json） */
interface SkillManifest {
  id: string                    // 唯一标识: "web-crawler"
  name: string                  // 显示名: "网页爬虫采集"
  version: string               // 语义化版本: "1.0.0"
  description: string           // 一句话描述
  author: string
  icon?: string                 // emoji 图标: "🕷️"
  
  /** 该 Skill 需要的配置 JSON Schema */
  configSchema: {
    type: 'object'
    required: string[]
    properties: Record<string, {
      type: string
      description: string
      default?: any
      enum?: string[]
      minimum?: number
      maximum?: number
    }>
  }
  
  /** Skill 分类 */
  category: 'browser' | 'api' | 'cli' | 'filesystem' | 'database' | 'custom'
  
  /** 依赖的可执行程序或 npm 包 */
  dependencies?: {
    npm?: string[]               // npm 包名
    binaries?: string[]          // PATH 中的可执行文件
  }
}

/** Skill 运行时接口 */
interface CollectorSkill {
  manifest: SkillManifest

  /** 校验用户配置是否符合 schema */
  validateConfig(config: Record<string, any>): { valid: boolean; errors: string[] }

  /** 
   * 执行采集，返回异步可迭代的 YAML 块流
   * 引擎负责：进度推送、错误隔离、结果汇入 pending 管线
   */
  collect(
    config: Record<string, any>,
    context: SkillContext,
    signal: AbortSignal,
    onProgress: (e: SkillProgressEvent) => void,
  ): AsyncIterable<ParsedBlock>

  /** 优雅中止 */
  abort(): void
}

interface SkillContext {
  workDir: string               // 临时工作目录
  targetRepo: string            // 目标仓库名
  taxonomy: RepoTaxonomy        // 目标仓库分类法
  sourceId: string              // 采集源 ID
}

interface SkillProgressEvent {
  type: 'page_fetched' | 'item_extracted' | 'api_called' | 'claude_generated' | 'error_skipped'
  message: string
  data?: any
}

interface ParsedBlock {
  frontmatter: Record<string, any>
  body: string
  raw: string
}
```

---

## 四、Skill 目录结构

```
electron/collector/
├── skills/                         # ★ 可插拔技能目录
│   ├── _template/                  # 技能模板（AI 参考此模板生成新 Skill）
│   │   ├── manifest.json
│   │   ├── index.ts
│   │   └── README.md
│   │
│   ├── claude-code/                # Skill 1: Claude Code 采集
│   │   ├── manifest.json
│   │   ├── index.ts                # collect() → spawn claude
│   │   └── README.md
│   │
│   ├── web-crawler/                # Skill 2: 网页爬虫
│   │   ├── manifest.json
│   │   ├── index.ts                # collect() → Puppeteer + Readability + Claude 整理
│   │   ├── humanSimulator.ts       # 人操模拟
│   │   ├── contentExtractor.ts     # 正文提取
│   │   ├── robotsChecker.ts        # robots.txt 合规
│   │   └── README.md
│   │
│   ├── wikipedia-api/             # Skill 3: Wikipedia API
│   │   ├── manifest.json
│   │   ├── index.ts               # collect() → fetch API → 结构化
│   │   └── README.md
│   │
│   └── ... (用户/AI 可继续安装)    # 更多 Skill
│
├── skillRegistry.ts               # ★ Skill 发现/加载/校验/生命周期
├── skillInstaller.ts              # ★ Skill 安装器（从 zip/url/store 安装）
├── collectorEngine.ts             # 引擎（skill-agnostic，只管调度）
├── outputParser.ts                # 共享输出标准化
└── scheduler.ts                   # 定时调度（skill-agnostic）
```

---

## 五、Skill 注册表 — 发现与加载

```typescript
// electron/collector/skillRegistry.ts

class SkillRegistry {
  private skills: Map<string, CollectorSkill> = new Map()
  private skillDirs: string[] = []

  /** 扫描所有 Skill 目录，加载 manifest */
  async discover(): Promise<SkillManifest[]> {
    const manifests: SkillManifest[] = []
    for (const dir of this.skillDirs) {
      const skillDirs = fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('_'))
      
      for (const entry of skillDirs) {
        const manifestPath = path.join(dir, entry.name, 'manifest.json')
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          manifests.push(manifest)
        }
      }
    }
    return manifests
  }

  /** 加载指定 Skill 到内存 */
  async load(skillId: string): Promise<CollectorSkill> {
    // 如果已加载，返回缓存
    if (this.skills.has(skillId)) return this.skills.get(skillId)!

    // 在所有 skill 目录中查找
    for (const dir of this.skillDirs) {
      const skillPath = path.join(dir, skillId)
      if (fs.existsSync(path.join(skillPath, 'manifest.json'))) {
        const module = await import(skillPath + '/index.js')
        const skill = module.default || module[skillId]
        this.skills.set(skillId, skill)
        return skill
      }
    }
    throw new Error(`Skill ${skillId} 未找到`)
  }

  /** 卸载 Skill */
  unload(skillId: string): void {
    this.skills.delete(skillId)
  }

  /** 注册 Skill 目录 */
  addSkillDir(dir: string): void {
    this.skillDirs.push(dir)
  }
}

export const skillRegistry = new SkillRegistry()
```

---

## 六、采集引擎改造 — Skill 隔离

```typescript
// collectorEngine.ts (改造后)

class CollectorEngine {
  async runSource(sourceId: string): Promise<CollectResult> {
    const source = sourceConfig.getSource(sourceId)
    
    // ★ 动态加载 Skill，而非 if type === 'xxx'
    const skill = await skillRegistry.load(source.skillId)
    
    // ★ 校验配置（Skill 自己定义 schema）
    const validation = skill.validateConfig(source.config)
    if (!validation.valid) {
      return { status: 'error', error: `配置校验失败: ${validation.errors.join(', ')}` }
    }

    const ctx: SkillContext = {
      workDir: this.prepareWorkDir(source),
      targetRepo: source.targetRepo,
      taxonomy: repoConfig.getTaxonomy(source.targetRepo)!,
      sourceId,
    }

    const abortController = new AbortController()

    try {
      // ★ Skill 返回异步可迭代流
      for await (const block of skill.collect(
        source.config,
        ctx,
        abortController.signal,
        (e) => this.emitProgress(sourceId, e),
      )) {
        // ★ 每条数据用 outputParser 标准化后汇入 pending
        try {
          const validation = outputParser.validateAgainstTaxonomy(block, source.targetRepo)
          if (validation.valid) {
            const item = outputParser.toPendingItem(block, source.targetRepo, sourceId)
            pendingResourceStore.addItem(item)
          }
        } catch (itemError) {
          // ★ 单条数据错误不影响其他数据
          console.error(`[Engine] 数据标准化失败:`, itemError)
          this.emitProgress(sourceId, { type: 'error_skipped', message: String(itemError) })
        }
      }
    } catch (skillError) {
      // ★ Skill 级别的错误只影响该采集源，不影响引擎
      console.error(`[Engine] Skill ${source.skillId} 运行失败:`, skillError)
      return { status: 'error', error: String(skillError) }
    }
  }
}
```

### 错误隔离层级

```
Level 1: 单条数据错误   → outputParser 跳过，继续下一条
Level 2: Skill 内部错误 → skill.collect() 内部 try/catch，emit error_skipped
Level 3: Skill 崩溃     → 引擎 try/catch skill.collect()，该 source 标记失败
Level 4: 引擎崩溃       → main process uncaughtException 捕获，graceful shutdown
```

---

## 七、Skill 安装系统

```typescript
// electron/collector/skillInstaller.ts

class SkillInstaller {
  /** 从本地 .zip 安装 */
  async installFromZip(zipPath: string): Promise<SkillManifest> {
    // 1. 解压到临时目录
    // 2. 校验 manifest.json 结构
    // 3. 检查依赖（npm install）
    // 4. 复制到 skills/ 目录
    // 5. 通知 skillRegistry 发现新 Skill
  }

  /** 从 Skill Store URL 安装 */
  async installFromUrl(url: string): Promise<SkillManifest> {
    // 下载 → 校验 checksum → installFromZip
  }

  /** AI 生成 Skill 模板 */
  generateSkillTemplate(params: {
    name: string
    description: string
    category: string
    configFields: Array<{ key: string; type: string; description: string; required: boolean }>
  }): string {
    // 基于 _template/ 生成完整的 Skill 目录
    // 返回给 AI，AI 填充 collect() 逻辑后保存为 .zip
  }

  /** 卸载 Skill */
  async uninstall(skillId: string): Promise<void> {
    skillRegistry.unload(skillId)
    // 删除 skills/{skillId}/ 目录
  }
}
```

---

## 八、SourceConfig 改造

```typescript
// 改前
interface SourceConfig {
  type: 'claude' | 'crawler' | 'api'  // 硬编码
  prompt: string
  // 爬虫专属字段混在一起...
}

// 改后
interface SourceConfig {
  id: string
  name: string
  targetRepo: string
  skillId: string                        // ★ 关联 Skill ID
  config: Record<string, any>            // ★ Skill 自定义配置（由 manifest.configSchema 定义）
  schedule: string
  enabled: boolean
  autoSubmit: boolean
}
```

示例：同一个 `web-crawler` Skill，两份不同的 source：

```json
[
  {
    "id": "wiki-ai-history",
    "name": "维基百科-AI历史",
    "skillId": "web-crawler",
    "targetRepo": "AIHistoryData",
    "config": {
      "seedUrls": ["https://en.wikipedia.org/wiki/History_of_AI"],
      "maxDepth": 2,
      "maxPages": 50,
      "selectors": {
        "title": "#firstHeading",
        "content": "#mw-content-text",
        "exclude": [".navbox", ".infobox"]
      },
      "requestDelay": [1500, 4000]
    },
    "schedule": "0 4 * * 0",
    "enabled": false
  },
  {
    "id": "zhihu-ai-columns",
    "name": "知乎-AI专栏采集",
    "skillId": "web-crawler",
    "targetRepo": "DeepBluePrompt",
    "config": {
      "seedUrls": ["https://www.zhihu.com/column/ai-frontier"],
      "maxDepth": 1,
      "maxPages": 20,
      "selectors": {
        "title": ".Post-Title",
        "content": ".RichContent-inner",
        "exclude": [".ContentItem-actions", ".Post-Author"]
      },
      "requestDelay": [3000, 8000]
    },
    "schedule": "manual",
    "enabled": false
  }
]
```

同一个 Skill，不同参数 → 覆盖完全不同的数据源。

---

## 九、AI 自主设计 Skill 流程

```
用户: "我需要采集 arXiv 上最新的 LLM 论文"

AI:
  1. 分析需求 → 确定需要 API 类 Skill
  2. 读取 skills/_template/ → 了解 Skill 结构
  3. 生成 Skill:
     ├── manifest.json (configSchema: query, maxResults, categories...)
     └── index.ts (collect: fetch arXiv API → 解析 XML → YAML block)
  4. 打包为 arxiv-fetcher.zip
  5. 调用 skillInstaller.installFromZip()
  6. 创建 SourceConfig { skillId: "arxiv-fetcher", config: {...} }
  7. 执行采集 → 结果汇入 pending → 审核 → 提交
```

从此，**任何数据源都只是一个 Skill**——AI 不被工具束缚，而是创造工具。

---

## 十、与驾驭工程 Skill 系统的关系

驾驭工程已有 Plugin 系统（pluginIpc.ts），天工的 Skill 系统是其简化版：

| 维度 | 驾驭 Plugin | 天工 Skill |
|------|------------|-----------|
| 用途 | 扩展 IDE 功能 | 扩展数据采集能力 |
| 接口 | 多槽位（renderer/tool/command）| 单一接口（collect） |
| 安装 | 从 zip/url 安装 | 从 zip/url/AI生成 安装 |
| 隔离 | 沙箱隔离 | try/catch + 进程隔离 |
| AI 可生成 | 否 | **是** |

两者可独立演进，不互相依赖。

---

## 十一、里程碑

| 阶段 | 内容 |
|------|------|
| **S1** | Skill 接口标准化 + skillRegistry 实现 |
| **S2** | claude-code Skill 迁移（现有 ClaudeRunner → Skill 接口） |
| **S3** | web-crawler Skill 实现（humanSimulator + contentExtractor + robotsChecker） |
| **S4** | skillInstaller（zip/url 安装 + 依赖检测） |
| **S5** | _template/ — AI 可读的 Skill 模板 + 生成流程 |
| **S6** | wikipedia-api / arxiv-fetcher 等示例 Skill |
| **S7** | Skill Store（GitHub 仓库 + manifest 索引） |
