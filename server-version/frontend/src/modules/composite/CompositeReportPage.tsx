import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { compositeApi, publicCompositeApi } from './api'
import type { CompositeReport } from './types'

const readRecovery = (attemptId: string) => typeof window === 'undefined' ? '' : window.sessionStorage.getItem(`composite:recovery:attempt:${attemptId}`) || ''

const CompositeReportPage: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const publicMode = window.location.pathname.startsWith('/public/composite')
  const [recoveryToken, setRecoveryToken] = useState(publicMode && attemptId ? readRecovery(attemptId) : '')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [report, setReport] = useState<CompositeReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const api = useMemo(() => publicMode ? publicCompositeApi(recoveryToken) : compositeApi, [publicMode, recoveryToken])

  const load = async (credential = recoveryToken) => {
    if (!attemptId) return
    if (publicMode && !credential) {
      setLoading(false)
      setError('请输入恢复凭证查看匿名报告')
      return
    }
    try {
      const response = await (publicMode ? publicCompositeApi(credential).report(attemptId) : compositeApi.report(attemptId))
      if (response.code !== 0 || !response.data) throw new Error(response.message || '报告不存在')
      setReport(response.data)
    } catch (err) {
      setError((err as { message?: string }).message || '加载报告失败')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [attemptId, publicMode])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载报告中...</div>
  if (!report) return <div className="max-w-xl mx-auto card p-8 text-center"><p className="text-red-500 mb-4">{error || '暂无报告'}</p>{publicMode && <><input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} className="w-full border rounded px-3 py-2 mb-3" placeholder="恢复凭证" /><button onClick={() => { setRecoveryToken(recoveryInput); setLoading(true); void load(recoveryInput) }} className="btn-primary">查看匿名报告</button></>}<button onClick={() => navigate(publicMode ? '/' : '/student')} className="btn-secondary mt-4 block mx-auto">返回</button></div>

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(publicMode ? '/' : '/student')} className="flex items-center text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4 mr-1" />返回</button>
      <div className="card p-8 mb-5"><CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" /><h1 className="text-2xl font-bold text-center text-gray-800">{report.name}</h1><p className="text-center text-gray-500 mt-2">本报告分别展示各量表和认知任务结果，不做跨模块综合计算。</p>{report.anonymousCode && <p className="text-center text-sm text-gray-500 mt-2">匿名编号：{report.anonymousCode}</p>}</div>
      <div className="space-y-4">{report.modules.map((module) => <div key={module.itemId} className="card p-6"><h2 className="text-lg font-semibold text-gray-800 mb-4">{module.label || module.type}</h2>{module.type === 'FORM' && <p className="text-gray-700 whitespace-pre-wrap">{String(module.value || '—')}</p>}{module.type === 'SCALE' && <><p className="text-sm font-semibold text-gray-600 mb-2">维度结果</p><pre className="text-sm bg-gray-50 rounded p-3 overflow-auto">{JSON.stringify(module.feedback || module.scores || {}, null, 2)}</pre></>}{module.type === 'COGNITIVE' && <><div className="text-4xl font-bold text-primary mb-4">{String(module.score ?? '—')}<span className="text-sm text-gray-500 ml-2">分</span></div><p className="text-sm font-semibold text-gray-600 mb-2">任务指标</p><pre className="text-sm bg-gray-50 rounded p-3 overflow-auto">{JSON.stringify({ metrics: module.metrics, qualityFlags: module.qualityFlags }, null, 2)}</pre></>}</div>)}</div>
    </div>
  )
}

export default CompositeReportPage
