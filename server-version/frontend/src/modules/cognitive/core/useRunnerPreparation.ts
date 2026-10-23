import { useEffect, useState } from 'react'
import type { CognitiveFrontendRegistryEntry } from '../registry'

export function useRunnerPreparation(entry: CognitiveFrontendRegistryEntry | undefined) {
  const [result, setResult] = useState<{ entry?: CognitiveFrontendRegistryEntry; error?: string }>({})
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    setResult({})
    if (entry) void Promise.resolve().then(() => entry.prepareRunner?.()).then(() => {
      if (current) setResult({ entry })
    }).catch(() => {
      if (current) setResult({ entry, error: '本次测验程序加载失败，请重试。' })
    })
    return () => { current = false }
  }, [entry, revision])
  return {
    ready: Boolean(entry && (!entry.prepareRunner || (result.entry === entry && !result.error))),
    error: result.entry === entry ? result.error : undefined,
    retry: () => setRevision(value => value + 1),
  }
}
