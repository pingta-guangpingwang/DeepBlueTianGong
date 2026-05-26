// 深蓝天工 — IPC 桥接

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {

  // ============ 资源工坊 ============
  resourceStatus: () => ipcRenderer.invoke('resource:status'),
  resourceQuery: (params: any) => ipcRenderer.invoke('resource:query', params),
  resourceList: (repo?: string) => ipcRenderer.invoke('resource:list', repo),
  resourceDetail: (id: string) => ipcRenderer.invoke('resource:detail', id),
  resourceLeaderboard: (category?: string, limit?: number) => ipcRenderer.invoke('resource:leaderboard', category, limit),
  resourceChanges: (repo: string) => ipcRenderer.invoke('resource:changes', repo),
  resourceRepoStatus: (repo: string) => ipcRenderer.invoke('resource:repo-status', repo),
  resourceAutoSync: () => ipcRenderer.invoke('resource:auto-sync'),
  resourceSyncPull: (repo: string) => ipcRenderer.invoke('resource:sync-pull', repo),
  resourceCheckUpdates: (repo: string) => ipcRenderer.invoke('resource:check-updates', repo),
  resourceClone: (repo: string, remoteUrl?: string) => ipcRenderer.invoke('resource:clone', repo, remoteUrl),

  // ============ 待审核管理 ============
  pendingList: () => ipcRenderer.invoke('pending:list'),
  pendingAdd: (item: any) => ipcRenderer.invoke('pending:add', item),
  pendingRemove: (id: string) => ipcRenderer.invoke('pending:remove', id),
  pendingUpdate: (id: string, updates: any) => ipcRenderer.invoke('pending:update', id, updates),
  pendingCount: () => ipcRenderer.invoke('pending:count'),
  pendingCleanup: () => ipcRenderer.invoke('pending:cleanup'),
  pendingApprove: (id: string) => ipcRenderer.invoke('pending:approve', id),
  pendingApproveAll: (repo?: string) => ipcRenderer.invoke('pending:approve-all', repo),
  pendingAuditAll: () => ipcRenderer.invoke('pending:audit-all'),
  pendingClearRejected: () => ipcRenderer.invoke('pending:clear-rejected'),

  // ============ 贡献追踪 ============
  contributionList: () => ipcRenderer.invoke('contribution:list'),
  contributionCheckStatus: () => ipcRenderer.invoke('contribution:check-status'),
  contributionCommitAll: (message: string) => ipcRenderer.invoke('contribution:commit-all', message),

  // ============ 采集控制 ============
  collectorRun: (sourceId: string) => ipcRenderer.invoke('collector:run', sourceId),
  collectorAbort: () => ipcRenderer.invoke('collector:abort'),
  collectorStatus: () => ipcRenderer.invoke('collector:status'),
  collectorHistory: () => ipcRenderer.invoke('collector:history'),
  collectorOnEvent: (callback: (event: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('collector:event', handler)
    return () => { ipcRenderer.removeListener('collector:event', handler) }
  },

  // ============ 仓库配置 ============
  repoList: () => ipcRenderer.invoke('repo:list'),
  repoGet: (name: string) => ipcRenderer.invoke('repo:get', name),
  repoAdd: (repo: any) => ipcRenderer.invoke('repo:add', repo),
  repoRemove: (name: string) => ipcRenderer.invoke('repo:remove', name),
  repoUpdate: (name: string, updates: any) => ipcRenderer.invoke('repo:update', name, updates),

  // ============ 采集源配置 ============
  sourceList: () => ipcRenderer.invoke('source:list'),
  sourceGet: (id: string) => ipcRenderer.invoke('source:get', id),
  sourceAdd: (source: any) => ipcRenderer.invoke('source:add', source),
  sourceRemove: (id: string) => ipcRenderer.invoke('source:remove', id),
  sourceUpdate: (id: string, updates: any) => ipcRenderer.invoke('source:update', id, updates),

  // ============ 窗口控制 ============
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // ============ 应用设置 ============
  getAppSettings: () => ipcRenderer.invoke('app:get-settings'),
  setAppSettings: (settings: any) => ipcRenderer.invoke('app:set-settings', settings),
})
