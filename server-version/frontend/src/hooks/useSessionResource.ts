import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
export const resourceError = (
  value: unknown,
  fallback = '加载失败，请重试',
) => {
  const message = (value as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : fallback
}
/** Identity and exact resource key fence every response, including focus refresh. */
export function useSessionResource<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
) {
  const { user } = useAuth(),
    owner = `${user?.id ?? ''}:${key}`
  const [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      owner: string
      data: T | null
      error: string | null
      loading: boolean
    }>({ owner: '', data: null, error: null, loading: true })
  const latest = useRef(owner)
  latest.current = owner
  const reload = useCallback(() => setRevision((n) => n + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    if (!user) return () => controller.abort()
    setState({ owner, data: null, error: null, loading: true })
    void loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && latest.current === owner)
          setState({ owner, data, error: null, loading: false })
      })
      .catch((error) => {
        if (!controller.signal.aborted && latest.current === owner)
          setState({
            owner,
            data: null,
            error: resourceError(error),
            loading: false,
          })
      })
    return () => controller.abort()
  }, [owner, user, loader, revision])
  useEffect(() => {
    const refresh = () => reload()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [reload])
  const current =
    state.owner === owner ? state : { data: null, error: null, loading: true }
  return { ...current, reload }
}
