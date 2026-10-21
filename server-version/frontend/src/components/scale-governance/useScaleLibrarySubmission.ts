import { useCallback, useEffect, useRef, useState } from 'react'
import { governanceApi, type GovernanceMediaConsent, type GovernanceProduct, type GovernanceSource, type GovernanceSubmission, type SubmissionMetadata } from '../../api/scaleLibraryGovernance'

export function useScaleLibrarySubmission(product: GovernanceProduct, sourceId: string) {
  const [source, setSource] = useState<GovernanceSource | null>(null)
  const [submissions, setSubmissions] = useState<GovernanceSubmission[]>([])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const generation = useRef(0), locked = useRef(false)
  const pendingSubmission = useRef<{ key: string; requestId: string } | null>(null)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    setLoading(true); setError('')
    try {
      const api = governanceApi(product)
      const [nextSource, nextSubmissions] = await Promise.all([api.source(sourceId), api.submissions(sourceId)])
      if (current !== generation.current) return
      if (nextSource.sourceId !== sourceId || !Array.isArray(nextSource.releases) || !Array.isArray(nextSubmissions.list)) throw new Error('共用库状态与当前量表不一致，请重新读取。')
      setSource(nextSource); setSubmissions(nextSubmissions.list)
    } catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : '共用库状态加载失败') }
    finally { if (current === generation.current) setLoading(false) }
  }, [product, sourceId])
  useEffect(() => { setSource(null); setSubmissions([]); setStatus(''); void refresh(); return () => { generation.current++ } }, [refresh])
  const execute = async (work: () => Promise<unknown>, message: string) => {
    if (locked.current || loading || error) return false
    locked.current = true; setBusy(true); setError(''); setStatus('')
    const current = generation.current
    try {
      await work()
      if (current !== generation.current) return false
      setStatus(message)
      await refresh()
      return true
    } catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : '操作结果未确认，请刷新核对后再操作'); return false }
    finally { locked.current = false; setBusy(false) }
  }
  return { source, submissions, loading, busy, error, status, refresh,
    submit: (releaseId: string, metadata: SubmissionMetadata, mediaConsent?: GovernanceMediaConsent) => {
      const key = JSON.stringify([product, sourceId, releaseId, metadata, mediaConsent])
      if (pendingSubmission.current?.key !== key) pendingSubmission.current = { key, requestId: crypto.randomUUID() }
      const requestId = pendingSubmission.current.requestId
      return execute(async () => { const result = await governanceApi(product).submit(releaseId, metadata, requestId, mediaConsent); pendingSubmission.current = null; return result }, '申请已提交。批准入库不代表全员可用，也不代表标准科学量表。')
    },
    withdraw: (row: GovernanceSubmission, reason: string) => execute(() => governanceApi(product).withdraw(row, reason), '申请已撤回，历史记录保留。'),
  }
}
