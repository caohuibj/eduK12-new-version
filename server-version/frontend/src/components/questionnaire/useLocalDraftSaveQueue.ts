import { useCallback, useEffect, useRef, useState } from 'react'

export type LocalDraftSaveStatus =
  | { state: 'idle' }
  | { state: 'saving'; message: string }
  | { state: 'saved'; message: string }
  | { state: 'error'; message: string }

export function useLocalDraftSaveQueue(scopeKey: string | null) {
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const errorsRef = useRef(new Map<string, string>())
  const pendingRef = useRef(0)
  const generationRef = useRef(0)
  const [status, setStatus] = useState<LocalDraftSaveStatus>({ state: 'idle' })

  useEffect(() => {
    generationRef.current += 1
    chainRef.current = Promise.resolve()
    errorsRef.current.clear()
    pendingRef.current = 0
    setStatus({ state: 'idle' })
  }, [scopeKey])

  const schedule = useCallback((itemKey: string, operation: () => Promise<void>) => {
    const generation = generationRef.current
    pendingRef.current += 1
    setStatus({ state: 'saving', message: '正在保存到本机…' })

    let resolveResult: (value: boolean) => void = () => undefined
    const result = new Promise<boolean>((resolve) => { resolveResult = resolve })

    chainRef.current = chainRef.current.then(async () => {
      let succeeded = false
      try {
        await operation()
        succeeded = true
        if (generationRef.current === generation) errorsRef.current.delete(itemKey)
      } catch (cause) {
        if (generationRef.current === generation) {
          const message = cause instanceof Error ? cause.message : '本机保存失败'
          errorsRef.current.set(itemKey, message)
        }
      } finally {
        if (generationRef.current === generation) {
          pendingRef.current = Math.max(0, pendingRef.current - 1)
          if (pendingRef.current > 0) {
            setStatus({ state: 'saving', message: '正在保存到本机…' })
          } else if (errorsRef.current.size > 0) {
            setStatus({ state: 'error', message: errorsRef.current.values().next().value || '本机保存失败' })
          } else {
            setStatus({ state: 'saved', message: '已保存到本机。' })
          }
        }
        resolveResult(succeeded)
      }
    })

    return result
  }, [])

  const flush = useCallback(async () => {
    const generation = generationRef.current
    await chainRef.current
    if (generationRef.current !== generation) return
    const firstError = errorsRef.current.values().next().value
    if (firstError) throw new Error(firstError)
  }, [])

  return { schedule, flush, status }
}

export default useLocalDraftSaveQueue
