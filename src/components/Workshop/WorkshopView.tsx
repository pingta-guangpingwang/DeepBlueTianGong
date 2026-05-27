import { useState, useCallback, useMemo, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'

// 本地 code → label 索引
type CodeMap = Map<string, string>
type FacetDef = { prefix: string; label: string; multi: boolean; values: Array<{ code: string; label: string }> }
type FacetDict = Record<string, FacetDef>

interface ResolvedFacet {
  label: string
  values: Array<{ code: string; label: string }>
}

function buildCodeMap(facets: FacetDict): CodeMap {
  const map = new Map<string, string>()
  for (const f of Object.values(facets)) {
    for (const v of f.values) {
      map.set(v.code, v.label)
    }
  }
  return map
}

function resolveFacetsLocal(facetsData: any, codeMap: CodeMap, facets: FacetDict): Record<string, ResolvedFacet> {
  if (!facetsData) return {}
  const result: Record<string, ResolvedFacet> = {}
  for (const [name, def] of Object.entries(facets)) {
    const codes = (facetsData as any)[name]
    if (!codes) continue
    const arr = Array.isArray(codes) ? codes : [codes]
    if (arr.length === 0) continue
    // 跳过 "通用/不限"
    if (arr.length === 1 && arr[0]?.endsWith('000')) continue
    const values = arr
      .filter((c: string) => !c.endsWith('000'))
      .map((c: string) => ({ code: c, label: codeMap.get(c) || c }))
    if (values.length > 0) {
      result[name] = { label: def.label, values }
    }
  }
  return result
}

export default function WorkshopView() {
  const { state, refreshData } = useAppContext()
  const api = window.electronAPI!

  const visibleRepos = useMemo(() => state.repos.filter((r: any) => r.visible), [state.repos])

  const [activeRepo, setActiveRepo] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [facetFilters, setFacetFilters] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [checkingCommit, setCheckingCommit] = useState(false)
  const [showCommit, setShowCommit] = useState(false)
  const [commitResults, setCommitResults] = useState<any[] | null>(null)
  const [cloning, setCloning] = useState<Record<string, boolean>>({})
  const [detailItem, setDetailItem] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 分类体系
  const [facetDict, setFacetDict] = useState<FacetDict>({})
  const codeMap = useMemo(() => buildCodeMap(facetDict), [facetDict])

  useEffect(() => {
    api.taxonomyFacets().then((f: any) => setFacetDict(f || {}))
  }, [api])

  // 默认选中第一个可见仓库
  const currentRepo = useMemo(() => {
    const name = activeRepo || (visibleRepos[0]?.name || '')
    return visibleRepos.find(r => r.name === name) || null
  }, [activeRepo, visibleRepos])

  const taxonomy = useMemo(() => {
    if (!currentRepo?.taxonomy) return { types: [], categories: [] }
    return {
      types: currentRepo.taxonomy.types || [],
      categories: currentRepo.taxonomy.categories || [],
    }
  }, [currentRepo])

  const repoResources = useMemo(() => {
    if (!currentRepo) return []
    return state.resources.filter((r: any) => r.repo === currentRepo.name)
  }, [state.resources, currentRepo])

  // 核心筛选维度（从 taxonomy 提取）
  const filterableFacets = useMemo(() => {
    const names = Object.keys(facetDict)
    // 优先展示 role, task, format, level 作为快速筛选
    const priority = ['role', 'task', 'format', 'level']
    return [...priority.filter(p => names.includes(p)), ...names.filter(n => !priority.includes(n))]
  }, [facetDict])

  const filteredResources = useMemo(() => {
    return repoResources.filter((r: any) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false
      // 分面筛选
      for (const [facet, code] of Object.entries(facetFilters)) {
        if (!code) continue
        const rv = r.facets?.[facet]
        if (!rv) return false
        const arr = Array.isArray(rv) ? rv : [rv]
        if (!arr.includes(code)) return false
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          r.name.toLowerCase().includes(q) ||
          r.summary?.toLowerCase().includes(q) ||
          r.tech_stack?.some((t: string) => t.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [repoResources, typeFilter, categoryFilter, facetFilters, searchQuery])

  // 统计每个 facet 值的资源数
  const facetCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {}
    for (const name of filterableFacets) {
      counts[name] = {}
      const def = facetDict[name]
      if (!def) continue
      for (const r of filteredResources) {
        const rv = r.facets?.[name]
        if (!rv) continue
        const arr = Array.isArray(rv) ? rv : [rv]
        for (const c of arr) {
          counts[name][c] = (counts[name][c] || 0) + 1
        }
      }
    }
    return counts
  }, [filteredResources, filterableFacets, facetDict])

  // type/category 计数
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: repoResources.length }
    for (const r of repoResources) c[r.type] = (c[r.type] || 0) + 1
    return c
  }, [repoResources])

  const catCounts = useMemo(() => {
    const base = typeFilter === 'all' ? repoResources : repoResources.filter((r: any) => r.type === typeFilter)
    const c: Record<string, number> = { all: base.length }
    for (const r of base) c[r.category] = (c[r.category] || 0) + 1
    return c
  }, [repoResources, typeFilter])

  const autoSync = useCallback(async () => {
    setAutoSyncing(true)
    try {
      const result = await api.resourceAutoSync()
      if (result.synced.length > 0) await refreshData()
    } catch (e) {
      console.error('[Workshop] 同步失败:', e)
    } finally {
      setAutoSyncing(false)
    }
  }, [api, refreshData])

  const handleClone = async (repoName: string, remoteUrl: string) => {
    setCloning(c => ({ ...c, [repoName]: true }))
    try {
      await api.resourceClone(repoName, remoteUrl || undefined)
      await refreshData()
    } catch (e: any) {
      console.error('[Workshop] clone failed:', e)
    } finally {
      setCloning(c => ({ ...c, [repoName]: false }))
    }
  }

  const handleCheckCommit = async () => {
    setCheckingCommit(true)
    setShowCommit(true)
    try {
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

  const handleDetail = async (item: any) => {
    setDetailLoading(true)
    try {
      const full = await api.resourceDetail(item.id)
      setDetailItem(full || item)
    } catch {
      setDetailItem(item)
    } finally {
      setDetailLoading(false)
    }
  }

  // 卡片渲染
  const renderCard = (r: any) => {
    const resolved = resolveFacetsLocal(r.facets, codeMap, facetDict)
    // 不展示 type/category 如果有 facets 的话
    const showTypeCat = Object.keys(resolved).length === 0

    return (
      <div key={r.id} className="resource-card" onDoubleClick={() => handleDetail(r)}>
        <div className="card-header">
          <span className="card-name" title={r.name}>{r.name}</span>
          <span className="card-score" title="评分">{r.score}</span>
        </div>
        <div className="card-meta">
          {showTypeCat && (
            <>
              <span className="tag tag-type">{taxonomy.types.find((t: any) => t.id === r.type)?.label || r.type}</span>
              <span className="tag tag-cat">{r.category}</span>
            </>
          )}
          {Object.values(resolved).map(f => (
            <span key={f.label} className="tag tag-facet" title={f.values.map(v => v.label).join(', ')}>
              {f.values[0]?.label}
              {f.values.length > 1 && <span className="tag-more"> +{f.values.length - 1}</span>}
            </span>
          ))}
          {r.rating_count > 0 && <span className="tag tag-rating">{r.rating_count} 评价</span>}
        </div>
        <p className="card-summary">{r.summary}</p>
        {r.tech_stack?.length > 0 && (
          <div className="card-techs">
            {r.tech_stack.slice(0, 4).map((t: string, i: number) => (
              <span key={i} className="tag tag-tech">{t}</span>
            ))}
            {r.tech_stack.length > 4 && <span className="tag tag-more">+{r.tech_stack.length - 4}</span>}
          </div>
        )}
        {r.source_url && (
          <div className="card-source" title={r.source_url}>
            {r.source_url.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 40)}
            {r.source_url.length > 40 ? '...' : ''}
          </div>
        )}
      </div>
    )
  }

  // 分面筛选 UI
  const renderFacetFilters = () => {
    if (filterableFacets.length === 0) return null
    return filterableFacets.map(name => {
      const def = facetDict[name]
      if (!def) return null
      const counts = facetCounts[name] || {}
      return (
        <div key={name} className="filter-row">
          <span className="filter-label">{def.label}</span>
          <button
            className={`filter-pill ${!facetFilters[name] ? 'active' : ''}`}
            onClick={() => setFacetFilters(prev => { const n = { ...prev }; delete n[name]; return n })}
          >
            全部
          </button>
          {def.values.filter(v => !v.code.endsWith('000')).slice(0, 8).map(v => (
            <button
              key={v.code}
              className={`filter-pill ${facetFilters[name] === v.code ? 'active' : ''}`}
              onClick={() => setFacetFilters(prev => ({ ...prev, [name]: v.code }))}
              title={v.label}
            >
              {v.label}{counts[v.code] ? <span className="pill-count">{counts[v.code]}</span> : ''}
            </button>
          ))}
        </div>
      )
    })
  }

  if (visibleRepos.length === 0) {
    return (
      <div className="workshop-view">
        <div className="empty-state">
          <p>暂无可用仓库</p>
          <p className="hint">请先在「配置」标签页添加仓库并点击「获取」克隆数据</p>
        </div>
      </div>
    )
  }

  return (
    <div className="workshop-view">
      {/* Repo tabs */}
      <div className="repo-tabs">
        {visibleRepos.map((r: any) => (
          <button
            key={r.name}
            className={`repo-tab ${r.name === currentRepo?.name ? 'active' : ''}`}
            onClick={() => { setActiveRepo(r.name); setTypeFilter('all'); setCategoryFilter('all'); setFacetFilters({}) }}
          >
            <span className="repo-tab-label">{r.label}</span>
            <span className="repo-tab-count">{state.resources.filter((x: any) => x.repo === r.name).length}</span>
          </button>
        ))}
        <div className="repo-tab-actions">
          {visibleRepos.map((r: any) => (
            !state.resources.some((x: any) => x.repo === r.name) && (
              <button
                key={`clone-${r.name}`}
                className={`btn btn-xs btn-clone ${cloning[r.name] ? 'btn-disabled' : ''}`}
                disabled={cloning[r.name]}
                onClick={() => handleClone(r.name, r.remote)}
                title={r.remote}
              >
                {cloning[r.name] ? '...' : `获取 ${r.label}`}
              </button>
            )
          ))}
          <button className="btn btn-xs" onClick={autoSync} disabled={autoSyncing}>
            {autoSyncing ? '同步中...' : '同步'}
          </button>
          <button className="btn btn-xs btn-primary" onClick={handleCheckCommit} disabled={checkingCommit}>
            {checkingCommit ? '...' : '提交'}
          </button>
        </div>
      </div>

      {/* Repo info bar */}
      {currentRepo && (
        <div className="repo-info-bar">
          <span className="repo-info-name">{currentRepo.label}</span>
          {currentRepo.remote && (
            <span className="repo-info-remote" title={currentRepo.remote}>
              {currentRepo.remote.replace('https://github.com/', '')}
            </span>
          )}
          <span className="repo-info-count">共 {repoResources.length} 项</span>
        </div>
      )}

      {/* Filter bar: type/category pills + facet pills */}
      <div className="filter-bar">
        <div className="filter-row">
          <span className="filter-label">类型</span>
          {taxonomy.types.map((t: any) => (
            <button
              key={t.id}
              className={`filter-pill ${typeFilter === t.id ? 'active' : ''}`}
              onClick={() => { setTypeFilter(t.id); setCategoryFilter('all') }}
            >
              {t.label} <span className="pill-count">{typeCounts[t.id] || 0}</span>
            </button>
          ))}
          <button className={`filter-pill ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => { setTypeFilter('all'); setCategoryFilter('all') }}>
            全部 <span className="pill-count">{typeCounts.all || 0}</span>
          </button>
        </div>
        {taxonomy.categories.length > 0 && (
          <div className="filter-row">
            <span className="filter-label">分类</span>
            {taxonomy.categories.map((c: string) => (
              <button key={c} className={`filter-pill ${categoryFilter === c ? 'active' : ''}`} onClick={() => setCategoryFilter(c)}>
                {c} <span className="pill-count">{catCounts[c] || 0}</span>
              </button>
            ))}
            <button className={`filter-pill ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
              全部 <span className="pill-count">{catCounts.all || 0}</span>
            </button>
          </div>
        )}
        {renderFacetFilters()}
        <div className="filter-row">
          <input
            type="text"
            placeholder="搜索名称、摘要、技术栈..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
            style={{ width: 280 }}
          />
          {searchQuery && <span className="search-result-hint">找到 {filteredResources.length} 项</span>}
        </div>
      </div>

      {/* Commit results */}
      {showCommit && (
        <div className="commit-panel">
          <h3>提交结果</h3>
          {checkingCommit ? <p>正在检查提交状态...</p> : commitResults && commitResults.length > 0 ? (
            <div className="commit-results">
              {commitResults.map((r: any, i: number) => (
                <div key={i} className={`commit-result ${r.success ? 'success' : 'error'}`}>
                  <span className="result-repo">{r.repo}</span>
                  <span className="result-msg" style={{ whiteSpace: 'pre-wrap' }}>{r.message}</span>
                  {r.step && <span className="result-step">[{r.step}]</span>}
                </div>
              ))}
            </div>
          ) : <p>暂无需要提交的变更</p>}
        </div>
      )}

      {/* Resource grid */}
      <div className="resource-grid">
        {filteredResources.map(renderCard)}
        {filteredResources.length === 0 && !state.loading && (
          <div className="empty-state">
            <p>{searchQuery ? '无匹配结果' : '暂无资源数据'}</p>
            <p className="hint">{repoResources.length === 0 ? '点击上方「获取」按钮克隆仓库数据' : '尝试调整筛选条件'}</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailItem && (
        <div className="modal-overlay" onClick={() => setDetailItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{detailItem.name}</h2>
              <button className="icon-btn modal-close" onClick={() => setDetailItem(null)}>&times;</button>
            </div>
            {detailLoading ? (
              <div className="modal-loading"><span className="spinner" /> 加载详情...</div>
            ) : (
              <div className="modal-body">
                <div className="detail-grid">
                  <div className="detail-field"><span className="detail-label">ID</span><code>{detailItem.id}</code></div>
                  <div className="detail-field"><span className="detail-label">类型</span><span>{taxonomy.types.find((t: any) => t.id === detailItem.type)?.label || detailItem.type}</span></div>
                  <div className="detail-field"><span className="detail-label">分类</span><span>{detailItem.category}</span></div>
                  {detailItem.subcategory && <div className="detail-field"><span className="detail-label">子分类</span><span>{detailItem.subcategory}</span></div>}
                  <div className="detail-field"><span className="detail-label">评分</span><span className="detail-score">{detailItem.score}</span></div>
                  <div className="detail-field"><span className="detail-label">评价数</span><span>{detailItem.rating_count || 0}</span></div>
                  <div className="detail-field"><span className="detail-label">使用次数</span><span>{detailItem.usage_count || 0}</span></div>
                  <div className="detail-field"><span className="detail-label">仓库</span><span>{detailItem.repo}</span></div>
                  <div className="detail-field"><span className="detail-label">文件</span><code>{detailItem.file}</code></div>
                </div>

                {/* Facets section in detail */}
                {(() => {
                  const resolved = resolveFacetsLocal(detailItem.facets, codeMap, facetDict)
                  if (Object.keys(resolved).length === 0) return null
                  return (
                    <div className="detail-section">
                      <span className="detail-label">多维分类</span>
                      <div className="detail-facets">
                        {Object.entries(resolved).map(([name, f]) => (
                          <div key={name} className="detail-facet-row">
                            <span className="detail-facet-label">{f.label}</span>
                            <div className="detail-tags">
                              {f.values.map(v => <span key={v.code} className="tag tag-facet">{v.label}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {detailItem.source_url && (
                  <div className="detail-section">
                    <span className="detail-label">来源</span>
                    <a className="detail-link" href={detailItem.source_url} target="_blank" rel="noopener">{detailItem.source_url}</a>
                  </div>
                )}

                {(detailItem.tech_stack?.length > 0) && (
                  <div className="detail-section">
                    <span className="detail-label">技术栈</span>
                    <div className="detail-tags">{detailItem.tech_stack.map((t: string, i: number) => <span key={i} className="tag tag-tech">{t}</span>)}</div>
                  </div>
                )}
                {(detailItem.style_tags?.length > 0) && (
                  <div className="detail-section">
                    <span className="detail-label">风格标签</span>
                    <div className="detail-tags">{detailItem.style_tags.map((t: string, i: number) => <span key={i} className="tag tag-style">{t}</span>)}</div>
                  </div>
                )}
                {(detailItem.use_cases?.length > 0) && (
                  <div className="detail-section">
                    <span className="detail-label">适用场景</span>
                    <div className="detail-tags">{detailItem.use_cases.map((u: string, i: number) => <span key={i} className="tag tag-usecase">{u}</span>)}</div>
                  </div>
                )}

                <div className="detail-section">
                  <span className="detail-label">摘要</span>
                  <p className="detail-summary">{detailItem.summary}</p>
                </div>
                {detailItem.body && (
                  <div className="detail-section">
                    <span className="detail-label">正文</span>
                    <pre className="detail-body">{detailItem.body}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
