// ClaudeRunner — 单个 Claude Code 进程生命周期管理

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface RunnerConfig {
  taskId: string
  prompt: string
  targetRepo: string
  workDir: string
  timeout: number
  batchIndex: number
  totalBatches: number
}

export interface RunnerEvent {
  type: 'start' | 'chunk' | 'yaml_block' | 'progress' | 'complete' | 'error' | 'timeout'
  taskId: string
  batchIndex: number
  data?: any
  error?: string
  progress?: { collected: number; current: string }
}

export class ClaudeRunner extends EventEmitter {
  private proc: ChildProcess | null = null
  private abortController: AbortController | null = null
  private state: 'idle' | 'running' | 'done' | 'error' = 'idle'
  private config: RunnerConfig | null = null
  private outputBuffer = ''
  private collectedCount = 0

  getState(): 'idle' | 'running' | 'done' | 'error' {
    return this.state
  }

  getProgress(): { collected: number; batchIndex: number } {
    return { collected: this.collectedCount, batchIndex: this.config?.batchIndex || 0 }
  }

  async start(config: RunnerConfig): Promise<void> {
    this.config = config
    this.state = 'running'
    this.abortController = new AbortController()
    this.outputBuffer = ''
    this.collectedCount = 0

    const fullPrompt = this.buildPrompt(config)

    this.emitEvent({ type: 'start', taskId: config.taskId, batchIndex: config.batchIndex })

    try {
      const claudePath = await this.findClaudePath()
      this.proc = spawn(claudePath, [
        '-p', fullPrompt,
        '--output-format', 'text',
        '--max-turns', '60',
        '--no-color',
        '--verbose',
      ], {
        cwd: config.workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      const timeout = setTimeout(() => {
        this.emitEvent({ type: 'timeout', taskId: config.taskId, batchIndex: config.batchIndex, error: `超时 (${config.timeout / 1000}s)` })
        this.abort()
      }, config.timeout)

      this.proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        this.outputBuffer += text
        this.emitEvent({ type: 'chunk', taskId: config.taskId, batchIndex: config.batchIndex, data: text })
        this.parseYamlBlocks()
      })

      this.proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim()
        if (text) console.log(`[ClaudeRunner ${config.taskId}#${config.batchIndex}] stderr:`, text.slice(0, 200))
      })

      this.proc.on('error', (err) => {
        clearTimeout(timeout)
        this.state = 'error'
        this.emitEvent({ type: 'error', taskId: config.taskId, batchIndex: config.batchIndex, error: err.message })
      })

      this.proc.on('exit', (code) => {
        clearTimeout(timeout)
        if (this.state === 'running') {
          // 进程退出前再解析一次剩余缓冲区
          this.parseYamlBlocks(true)
          if (code === 0) {
            this.state = 'done'
            this.emitEvent({ type: 'complete', taskId: config.taskId, batchIndex: config.batchIndex, data: { exitCode: code, collected: this.collectedCount } })
          } else {
            this.state = 'error'
            this.emitEvent({ type: 'error', taskId: config.taskId, batchIndex: config.batchIndex, error: `进程退出码: ${code}`, data: { exitCode: code } })
          }
        }
        this.proc = null
      })

      // 监听 abort 信号
      this.abortController.signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        if (this.proc) {
          // SIGTERM first
          this.proc.kill('SIGTERM')
          setTimeout(() => {
            if (this.proc && this.state === 'running') {
              this.proc.kill('SIGKILL')
            }
          }, 10000)
        }
      })
    } catch (e: any) {
      this.state = 'error'
      this.emitEvent({ type: 'error', taskId: config.taskId, batchIndex: config.batchIndex, error: `启动失败: ${e.message}` })
    }
  }

  abort(): void {
    this.abortController?.abort()
  }

  private buildPrompt(config: RunnerConfig): string {
    return `${config.prompt}

输出要求：
每条数据输出一个独立的 YAML frontmatter 块，格式如下：

---
id: <唯一ID>
name: <名称>
type: <类型>
category: <分类>
summary: <一句话概述>
---

<正文内容>

════════════════════════════════
（每个条目之间用上述分隔符分隔）

当前批次：${config.batchIndex + 1}/${config.totalBatches}
请批量生成数据，确保 YAML 格式正确，每条数据完整自包含。`
  }

  private parseYamlBlocks(final: boolean = false): void {
    // 按分隔符或连续 YAML 块分割
    const sepPattern = /═{10,}/g
    const yamlBlockPattern = /---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*?)(?=---\r?\n|═══|$)/g

    // 使用 YAML frontmatter 模式匹配
    let match: RegExpExecArray | null
    const blocks: Array<{ frontmatter: string; body: string }> = []
    let lastIndex = 0

    while ((match = yamlBlockPattern.exec(this.outputBuffer)) !== null) {
      blocks.push({ frontmatter: match[1].trim(), body: (match[2] || '').trim() })
      lastIndex = match.index + match[0].length
    }

    for (const block of blocks) {
      try {
        const parsed = this.parseFrontmatter(block.frontmatter)
        if (parsed) {
          this.collectedCount++
          this.emitEvent({
            type: 'yaml_block',
            taskId: this.config!.taskId,
            batchIndex: this.config!.batchIndex,
            data: { frontmatter: parsed, body: block.body, raw: `---\n${block.frontmatter}\n---\n\n${block.body}` },
            progress: { collected: this.collectedCount, current: parsed.name || parsed.id || 'unknown' },
          })
          this.emitEvent({
            type: 'progress',
            taskId: this.config!.taskId,
            batchIndex: this.config!.batchIndex,
            progress: { collected: this.collectedCount, current: parsed.name || parsed.id || 'unknown' },
          })
        }
      } catch {
        // 跳过解析失败的块
      }
    }

    if (!final) {
      // 保留最后一个可能不完整的块
      if (lastIndex > 0 && lastIndex < this.outputBuffer.length - 100) {
        this.outputBuffer = this.outputBuffer.slice(lastIndex)
      }
      // 限制缓冲区大小
      if (this.outputBuffer.length > 100_000) {
        this.outputBuffer = this.outputBuffer.slice(-50_000)
      }
    }
  }

  private parseFrontmatter(yamlStr: string): Record<string, any> | null {
    try {
      // 简易 YAML key: value 解析（避免引入 js-yaml 在流式场景的同步解析开销）
      const result: Record<string, any> = {}
      const lines = yamlStr.split('\n')
      for (const line of lines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const key = line.slice(0, colonIdx).trim()
        let value = line.slice(colonIdx + 1).trim()
        // 去掉引号
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (key && value) result[key] = value
      }
      return Object.keys(result).length > 0 ? result : null
    } catch {
      return null
    }
  }

  private async findClaudePath(): Promise<string> {
    // Try common claude CLI paths
    const candidates = [
      'claude',
      'claude.exe',
      process.env.LOCALAPPDATA + '\\Programs\\claude\\claude.exe',
      process.env.APPDATA + '\\npm\\claude.cmd',
    ]
    const { execSync } = await import('child_process')
    for (const candidate of candidates) {
      try {
        execSync(`"${candidate}" --version`, { timeout: 5000, stdio: 'pipe' })
        return candidate
      } catch { continue }
    }
    return 'claude' // fallback to PATH lookup
  }

  private emitEvent(event: RunnerEvent): void {
    this.emit('event', event)
    // Also emit on the specific event type
    this.emit(event.type, event)
  }
}
