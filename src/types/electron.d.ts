// 深蓝天工 — Electron API 类型声明

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

export interface RepoConfig {
  name: string
  label: string
  labelEn?: string
  remote: string
  visible: boolean
  taxonomy: {
    types: Array<{ id: string; label: string; dir: string }>
    categories: string[]
    requiredFields: string[]
    optionalFields?: string[]
  }
}

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

export interface CollectorEvent {
  type: 'source_start' | 'source_done' | 'source_error' | 'runner_start' | 'runner_progress' | 'runner_done' | 'runner_error' | 'item_collected' | 'started' | 'progress' | 'done' | 'error' | 'aborted' | 'auto_submit_triggered'
  sourceId?: string
  sourceName?: string
  message?: string
  data?: any
  progress?: {
    totalBatches: number
    completedBatches: number
    totalItems: number
    collectedItems: number
    failedItems: number
    runningRunners: number
  }
  targetRepo?: string
}

export interface CommitResult {
  repo: string
  success: boolean
  message: string
  step?: 'scope-check' | 'pull' | 'commit' | 'push'
}

export interface ElectronAPI {
  // 资源工坊
  resourceStatus: () => Promise<{ initialized: boolean; resourceDir: string }>
  resourceQuery: (params: any) => Promise<ResourceItem[]>
  resourceList: (repo?: string) => Promise<ResourceItem[]>
  resourceDetail: (id: string) => Promise<ResourceItem | null>
  resourceLeaderboard: (category?: string, limit?: number) => Promise<ResourceItem[]>
  resourceChanges: (repo: string) => Promise<Array<{ path: string; status: string }>>
  resourceRepoStatus: (repo: string) => Promise<any>
  resourceAutoSync: () => Promise<{ synced: string[]; message: string }>
  resourceSyncPull: (repo: string) => Promise<{ success: boolean; message: string }>
  resourceCheckUpdates: (repo: string) => Promise<{ success: boolean; hasUpdates: boolean; behind: number; message: string }>
  resourceClone: (repo: string, remoteUrl?: string) => Promise<{ success: boolean; message: string }>

  // 待审核
  pendingList: () => Promise<PendingResourceItem[]>
  pendingAdd: (item: any) => Promise<{ success: boolean }>
  pendingRemove: (id: string) => Promise<{ success: boolean }>
  pendingUpdate: (id: string, updates: any) => Promise<{ success: boolean }>
  pendingCount: () => Promise<{ pending: number; audited: number }>
  pendingCleanup: () => Promise<{ success: boolean; removed: number }>
  pendingApprove: (id: string) => Promise<{ success: boolean; message?: string }>
  pendingApproveAll: (repo?: string) => Promise<{ success: boolean; results: Array<{ id: string; success: boolean }> }>
  pendingAuditAll: () => Promise<{ success: boolean; audited: number; rejected: number }>
  pendingClearRejected: () => Promise<{ success: boolean; removed: number }>

  // 贡献追踪
  contributionList: () => Promise<any[]>
  contributionCheckStatus: () => Promise<{ total: number; uncommitted: number; allIds: string[] }>
  contributionCommitAll: (message: string) => Promise<{ success: boolean; results: CommitResult[] }>

  // 采集控制
  collectorRun: (sourceId: string) => Promise<{ success: boolean; message: string }>
  collectorAbort: () => Promise<{ success: boolean; message: string }>
  collectorStatus: () => Promise<{ running: boolean; currentSourceId: string | null; pool: Array<{ taskId: string; state: string; progress: { collected: number; batchIndex: number } }>; history: any[] }>
  collectorHistory: () => Promise<any[]>
  collectorOnEvent: (callback: (event: CollectorEvent) => void) => () => void

  // 仓库配置
  repoList: () => Promise<RepoConfig[]>
  repoGet: (name: string) => Promise<RepoConfig | null>
  repoAdd: (repo: any) => Promise<{ success: boolean }>
  repoRemove: (name: string) => Promise<{ success: boolean }>
  repoUpdate: (name: string, updates: any) => Promise<{ success: boolean }>

  // 采集源配置
  sourceList: () => Promise<SourceConfig[]>
  sourceGet: (id: string) => Promise<SourceConfig | null>
  sourceAdd: (source: any) => Promise<{ success: boolean }>
  sourceRemove: (id: string) => Promise<{ success: boolean }>
  sourceUpdate: (id: string, updates: any) => Promise<{ success: boolean }>

  // 窗口
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>

  // 设置
  getAppSettings: () => Promise<any>
  setAppSettings: (settings: any) => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
