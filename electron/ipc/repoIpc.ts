// 仓库 + 采集源配置 IPC 处理器

import { ipcMain } from 'electron'
import { repoConfig } from '../config/repoConfig'
import { sourceConfig } from '../config/sourceConfig'
import { db } from '../core/database'

export function registerRepoIpc(): void {

  // ---- 仓库配置 ----

  ipcMain.handle('repo:list', async () => {
    return repoConfig.getRepos()
  })

  ipcMain.handle('repo:get', async (_event, name: string) => {
    return repoConfig.getRepo(name) || null
  })

  ipcMain.handle('repo:add', async (_event, repo: any) => {
    repoConfig.addRepo(repo)
    return { success: true }
  })

  ipcMain.handle('repo:remove', async (_event, name: string) => {
    return { success: repoConfig.removeRepo(name) }
  })

  ipcMain.handle('repo:update', async (_event, name: string, updates: any) => {
    return { success: repoConfig.updateRepo(name, updates) }
  })

  // ---- 采集源配置 ----

  ipcMain.handle('source:list', async () => {
    return sourceConfig.getSources()
  })

  ipcMain.handle('source:get', async (_event, id: string) => {
    return sourceConfig.getSource(id) || null
  })

  ipcMain.handle('source:add', async (_event, source: any) => {
    sourceConfig.addSource(source)
    return { success: true }
  })

  ipcMain.handle('source:remove', async (_event, id: string) => {
    return { success: sourceConfig.removeSource(id) }
  })

  ipcMain.handle('source:update', async (_event, id: string, updates: any) => {
    return { success: sourceConfig.updateSource(id, updates) }
  })

  // ---- 应用设置 ----

  ipcMain.handle('app:get-settings', async () => {
    return db.getAppSettings()
  })

  ipcMain.handle('app:set-settings', async (_event, settings: any) => {
    await db.setAppSettings(settings)
    return { success: true }
  })
}
