import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { compositeApi, publicCompositeApi } from './api'
import type { CompositeReport } from './types'
import CognitiveSingleTaskReportCard from '../cognitive/CognitiveSingleTaskReportCard'
import type { CognitiveSingleTaskReport } from '../cognitive/types'
import ScaleUnitReportCard from '../reporting/ScaleUnitReportCard'
import type { ScaleUnitReport } from '../reporting/types'

const readRecovery = (attemptId: string) => typeof window === 'undefined' ? '' : window.sessionStorage.getItem(`composite:recovery:attempt:${attemptId}`) || ''

const CompositeReportPage: React.FC = () => {
  const { id, attemptId } = useParams<{ id?: string; attemptId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const publicMode = location.pathname.startsWith('/public/composite')
  const teacherMode = location.pathname.startsWith('/composite-assessments/')
  const [recoveryToken, setRecoveryToken] = useState(publicMode && attemptId ? readRecovery(attemptId) : '')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [report, setReport] = useState<CompositeReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const backTo = teacherMode && id ? `/composite-assessments/${id}/results` : publicMode ? '/' : '/student'
  const unitReports = report?.unitReports || (report as (CompositeReport & { modules?: CompositeReport['unitReports'] }) | null)?.modules || []

  const load = async (credential = recoveryToken) => {
    if (!attemptId) return
    if (teacherMode && !id) {
      setLoading(false)
      setError('缺少综合测评编号，无法加载教师报告')
      return
    }
    if (publicMode && !credential) {
      setLoading(false)
      setError('请输入恢复凭证查看匿名报告')
      return
    }
    try {
      const response = teacherMode && id
        ? await compositeApi.teacherReport(id, attemptId)
        : publicMode
          ? await publicCompositeApi(credential).report(attemptId)
          : await compositeApi.report(attemptId)
      if (response.code !== 0 || !response.data) throw new Error(response.message || '报告不存在')
      setReport(response.data)
    } catch (err) {
      setError((err as { message?: string }).message || '加载报告失败')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [attemptId, publicMode, teacherMode, id])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载报告中...</div>
  if (!report) return <div className="max-w-xl mx-auto card p-8 text-center"><p className="text-red-500 mb-4">{error || '暂无报告'}</p>{publicMode && <><input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} className="w-full border rounded px-3 py-2 mb-3" placeholder="恢复凭证" /><button onClick={() => { setRecoveryToken(recoveryInput); setLoading(true); void load(recoveryInput) }} className="btn-primary">查看匿名报告</button></>}<button onClick={() => navigate(backTo)} className="btn-secondary mt-4 block mx-auto">返回</button></div>

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(backTo)} className="flex items-center text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4 mr-1" />返回</button>
      <div className="card p-8 mb-5"><CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" /><h1 className="text-2xl font-bold text-center text-gray-800">{report.name}</h1><p className="text-center text-gray-500 mt-2">以下按容器顺序展示各模块的独立结果。</p>{report.anonymousCode && <p className="text-center text-sm text-gray-500 mt-2">匿名编号：{report.anonymousCode}</p>}</div>
      <div className="space-y-4">{unitReports.map((module) => (
        <div key={module.itemId} className="card p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{module.type === 'SCALE' ? module.scaleName : module.label || module.type}</h2>
          {'decryptError' in module && module.decryptError ? (
            <p className="text-amber-700">该模块结果无法解密，分数未展示。</p>
          ) : (
            <>
              {module.type === 'FORM' && <p className="text-gray-700 whitespace-pre-wrap">{module.value ?? '—'}</p>}
              {module.type === 'SCALE' && <ScaleUnitReportCard report={module as ScaleUnitReport} />}
              {module.type === 'COGNITIVE' && (
                module.singleTaskReport
                  ? <CognitiveSingleTaskReportCard report={module.singleTaskReport as CognitiveSingleTaskReport} />
                  : <p className="text-gray-500">该认知任务尚未完成或没有可展示的单任务报告。</p>
              )}
            </>
          )}
        </div>
      ))}</div>
    </div>
  )
}

export default CompositeReportPage
