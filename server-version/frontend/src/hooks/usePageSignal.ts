import { useCallback, useEffect, useRef } from 'react'
/** Capture this signal when starting an action; departure cancels its work. */
export function usePageSignal() {
  const controller = useRef(new AbortController())
  useEffect(() => {
    const lifetime = new AbortController()
    controller.current = lifetime
    return () => lifetime.abort()
  }, [])
  return useCallback(() => controller.current.signal, [])
}
