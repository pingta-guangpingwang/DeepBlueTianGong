# 深蓝天工 · 知识采集引擎

**DeepBlue TianGong** — AI 驱动的多线程知识采集、整理、审核、发布引擎。

名字取自宋应星《天工开物》，中国古代最伟大的技术百科全书。天工，自然之力；开物，人造之器。AI 驱动采集为"天工"，人工审核标化为"开物"。

---

## 核心能力

| 能力 | 说明 |
|------|------|
| **多线程采集** | 同时启动 N 个 Claude Code 进程，并行从多个数据源采集知识 |
| **AI 自动审核** | 采集结果自动评分、去重、格式校验 |
| **YAML 标准化** | 自动生成标准 frontmatter + 正文的 Markdown 文件 |
| **安全提交** | 4 道安全闸门（范围管控/强制拉取/格式校验/冲突重试）→ GitHub |
| **仓库配置** | 每个仓库自描述分类法（类型/目录/必填字段），不硬编码领域知识 |
| **定时调度** | Cron 表达式驱动，全自动无人值守运行 |

## 架构

```
采集任务配置 → Claude Code × N 并行采集 → 数据汇聚 → AI审核 → YAML标准化 → GitHub公开仓库
```

## 与深蓝家族的关系

| 项目 | 定位 | 关系 |
|------|------|------|
| **深蓝天工** (本项目) | 知识采集生产端 | 数据生产者 |
| **深蓝驾驭工程** | 多项目 AI 驾驶舱 | 数据消费端 |
| **深蓝提示词库/案例坊/工具集/身份库** | GitHub 知识仓库 | 天工产出+驾驭消费 |

## 快速开始

```bash
# 安装依赖
npm install

# 配置仓库（编辑 repos.json）
# 配置采集源（编辑 sources.json）

# 启动开发模式
npm run dev

# 生产构建
npm run build
```

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **后端**: Electron + Node.js
- **AI 引擎**: Claude Code CLI (多线程)
- **数据存储**: JSON 文件 + Git 仓库
- **CI/CD**: GitHub Actions（自动拉取+入库）

## 仓库配置示例

```json
{
  "name": "AIHistoryPeople",
  "label": "AI历史人物",
  "remote": "https://github.com/pingta-guangpingwang/AIHistoryPeople.git",
  "taxonomy": {
    "types": [
      { "id": "person", "label": "人物", "dir": "people" },
      { "id": "event", "label": "事件", "dir": "events" }
    ],
    "categories": ["先秦", "秦汉", "隋唐", "宋元", "明清"],
    "requiredFields": ["id", "name", "type", "category", "era", "summary"]
  }
}
```

## License

MIT
