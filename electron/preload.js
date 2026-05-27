"use strict";
// 深蓝天工 — IPC 桥接
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // ============ 资源工坊 ============
    resourceStatus: () => electron_1.ipcRenderer.invoke('resource:status'),
    resourceQuery: (params) => electron_1.ipcRenderer.invoke('resource:query', params),
    resourceList: (repo) => electron_1.ipcRenderer.invoke('resource:list', repo),
    resourceDetail: (id) => electron_1.ipcRenderer.invoke('resource:detail', id),
    resourceLeaderboard: (category, limit) => electron_1.ipcRenderer.invoke('resource:leaderboard', category, limit),
    resourceChanges: (repo) => electron_1.ipcRenderer.invoke('resource:changes', repo),
    resourceRepoStatus: (repo) => electron_1.ipcRenderer.invoke('resource:repo-status', repo),
    resourceAutoSync: () => electron_1.ipcRenderer.invoke('resource:auto-sync'),
    resourceSyncPull: (repo) => electron_1.ipcRenderer.invoke('resource:sync-pull', repo),
    resourceCheckUpdates: (repo) => electron_1.ipcRenderer.invoke('resource:check-updates', repo),
    resourceClone: (repo, remoteUrl) => electron_1.ipcRenderer.invoke('resource:clone', repo, remoteUrl),
    // ============ 待审核管理 ============
    pendingList: () => electron_1.ipcRenderer.invoke('pending:list'),
    pendingAdd: (item) => electron_1.ipcRenderer.invoke('pending:add', item),
    pendingRemove: (id) => electron_1.ipcRenderer.invoke('pending:remove', id),
    pendingUpdate: (id, updates) => electron_1.ipcRenderer.invoke('pending:update', id, updates),
    pendingCount: () => electron_1.ipcRenderer.invoke('pending:count'),
    pendingCleanup: () => electron_1.ipcRenderer.invoke('pending:cleanup'),
    pendingApprove: (id) => electron_1.ipcRenderer.invoke('pending:approve', id),
    pendingApproveAll: (repo) => electron_1.ipcRenderer.invoke('pending:approve-all', repo),
    pendingAuditAll: () => electron_1.ipcRenderer.invoke('pending:audit-all'),
    pendingClearRejected: () => electron_1.ipcRenderer.invoke('pending:clear-rejected'),
    // ============ 贡献追踪 ============
    contributionList: () => electron_1.ipcRenderer.invoke('contribution:list'),
    contributionCheckStatus: () => electron_1.ipcRenderer.invoke('contribution:check-status'),
    contributionCommitAll: (message) => electron_1.ipcRenderer.invoke('contribution:commit-all', message),
    // ============ 采集控制 ============
    collectorRun: (sourceId) => electron_1.ipcRenderer.invoke('collector:run', sourceId),
    collectorAbort: () => electron_1.ipcRenderer.invoke('collector:abort'),
    collectorStatus: () => electron_1.ipcRenderer.invoke('collector:status'),
    collectorHistory: () => electron_1.ipcRenderer.invoke('collector:history'),
    collectorOnEvent: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('collector:event', handler);
        return () => { electron_1.ipcRenderer.removeListener('collector:event', handler); };
    },
    // ============ 仓库配置 ============
    repoList: () => electron_1.ipcRenderer.invoke('repo:list'),
    repoGet: (name) => electron_1.ipcRenderer.invoke('repo:get', name),
    repoAdd: (repo) => electron_1.ipcRenderer.invoke('repo:add', repo),
    repoRemove: (name) => electron_1.ipcRenderer.invoke('repo:remove', name),
    repoUpdate: (name, updates) => electron_1.ipcRenderer.invoke('repo:update', name, updates),
    // ============ 采集源配置 ============
    sourceList: () => electron_1.ipcRenderer.invoke('source:list'),
    sourceGet: (id) => electron_1.ipcRenderer.invoke('source:get', id),
    sourceAdd: (source) => electron_1.ipcRenderer.invoke('source:add', source),
    sourceRemove: (id) => electron_1.ipcRenderer.invoke('source:remove', id),
    sourceUpdate: (id, updates) => electron_1.ipcRenderer.invoke('source:update', id, updates),
    // ============ 窗口控制 ============
    windowMinimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
    windowMaximize: () => electron_1.ipcRenderer.invoke('window:maximize'),
    windowClose: () => electron_1.ipcRenderer.invoke('window:close'),
    // ============ Skill 管理 ============
    skillDiscover: () => electron_1.ipcRenderer.invoke('skill:discover'),
    skillList: () => electron_1.ipcRenderer.invoke('skill:list'),
    skillGet: (skillId) => electron_1.ipcRenderer.invoke('skill:get', skillId),
    skillLoad: (skillId) => electron_1.ipcRenderer.invoke('skill:load', skillId),
    skillUnload: (skillId) => electron_1.ipcRenderer.invoke('skill:unload', skillId),
    skillCheckDeps: (skillId) => electron_1.ipcRenderer.invoke('skill:check-deps', skillId),
    skillInstallFromZip: () => electron_1.ipcRenderer.invoke('skill:install-from-zip'),
    skillInstallFromUrl: (url) => electron_1.ipcRenderer.invoke('skill:install-from-url', url),
    skillUninstall: (skillId) => electron_1.ipcRenderer.invoke('skill:uninstall', skillId),
    skillGenerateTemplate: (params) => electron_1.ipcRenderer.invoke('skill:generate-template', params),
    skillOpenDir: () => electron_1.ipcRenderer.invoke('skill:open-dir'),
    // ============ 应用设置 ============
    getAppSettings: () => electron_1.ipcRenderer.invoke('app:get-settings'),
    setAppSettings: (settings) => electron_1.ipcRenderer.invoke('app:set-settings', settings),
    // ============ 分面分类 ============
    taxonomyFacets: () => electron_1.ipcRenderer.invoke('taxonomy:facets'),
    taxonomyResolve: (facets) => electron_1.ipcRenderer.invoke('taxonomy:resolve', facets),
    taxonomyExpand: (facets) => electron_1.ipcRenderer.invoke('taxonomy:expand', facets),
    taxonomyLabel: (code) => electron_1.ipcRenderer.invoke('taxonomy:label', code),
});
