const zh = {
  app: {
    title: '深蓝天工 · 知识采集引擎',
  },
  tabs: {
    collector: '采集',
    workshop: '工坊',
    pending: '待审',
    config: '配置',
  },
  collector: {
    title: '数据源',
    empty: '暂无采集源配置',
    emptyHint: '请在「配置」标签页中添加数据源和目标仓库',
    status: '运行状态',
    idle: '就绪，等待采集任务启动',
    running: '采集运行中...',
  },
  workshop: {
    allRepos: '全部仓库',
    search: '搜索资源...',
    syncing: '正在从 GitHub 获取最新数据...',
    sync: '一键同步',
    commit: '一键提交',
    empty: '暂无资源数据',
    emptyHint: '请先同步仓库或添加采集源开始采集',
  },
  pending: {
    title: '待审核资源',
    empty: '暂无待审核资源',
    emptyHint: '采集完成或手动添加的资源将出现在这里',
    auditAll: '一键审核全部',
    approveAll: '一键入库全部',
    approve: '批准',
    delete: '删除',
  },
  config: {
    repos: '仓库配置',
    reposEmpty: '暂无仓库配置',
    reposHint: '仓库配置从 repos.json 加载',
    sources: '采集源配置',
    sourcesEmpty: '暂无采集源配置',
    sourcesHint: '采集源配置从 sources.json 加载',
  },
}

export default zh
