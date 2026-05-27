"use strict";
// 资源工坊 IPC 处理器
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerResourceIpc = registerResourceIpc;
const electron_1 = require("electron");
const resourceStore_1 = require("../core/resourceStore");
const taxonomyStore_1 = require("../config/taxonomyStore");
function registerResourceIpc() {
    electron_1.ipcMain.handle('resource:status', async () => {
        return {
            initialized: resourceStore_1.resourceStore.isInitialized(),
            resourceDir: resourceStore_1.resourceStore.getResourceDir(),
        };
    });
    electron_1.ipcMain.handle('resource:query', async (_event, params) => {
        return resourceStore_1.resourceStore.queryResources(params);
    });
    electron_1.ipcMain.handle('resource:list', async (_event, repo) => {
        await resourceStore_1.resourceStore.ensureManifestsLoaded();
        return resourceStore_1.resourceStore.getAllResources(repo);
    });
    electron_1.ipcMain.handle('resource:detail', async (_event, id) => {
        return resourceStore_1.resourceStore.getResourceDetail(id);
    });
    electron_1.ipcMain.handle('resource:leaderboard', async (_event, category, limit) => {
        return resourceStore_1.resourceStore.getLeaderboard(category, limit);
    });
    electron_1.ipcMain.handle('resource:changes', async (_event, repo) => {
        return resourceStore_1.resourceStore.getLocalChanges(repo);
    });
    electron_1.ipcMain.handle('resource:repo-status', async (_event, repo) => {
        return resourceStore_1.resourceStore.getRepoStatus(repo);
    });
    electron_1.ipcMain.handle('resource:auto-sync', async () => {
        return resourceStore_1.resourceStore.autoSyncAll();
    });
    electron_1.ipcMain.handle('resource:sync-pull', async (_event, repo) => {
        return resourceStore_1.resourceStore.syncRepo(repo);
    });
    electron_1.ipcMain.handle('resource:check-updates', async (_event, repo) => {
        return resourceStore_1.resourceStore.checkForUpdates(repo);
    });
    electron_1.ipcMain.handle('resource:clone', async (_event, repo, remoteUrl) => {
        return resourceStore_1.resourceStore.cloneRepo(repo, remoteUrl);
    });
    // ============ 分面分类体系 ============
    electron_1.ipcMain.handle('taxonomy:facets', async () => {
        return taxonomyStore_1.taxonomyStore.getFacets();
    });
    electron_1.ipcMain.handle('taxonomy:resolve', async (_event, facets) => {
        return taxonomyStore_1.taxonomyStore.resolve(facets);
    });
    electron_1.ipcMain.handle('taxonomy:expand', async (_event, facets) => {
        return taxonomyStore_1.taxonomyStore.expand(facets);
    });
    electron_1.ipcMain.handle('taxonomy:label', async (_event, code) => {
        return taxonomyStore_1.taxonomyStore.getLabel(code);
    });
    electron_1.ipcMain.handle('taxonomy:children', async (_event, facetName, parentCode) => {
        return taxonomyStore_1.taxonomyStore.getChildren(facetName, parentCode);
    });
    electron_1.ipcMain.handle('taxonomy:roots', async (_event, facetName) => {
        return taxonomyStore_1.taxonomyStore.getRoots(facetName);
    });
}
