import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import CollectorDashboard from './components/Collector/CollectorDashboard'
import WorkshopView from './components/Workshop/WorkshopView'
import PendingPanel from './components/Pending/PendingPanel'
import ConfigPanel from './components/Config/ConfigPanel'

type TabId = 'collector' | 'workshop' | 'pending' | 'config'

const TABS: Array<{ id: TabId; label: string; labelEn: string }> = [
  { id: 'collector', label: '采集', labelEn: 'Collect' },
  { id: 'workshop', label: '工坊', labelEn: 'Workshop' },
  { id: 'pending', label: '待审', labelEn: 'Review' },
  { id: 'config', label: '配置', labelEn: 'Config' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('workshop')

  return (
    <AppProvider>
      <div className="app-root">
        <header className="app-header">
          <h1 className="app-title">深蓝天工 · 知识采集引擎</h1>
          <nav className="app-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => window.electronAPI?.windowMinimize()} title="最小化">─</button>
            <button className="icon-btn" onClick={() => window.electronAPI?.windowMaximize()} title="最大化">□</button>
            <button className="icon-btn" onClick={() => window.electronAPI?.windowClose()} title="关闭">×</button>
          </div>
        </header>
        <main className="app-main">
          {activeTab === 'collector' && <CollectorDashboard />}
          {activeTab === 'workshop' && <WorkshopView />}
          {activeTab === 'pending' && <PendingPanel />}
          {activeTab === 'config' && <ConfigPanel />}
        </main>
      </div>
    </AppProvider>
  )
}
