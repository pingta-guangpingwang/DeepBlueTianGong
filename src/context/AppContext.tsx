import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'

interface AppState {
  resources: any[]
  loading: boolean
  pendingItems: any[]
  pendingCount: number
  collectorRunning: boolean
  collectorStatus: any
  repos: any[]
  sources: any[]
}

const initialState: AppState = {
  resources: [],
  loading: false,
  pendingItems: [],
  pendingCount: 0,
  collectorRunning: false,
  collectorStatus: null,
  repos: [],
  sources: [],
}

type AppAction =
  | { type: 'SET_RESOURCES'; payload: any[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PENDING'; payload: any[] }
  | { type: 'SET_PENDING_COUNT'; payload: number }
  | { type: 'SET_COLLECTOR_RUNNING'; payload: boolean }
  | { type: 'SET_COLLECTOR_STATUS'; payload: any }
  | { type: 'SET_REPOS'; payload: any[] }
  | { type: 'SET_SOURCES'; payload: any[] }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_RESOURCES': return { ...state, resources: action.payload }
    case 'SET_LOADING': return { ...state, loading: action.payload }
    case 'SET_PENDING': return { ...state, pendingItems: action.payload }
    case 'SET_PENDING_COUNT': return { ...state, pendingCount: action.payload }
    case 'SET_COLLECTOR_RUNNING': return { ...state, collectorRunning: action.payload }
    case 'SET_COLLECTOR_STATUS': return { ...state, collectorStatus: action.payload }
    case 'SET_REPOS': return { ...state, repos: action.payload }
    case 'SET_SOURCES': return { ...state, sources: action.payload }
    default: return state
  }
}

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue>({ state: initialState, dispatch: () => {} })

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const api = window.electronAPI
      if (!api) return

      const [resources, pending, repos, sources] = await Promise.all([
        api.resourceList().catch(() => []),
        api.pendingList().catch(() => []),
        api.repoList().catch(() => []),
        api.sourceList().catch(() => []),
      ])

      dispatch({ type: 'SET_RESOURCES', payload: resources })
      dispatch({ type: 'SET_PENDING', payload: pending })
      dispatch({ type: 'SET_PENDING_COUNT', payload: pending.filter((i: any) => i.status === 'pending').length })
      dispatch({ type: 'SET_REPOS', payload: repos })
      dispatch({ type: 'SET_SOURCES', payload: sources })
    } catch (e) {
      console.error('[AppContext] 加载初始数据失败:', e)
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  return useContext(AppContext)
}
