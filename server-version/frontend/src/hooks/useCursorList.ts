import { useCallback, useEffect, useRef, useState } from 'react'
import apiClient from '../api/client'

type Page<T> = { list: T[]; nextCursor?: string | null; total?: number }
/** Retain loaded rows on failure and ignore responses from a closed/changed list. */
export function useCursorList<T extends { id: string }>(path: string | null) {
  const [list, setList] = useState<T[]>([]), [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState<string | null>(null), [cursor, setCursor] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const sequence = useRef(0), active = useRef(false)
  const load = useCallback(async (after: string | null = null) => {
    if (!path || active.current) return
    const request = ++sequence.current
    active.current = true; setLoading(true); setError(null)
    try {
      const response = await apiClient.get<Page<T>>(path + (after ? `?cursor=${encodeURIComponent(after)}` : ''))
      if (request !== sequence.current) return
      if (response.code !== 0) throw new Error(response.message || '无法读取列表')
      setList(previous => {
        const rows = after ? [...previous, ...response.data.list] : response.data.list
        return [...new Map(rows.map(row => [row.id, row])).values()]
      })
      setCursor(response.data.nextCursor || null)
      if (typeof response.data.total === 'number') setTotal(response.data.total)
    } catch (reason) {
      if (request === sequence.current) setError(reason instanceof Error ? reason.message : '无法读取列表')
    } finally {
      if (request === sequence.current) { active.current = false; setLoading(false) }
    }
  }, [path])
  useEffect(() => {
    sequence.current++; active.current = false
    setList([]); setCursor(null); setTotal(null); setError(null); setLoading(Boolean(path))
    void load()
    return () => { sequence.current++; active.current = false }
  }, [load, path])
  return { list, loading, error, total, hasMore: Boolean(cursor), refresh: () => { sequence.current++; active.current = false; return load() }, more: () => cursor ? load(cursor) : Promise.resolve() }
}
