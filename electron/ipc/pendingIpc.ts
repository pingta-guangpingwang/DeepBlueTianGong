// 待审核管理 + 贡献追踪 IPC 处理器

import { ipcMain } from 'electron'
import { pendingResourceStore } from '../core/pendingResourceStore'
import { userContributionStore } from '../core/userContributionStore'
import { resourceStore } from '../core/resourceStore'
import { repoConfig } from '../config/repoConfig'

export function registerPendingIpc(): void {

  // ---- 待审核 ----

  ipcMain.handle('pending:list', async () => {
    return pendingResourceStore.items
  })

  ipcMain.handle('pending:add', async (_event, item) => {
    pendingResourceStore.addItem(item)
    return { success: true }
  })

  ipcMain.handle('pending:remove', async (_event, id: string) => {
    return { success: pendingResourceStore.removeItem(id) }
  })

  ipcMain.handle('pending:update', async (_event, id: string, updates: any) => {
    return { success: pendingResourceStore.updateItem(id, updates) }
  })

  ipcMain.handle('pending:count', async () => {
    return {
      pending: pendingResourceStore.getPendingCount(),
      audited: pendingResourceStore.getAuditedCount(),
    }
  })

  ipcMain.handle('pending:cleanup', async () => {
    const approved = pendingResourceStore.getItemsByStatus('approved')
    for (const item of approved) {
      pendingResourceStore.removeItem(item.id)
    }
    return { success: true, removed: approved.length }
  })

  ipcMain.handle('pending:approve', async (_event, id: string) => {
    const item = pendingResourceStore.getItem(id)
    if (!item) return { success: false, message: '未找到该待审项' }

    const result = await resourceStore.addResource({
      id: item.id,
      name: item.name,
      type: item.resourceType,
      category: item.category,
      tech_stack: item.techStack || [],
      style_tags: [],
      use_cases: [],
      score: item.auditScore || 5,
      rating_count: 0,
      usage_count: 0,
      source_url: item.sourceUrl || '',
      summary: item.summary || '',
      repo: item.targetRepo,
      content: item.formattedContent || item.rawContent || '',
    }, item.targetRepo)

    if (result.success) {
      pendingResourceStore.updateItem(id, { status: 'approved' })
      userContributionStore.record({
        id: item.id,
        name: item.name,
        repo: item.targetRepo,
        type: item.resourceType,
      })
    }

    return result
  })

  ipcMain.handle('pending:approve-all', async (_event, repo?: string) => {
    const items = repo
      ? pendingResourceStore.getItemsByStatus('audited').filter(i => i.targetRepo === repo)
      : pendingResourceStore.getItemsByStatus('audited')

    const results: Array<{ id: string; success: boolean }> = []
    for (const item of items) {
      const result = await resourceStore.addResource({
        id: item.id,
        name: item.name,
        type: item.resourceType,
        category: item.category,
        tech_stack: item.techStack || [],
        style_tags: [],
        use_cases: [],
        score: item.auditScore || 5,
        rating_count: 0,
        usage_count: 0,
        source_url: item.sourceUrl || '',
        summary: item.summary || '',
        repo: item.targetRepo,
        content: item.formattedContent || item.rawContent || '',
      }, item.targetRepo)

      if (result.success) {
        pendingResourceStore.updateItem(item.id, { status: 'approved' })
        userContributionStore.record({
          id: item.id,
          name: item.name,
          repo: item.targetRepo,
          type: item.resourceType,
        })
      }
      results.push({ id: item.id, success: result.success })
    }

    return { success: true, results }
  })

  // AI 自动审核：对所有 pending 项执行评分，低分自动拒绝
  ipcMain.handle('pending:audit-all', async () => {
    const pending = pendingResourceStore.getItemsByStatus('pending')
    let audited = 0
    let rejected = 0

    for (const item of pending) {
      let score = 5

      // 内容质量评分
      if (item.summary && item.summary.length > 20) score += 1
      if (item.summary && item.summary.length > 50) score += 1
      if (item.summary && item.summary.length > 100) score += 1
      if (item.name && item.name.length > 1 && item.name.length < 100) score += 1
      if (item.techStack && item.techStack.length > 0) score += 1
      if (item.sourceUrl && item.sourceUrl.startsWith('http')) score += 1

      // 扣分项
      if (!item.summary || item.summary.length < 10) score -= 2
      if (!item.name || item.name.length === 0) score -= 3
      if (item.rawContent && item.rawContent.length < 50) score -= 2

      score = Math.max(1, Math.min(score, 10))

      // 去重检查
      const dup = pendingResourceStore.findDuplicate(item)
      const isDuplicate = dup !== null

      if (score < 4 || isDuplicate) {
        pendingResourceStore.updateItem(item.id, {
          status: 'rejected',
          auditScore: score,
          auditNotes: isDuplicate ? `重复项（重复于: ${dup?.id}）` : `评分过低 (${score}/10)`,
          auditedAt: new Date().toISOString(),
        })
        rejected++
      } else {
        pendingResourceStore.updateItem(item.id, {
          status: 'audited',
          auditScore: score,
          auditNotes: score >= 8 ? '高质量，建议优先入库' : score >= 6 ? '合格' : '基本合格，请人工复核',
          auditedAt: new Date().toISOString(),
        })
        audited++
      }
    }
    return { success: true, audited, rejected }
  })

  // 清理已拒绝项
  ipcMain.handle('pending:clear-rejected', async () => {
    const rejected = pendingResourceStore.getItemsByStatus('rejected')
    for (const item of rejected) {
      pendingResourceStore.removeItem(item.id)
    }
    return { success: true, removed: rejected.length }
  })

  // ---- 贡献追踪 ----

  ipcMain.handle('contribution:list', async () => {
    return userContributionStore.contributions
  })

  ipcMain.handle('contribution:check-status', async () => {
    return {
      total: userContributionStore.contributions.length,
      uncommitted: userContributionStore.getUncommittedIds().size,
      allIds: [...userContributionStore.getAllIds()],
    }
  })

  ipcMain.handle('contribution:commit-all', async (_event, message: string) => {
    const repos = repoConfig.getVisibleRepos()
    const results: Array<{ repo: string; success: boolean; message: string; step?: string }> = []

    for (const repo of repos) {
      // 1. 基础 YAML 校验
      const yamlCheck = await resourceStore.validateCommitYaml(repo.name)
      if (!yamlCheck.valid) {
        results.push({ repo: repo.name, success: false, message: yamlCheck.errors.join('\n'), step: 'yaml-check' })
        continue
      }

      if (yamlCheck.filesToCommit.length === 0) {
        results.push({ repo: repo.name, success: true, message: '无变更，跳过' })
        continue
      }

      // 2. 提交
      const escaped = message.replace(/"/g, '\\"')
      const commitResult = await resourceStore.commitAll(repo.name, escaped)
      if (!commitResult.success) {
        results.push({ repo: repo.name, success: false, message: commitResult.message, step: 'commit' })
        continue
      }

      // 3. 推送
      const status = await resourceStore.getRepoStatus(repo.name).catch(() => null)
      const branch = status?.branch || 'main'
      const pushResult = await resourceStore.pushBranch(repo.name, branch)
      if (pushResult.success) {
        const contribs = userContributionStore.contributions.filter(c => c.repo === repo.name && !c.committed)
        if (contribs.length > 0) {
          userContributionStore.markCommitted(contribs.map(c => c.id))
          userContributionStore.markPushed(contribs.map(c => c.id))
        }
        results.push({ repo: repo.name, success: true, message: '已提交并推送' })
      } else {
        results.push({ repo: repo.name, success: false, message: pushResult.message, step: 'push' })
      }
    }

    return { success: results.every(r => r.success), results }
  })
}
