import { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'

export default function WorkshopView() {
  const { state, dispatch } = useAppContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<string>('all')
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [checkingCommit, setCheckingCommit] = useState(false)
  const [showCommit, setShowCommit] = useState(false)
  const [commitResults, setCommitResults] = useState<any[] | null>(null)

  const filteredResources = state.resources.filter((r: any) => {
    if (selectedRepo !== 'all' && r.repo !== selectedRepo) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return r.name.toLowerCase().includes(q) || r.summary?.toLowerCase().includes(q)
    }
    return true
  })

  const autoSync = useCallback(async () => {
    setAutoSyncing(true)
    try {
      const api = window.electronAPI
      if (!api) return
      const result = await api.resourceAutoSync()
      if (result.synced.length > 0) {
        const resources = await api.resourceList()
        dispatch({ type: 'SET_RESOURCES', payload: resources })
      }
    } catch (e) {
      console.error('[Workshop] 同步失败:', e)
    } finally {
      setAutoSyncing(false)
    }
  }, [dispatch])

  const handleCheckCommit = async () => {
    setCheckingCommit(true)
    setShowCommit(true)
    try {
      const api = window.electronAPI
      if (!api) return
      const status = await api.contributionCheckStatus()
      if (status.uncommitted > 0) {
        const result = await api.contributionCommitAll('自动提交: 资源入库')
        setCommitResults(result.results)
      } else {
        setCommitResults([])
      }
    } catch (e) {
      console.error('[Workshop] 提交失败:', e)
    } finally {
      setCheckingCommit(false)
    }
  }

  useEffect(() => {
    autoSync()
  }, [])

  return (
    <div className="workshop-view">
      <div className="toolbar">
        <div className="toolbar-left">
          <select value={selectedRepo} onChange={e => setSelectedRepo(e.target.value)} className="repo-select">
            <option value="all">全部仓库</option>
            {state.repos.filter((r: any) => r.visible).map((r: any) => (
              <option key={r.name} value={r.name}>{r.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜索资源..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="toolbar-right">
          {autoSyncing && <span className="sync-status">正在从 GitHub 获取最新数据...</span>}
          <button className="btn" onClick={autoSync} disabled={autoSyncing}>
            {autoSyncing ? '同步中...' : '一键同步'}
          </button>
          <button className="btn btn-primary" onClick={handleCheckCommit} disabled={checkingCommit}>
            {checkingCommit ? '检查中...' : '一键提交'}
          </button>
        </div>
      </div>

      {showCommit && (
        <div className="commit-panel">
          <h3>提交结果</h3>
          {checkingCommit ? (
            <p>正在检查提交状态...</p>
          ) : commitResults && commitResults.length > 0 ? (
            <div className="commit-results">
              {commitResults.map((r: any, i: number) => (
                <div key={i} className={`commit-result ${r.success ? 'success' : 'error'}`}>
                  <span className="result-repo">{r.repo}</span>
                  <span className="result-msg" style={{ whiteSpace: 'pre-wrap' }}>{r.message}</span>
                  {r.step && <span className="result-step">[{r.step}]</span>}
                </div>
              ))}
            </div>
          ) : (
            <p>暂无需要提交的变更</p>
          )}
        </div>
      )}

      <div className="resource-grid">
        {filteredResources.map((r: any) => (
          <div key={r.id} className="resource-card">
            <div className="card-header">
              <span className="card-name">{r.name}</span>
              <span className="card-score">{r.score}</span>
            </div>
            <div className="card-meta">
              <span className="tag">{r.type}</span>
              <span className="tag">{r.category}</span>
              <span className="tag">{r.repo}</span>
            </div>
            <p className="card-summary">{r.summary}</p>
          </div>
        ))}
        {filteredResources.length === 0 && !state.loading && (
          <div className="empty-state">
            <p>暂无资源数据</p>
            <p className="hint">请先同步仓库或添加采集源开始采集</p>
          </div>
        )}
      </div>
    </div>
  )
}
