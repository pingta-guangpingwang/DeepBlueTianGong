import { useState } from 'react'
import { useAppContext } from '../../context/AppContext'

export default function PendingPanel() {
  const { state, dispatch } = useAppContext()
  const [auditing, setAuditing] = useState(false)

  const pendingItems = state.pendingItems.filter((i: any) => i.status === 'pending' || i.status === 'audited')

  const handleAuditAll = async () => {
    setAuditing(true)
    try {
      const api = window.electronAPI
      if (!api) return
      await api.pendingAuditAll()
      const items = await api.pendingList()
      dispatch({ type: 'SET_PENDING', payload: items })
      dispatch({ type: 'SET_PENDING_COUNT', payload: items.filter((i: any) => i.status === 'pending').length })
    } catch (e) {
      console.error('[Pending] 审核失败:', e)
    } finally {
      setAuditing(false)
    }
  }

  const handleApprove = async (id: string) => {
    const api = window.electronAPI
    if (!api) return
    const result = await api.pendingApprove(id)
    if (result.success) {
      const items = await api.pendingList()
      dispatch({ type: 'SET_PENDING', payload: items })
    }
  }

  const handleApproveAll = async () => {
    const api = window.electronAPI
    if (!api) return
    await api.pendingApproveAll()
    const items = await api.pendingList()
    dispatch({ type: 'SET_PENDING', payload: items })
  }

  const handleRemove = async (id: string) => {
    const api = window.electronAPI
    if (!api) return
    await api.pendingRemove(id)
    const items = await api.pendingList()
    dispatch({ type: 'SET_PENDING', payload: items })
  }

  return (
    <div className="pending-panel">
      <div className="toolbar">
        <h2>
          待审核资源
          {pendingItems.length > 0 && <span className="count-badge">{pendingItems.length}</span>}
        </h2>
        <div className="toolbar-actions">
          <button className="btn" onClick={handleAuditAll} disabled={auditing}>
            {auditing ? '审核中...' : '一键审核全部'}
          </button>
          <button className="btn btn-primary" onClick={handleApproveAll}>
            一键入库全部
          </button>
        </div>
      </div>

      {pendingItems.length === 0 ? (
        <div className="empty-state">
          <p>暂无待审核资源</p>
          <p className="hint">采集完成或手动添加的资源将出现在这里</p>
        </div>
      ) : (
        <div className="pending-list">
          {pendingItems.map((item: any) => (
            <div key={item.id} className={`pending-card status-${item.status}`}>
              <div className="pending-header">
                <span className="pending-name">{item.name}</span>
                <span className={`status-badge ${item.status}`}>
                  {item.status === 'pending' ? '待审' : item.status === 'audited' ? `已审核 ${item.auditScore}/10` : item.status}
                </span>
              </div>
              <div className="pending-meta">
                <span className="tag">{item.resourceType}</span>
                <span className="tag">{item.category}</span>
                <span className="tag">{item.targetRepo}</span>
              </div>
              <p className="pending-summary">{item.summary}</p>
              <div className="pending-actions">
                {item.status === 'audited' && (
                  <button className="btn btn-sm btn-primary" onClick={() => handleApprove(item.id)}>
                    批准
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => handleRemove(item.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
