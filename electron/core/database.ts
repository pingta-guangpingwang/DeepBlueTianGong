// 本地 JSON 键值数据库 — 原子写入

import * as path from 'path'
import * as fs from 'fs-extra'

function getDataDir(): string {
  const appData = process.env.APPDATA || path.join(process.env.HOME || '.', 'AppData', 'Roaming')
  return path.join(appData, 'dbghf')
}

function dbPath(name: string): string {
  return path.join(getDataDir(), `${name}.json`)
}

async function read(name: string, fallback: any = {}): Promise<any> {
  try {
    const p = dbPath(name)
    if (!await fs.pathExists(p)) return fallback
    return await fs.readJson(p)
  } catch { return fallback }
}

async function write(name: string, data: any): Promise<void> {
  await fs.ensureDir(getDataDir())
  const tmp = dbPath(name + '.tmp')
  const target = dbPath(name)
  await fs.writeJson(tmp, { ...data, _updatedAt: new Date().toISOString() })
  await fs.move(tmp, target, { overwrite: true })
}

export const db = {
  getConfig: () => read('config', { repoVisible: {}, sourceEnabled: {} }),
  setConfig: (data: any) => write('config', data),

  getAppSettings: () => read('app-settings', {
    language: 'zh',
    autoSyncOnStart: true,
    maxParallelCollectors: 4,
  }),
  setAppSettings: (data: any) => write('app-settings', data),

  getCollectorState: () => read('collector-state', { sources: {} }),
  setCollectorState: (data: any) => write('collector-state', data),

  DATA_DIR: getDataDir(),
}
