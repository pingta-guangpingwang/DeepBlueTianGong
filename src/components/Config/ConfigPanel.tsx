import { useAppContext } from '../../context/AppContext'

export default function ConfigPanel() {
  const { state } = useAppContext()

  return (
    <div className="config-panel">
      <section className="section">
        <h2>仓库配置</h2>
        {state.repos.length === 0 ? (
          <div className="empty-state">
            <p>暂无仓库配置</p>
            <p className="hint">仓库配置从 repos.json 加载，请在配置文件中添加仓库</p>
          </div>
        ) : (
          <div className="config-list">
            {state.repos.map((repo: any) => (
              <div key={repo.name} className="config-card">
                <div className="config-header">
                  <span className="config-name">{repo.label}</span>
                  <span className={`visibility-badge ${repo.visible ? 'visible' : 'hidden'}`}>
                    {repo.visible ? '可见' : '隐藏'}
                  </span>
                </div>
                <div className="config-meta">
                  <span>仓库: {repo.name}</span>
                  <span>远程: {repo.remote}</span>
                </div>
                <div className="taxonomy-info">
                  <span>类型: {repo.taxonomy.types.map((t: any) => t.label).join(', ')}</span>
                  <span>分类: {repo.taxonomy.categories.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          编辑 repos.json 文件来修改仓库配置，修改后重启应用生效
        </p>
      </section>

      <section className="section" style={{ marginTop: 24 }}>
        <h2>采集源配置</h2>
        {state.sources.length === 0 ? (
          <div className="empty-state">
            <p>暂无采集源配置</p>
            <p className="hint">采集源配置从 sources.json 加载，请在配置文件中添加采集源</p>
          </div>
        ) : (
          <div className="config-list">
            {state.sources.map((source: any) => (
              <div key={source.id} className="config-card">
                <div className="config-header">
                  <span>{source.name}</span>
                  <span className={`visibility-badge ${source.enabled ? 'visible' : 'hidden'}`}>
                    {source.enabled ? '启用' : '禁用'}
                  </span>
                </div>
                <div className="config-meta">
                  <span>目标: {source.targetRepo}</span>
                  <span>并行: {source.parallelism}</span>
                  <span>批量: {source.batchSize}</span>
                  <span>调度: {source.schedule}</span>
                  <span>自动提交: {source.autoSubmit ? '是' : '否'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
