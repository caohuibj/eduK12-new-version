import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { relationalApi } from '../api/relational'
import { useAuth } from './AuthContext'

type Availability = 'loading' | 'available' | 'empty' | 'error'
type State = { key: string; status: Availability }
const Context = createContext<{ status: Availability; retry: () => void }>({ status: 'loading', retry: () => {} })

/** Discovery only: direct routes and historical report access remain independent. */
export function RelationalAvailabilityProvider({ children, suspended = false }: { children: ReactNode; suspended?: boolean }) {
  const { user } = useAuth()
  const key = !suspended && user && !user.mustChangePassword && ['STUDENT', 'PARENT', 'TEACHER'].includes(user.role) ? `${user.id}:${user.role}` : ''
  const [state, setState] = useState<State>({ key: '', status: 'empty' })
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    if (!key) return
    let cancelled = false
    setState({ key, status: 'loading' })
    void Promise.all([relationalApi.catalog(), relationalApi.tasks()]).then(([catalog, tasks]) => {
      if (!cancelled) setState({ key, status: catalog.length || tasks.length ? 'available' : 'empty' })
    }).catch(() => {
      if (!cancelled) setState({ key, status: 'error' })
    })
    return () => { cancelled = true }
  }, [key, revision])
  const status = !key ? 'empty' : state.key === key ? state.status : 'loading'
  return <Context.Provider value={{ status, retry }}>{children}</Context.Provider>
}
export const useRelationalAvailability = () => useContext(Context)
