import { useAppContext } from '../../context/AppContext'

export default function CollectorDashboard() {
  const { state } = useAppContext()

  return (
    <div className="collector-dashboard">
      <section className="section">
        <h2>数据源</h2>
        {state.sources.length === 0 ? (
          <div className="empty-state">
            <p>暂无采集源配置</p>
            <p className="hint">请在「配置」标签页中添加数据源和目标仓库</p>
          </div>
        ) : (
          <div className="source-cards">
            {state.sources.map((source: any) => (
              <div key={source.id} className={`source-card ${source.enabled ? 'enabled' : 'disabled'}`}>
                <div className="source-header">
                  <span className="source-name">{source.name}</span>
                  <span className={`source-badge ${source.enabled ? 'on' : 'off'}`}>
                    {source.enabled ? '启用' : '禁用'}
                  </span>
                </div>
                <div className="source-meta">
                  <span>目标: {source.targetRepo}</span>
                  <span>并行: {source.parallelism} 线程</span>
                  <span>批量: {source.batchSize} 条/线程</span>
                  <span>调度: {source.schedule}</span>
                </div>
                <p className="source-prompt">{source.prompt}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>运行状态</h2>
        <div className="status-panel">
          {state.collectorRunning ? (
            <div className="running-indicator">
              <span className="spinner" />
              <span>采集运行中...</span>
            </div>
          ) : (
            <p className="idle-text">就绪，等待采集任务启动</p>
          )}
        </div>
      </section>
    </div>
  )
}
