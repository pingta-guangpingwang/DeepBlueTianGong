// 资源工坊 IPC 处理器

import { ipcMain } from 'electron'
import { resourceStore } from '../core/resourceStore'

export function registerResourceIpc(): void {

  ipcMain.handle('resource:status', async () => {
    return {
      initialized: resourceStore.isInitialized(),
      resourceDir: resourceStore.getResourceDir(),
    }
  })

  ipcMain.handle('resource:query', async (_event, params) => {
    return resourceStore.queryResources(params)
  })

  ipcMain.handle('resource:list', async (_event, repo?: string) => {
    await resourceStore.ensureManifestsLoaded()
    return resourceStore.getAllResources(repo)
  })

  ipcMain.handle('resource:detail', async (_event, id: string) => {
    return resourceStore.getResourceDetail(id)
  })

  ipcMain.handle('resource:leaderboard', async (_event, category?: string, limit?: number) => {
    return resourceStore.getLeaderboard(category, limit)
  })

  ipcMain.handle('resource:changes', async (_event, repo: string) => {
    return resourceStore.getLocalChanges(repo)
  })

  ipcMain.handle('resource:repo-status', async (_event, repo: string) => {
    return resourceStore.getRepoStatus(repo)
  })

  ipcMain.handle('resource:auto-sync', async () => {
    return resourceStore.autoSyncAll()
  })

  ipcMain.handle('resource:sync-pull', async (_event, repo: string) => {
    return resourceStore.syncRepo(repo)
  })

  ipcMain.handle('resource:check-updates', async (_event, repo: string) => {
    return resourceStore.checkForUpdates(repo)
  })

  ipcMain.handle('resource:clone', async (_event, repo: string, remoteUrl?: string) => {
    return resourceStore.cloneRepo(repo, remoteUrl)
  })
}
