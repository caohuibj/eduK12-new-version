import { useEffect, useRef } from 'react'

export const installCheckpointLifecycle = (flush: () => Promise<void>) => {
  if (typeof window === 'undefined') return () => undefined
  const run = () => { void flush().catch(() => undefined) }
  const onVisibilityChange = () => { if (document.visibilityState === 'hidden') run() }
  const onOnline = () => run()
  const onPageHide = () => run()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('online', onOnline)
  window.addEventListener('pagehide', onPageHide)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('pagehide', onPageHide)
  }
}

export const useCheckpointLifecycle = (flush: () => Promise<void>, enabled = true) => {
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    if (!enabled) return undefined
    return installCheckpointLifecycle(() => flushRef.current())
  }, [enabled])
}

