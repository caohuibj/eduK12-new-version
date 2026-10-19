import { useCallback, useEffect, useRef, useState } from 'react'
import { sessionFetch } from '../../api/client'

export type AuthorCursorPage<T> = { items: T[]; nextCursor: string | null }
type State<T> = AuthorCursorPage<T> & { path: string | null; loading: boolean; error: string }
const empty = <T,>(path: string | null): State<T> => ({ path, items: [], nextCursor: null, loading: false, error: '' })

/** A scope change cancels pending pages; a failed page retains the already loaded rows and cursor. */
export function useAuthorCursorList<T>(path: string | null, keyOf: (item: T) => string, pageSize = 50, refreshKey?: string) {
  const [state, setState] = useState<State<T>>(() => empty<T>(path))
  const currentPath = useRef(path); currentPath.current = path
  const currentState = useRef(state); currentState.current = state
  const lastAttempt = useRef<{ path: string; cursor: string | null; replace: boolean } | null>(null)
  const request = useRef<AbortController | null>(null), sequence = useRef(0), inFlight = useRef(false)
  const loadPage = useCallback(async (cursor: string | null, replace: boolean) => {
    if (!path || (!replace && inFlight.current)) return
    request.current?.abort()
    lastAttempt.current = { path, cursor, replace }
    const controller = new AbortController(), ticket = ++sequence.current
    request.current = controller; inFlight.current = true
    setState(previous => ({ ...(previous.path === path ? previous : empty<T>(path)), loading: true, error: '' }))
    const current = () => currentPath.current === path && ticket === sequence.current && !controller.signal.aborted
    try {
      const query = new URLSearchParams({ pageSize: String(pageSize), ...(cursor ? { cursor } : {}) })
      const response = await sessionFetch(`/api/situational/authoring${path}?${query}`, { cache: 'no-store', signal: controller.signal })
      const result = await response.json()
      if (!response.ok || result.code !== 0 || !result.data || !Array.isArray(result.data.items)
        || !(result.data.nextCursor === null || typeof result.data.nextCursor === 'string')) throw new Error(result.message || '列表读取失败')
      const page = result.data as AuthorCursorPage<T>
      if (current()) setState(previous => {
        const rows = replace || previous.path !== path ? page.items : [...previous.items, ...page.items]
        return { path, items: [...new Map(rows.map(item => [keyOf(item), item])).values()], nextCursor: page.nextCursor, loading: false, error: '' }
      })
    } catch (reason) {
      if (current()) setState(previous => ({ ...previous, loading: false, error: reason instanceof Error ? reason.message : '列表读取失败' }))
    } finally { if (ticket === sequence.current) inFlight.current = false }
  }, [path, pageSize, keyOf])
  useEffect(() => {
    if (path) void loadPage(null, true)
    else setState(empty<T>(null))
    return () => { ++sequence.current; request.current?.abort(); inFlight.current = false }
  }, [path, loadPage, refreshKey])
  const reload = useCallback(() => loadPage(null, true), [loadPage])
  const loadMore = useCallback(() => {
    const value = currentState.current
    if (value.path === path && value.nextCursor) return loadPage(value.nextCursor, false)
    return Promise.resolve()
  }, [path, loadPage])
  const retry = useCallback(() => {
    const attempt = lastAttempt.current
    return attempt?.path === path ? loadPage(attempt.cursor, attempt.replace) : loadPage(null, true)
  }, [path, loadPage])
  const prepend = useCallback((item: T) => {
    if (!path || currentPath.current !== path) return
    setState(previous => previous.path === path
      ? { ...previous, items: [item, ...previous.items.filter(row => keyOf(row) !== keyOf(item))] }
      : previous)
  }, [path, keyOf])
  const visible = state.path === path ? state : empty<T>(path)
  return { ...visible, reload, loadMore, retry, prepend }
}
