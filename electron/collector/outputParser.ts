// OutputParser — Claude Code 输出解析为标准化 PendingResourceItem

import * as yaml from 'js-yaml'
import { repoConfig, RepoTaxonomy } from '../config/repoConfig'
import type { PendingResourceItem } from '../core/pendingResourceStore'

export interface ParsedBlock {
  frontmatter: Record<string, any>
  body: string
  raw: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  item: ParsedBlock
}

export class OutputParser {

  /** 从原始输出中提取所有 YAML frontmatter 块 */
  extractYamlBlocks(rawOutput: string): ParsedBlock[] {
    const blocks: ParsedBlock[] = []
    const pattern = /---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*?)(?=---\r?\n|═══|════|$)/g

    let match: RegExpExecArray | null
    while ((match = pattern.exec(rawOutput)) !== null) {
      const frontmatterStr = match[1].trim()
      const body = (match[2] || '').trim()
      try {
        const frontmatter = (yaml.load(frontmatterStr) as Record<string, any>) || {}
        if (frontmatter && Object.keys(frontmatter).length > 0) {
          blocks.push({
            frontmatter,
            body,
            raw: `---\n${frontmatterStr}\n---\n\n${body}`,
          })
        }
      } catch {
        // 跳过 YAML 解析失败的块
      }
    }
    return blocks
  }

  /** 校验单条数据是否符合目标仓库的 taxonomy 要求 */
  validateAgainstTaxonomy(item: ParsedBlock, targetRepo: string): ValidationResult {
    const errors: string[] = []
    const taxonomy = repoConfig.getTaxonomy(targetRepo)
    if (!taxonomy) {
      return { valid: false, errors: [`仓库 ${targetRepo} 的 taxonomy 配置不存在`], item }
    }

    const requiredFields = taxonomy.requiredFields || ['id', 'name', 'type', 'category', 'summary']
    for (const field of requiredFields) {
      const val = item.frontmatter[field]
      if (!val || (typeof val === 'string' && val.trim() === '')) {
        errors.push(`缺少必填字段: ${field}`)
      }
    }

    const validTypes = taxonomy.types?.map(t => t.id) || []
    if (validTypes.length > 0 && item.frontmatter.type) {
      if (!validTypes.includes(item.frontmatter.type)) {
        errors.push(`type 值 "${item.frontmatter.type}" 不在有效类型列表中: ${validTypes.join(', ')}`)
      }
    }

    const categories = taxonomy.categories || []
    if (categories.length > 0 && item.frontmatter.category) {
      if (!categories.includes(item.frontmatter.category)) {
        // 类别不在预设列表中，发出警告但不阻止
        console.log(`[OutputParser] 类别 "${item.frontmatter.category}" 不在预设类别中: ${categories.join(', ')}`)
      }
    }

    return { valid: errors.length === 0, errors, item }
  }

  /** 将 ParsedBlock 转为 PendingResourceItem */
  toPendingItem(item: ParsedBlock, targetRepo: string, sourceId: string): PendingResourceItem {
    const fm = item.frontmatter
    const id = fm.id || `${targetRepo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    return {
      id,
      name: fm.name || id,
      resourceType: fm.type || 'other',
      targetRepo,
      category: fm.category || 'other',
      techStack: Array.isArray(fm.tech_stack) ? fm.tech_stack : (fm.tech_stack ? [fm.tech_stack] : []),
      sourceUrl: fm.source_url || fm.sourceUrl || '',
      summary: fm.summary || '',
      rawContent: item.raw,
      status: 'pending',
      auditScore: 0,
      auditNotes: '',
      formattedContent: item.raw,
      auditedAt: '',
      createdAt: new Date().toISOString(),
    }
  }

  /** 批量处理：提取 → 校验 → 转为 pending items */
  processBatch(rawOutput: string, targetRepo: string, sourceId: string): {
    items: PendingResourceItem[]
    rejected: Array<{ item: ParsedBlock; errors: string[] }>
  } {
    const blocks = this.extractYamlBlocks(rawOutput)
    const items: PendingResourceItem[] = []
    const rejected: Array<{ item: ParsedBlock; errors: string[] }> = []

    for (const block of blocks) {
      const validation = this.validateAgainstTaxonomy(block, targetRepo)
      if (validation.valid) {
        items.push(this.toPendingItem(block, targetRepo, sourceId))
      } else {
        rejected.push({ item: block, errors: validation.errors })
      }
    }

    return { items, rejected }
  }
}

export const outputParser = new OutputParser()
