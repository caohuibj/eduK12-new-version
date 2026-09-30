import { useCallback, useEffect, useRef, useState } from 'react'

export function requestError(error: unknown, fallback: string): string {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : null
  return typeof message === 'string' && message.trim() ? message : fallback
}

/** Only the newest mounted request may publish data, errors or loading state. */
export function useLatestRequest(initialLoading = true) {
  const sequence = useRef(0)
  const mounted = useRef(true)
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState('')
  const invalidate = useCallback(() => { sequence.current += 1 }, [])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; invalidate() }
  }, [invalidate])
  const run = useCallback(async <T,>(load: () => Promise<T>, apply: (data: T) => void, fallback: string) => {
    if (!mounted.current) return
    const request = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const data = await load()
      if (request === sequence.current) apply(data)
    } catch (error) {
      if (request === sequence.current) setError(requestError(error, fallback))
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [])
  return { loading, error, run, invalidate }
}
