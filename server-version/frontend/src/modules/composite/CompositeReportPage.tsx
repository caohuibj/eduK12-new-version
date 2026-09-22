import React, { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { compositeApi, publicCompositeApi } from './api'
import type { CompositeAnalysisExportFormat, CompositeReport, CompositeSnapshotMetadata } from './types'
import { useAuth } from '../../contexts/AuthContext'
import CompositePackageReport from './CompositePackageReport'
import CognitiveSingleTaskReportCard from '../cognitive/CognitiveSingleTaskReportCard'
import type { CognitiveSingleTaskReport } from '../cognitive/types'
import ReportShell from '../reporting/ReportShell'
import ScaleUnitReportCard, { type SafeScaleUnitReport } from '../reporting/ScaleUnitReportCard'
import SituationalReportCard, { type SituationalReportView } from '../reporting/SituationalReportCard'

const readRecovery = (attemptId: string) => typeof window === 'undefined' ? '' : window.sessionStorage.getItem(`composite:recovery:attempt:${attemptId}`) || ''
const formatDuration = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

type LegacyCompositeModule = Record<string, unknown> & {
  itemId: string
  type?: string
  label?: string | null
  value?: string | null
}

const CompositeReportPage: React.FC = () => {
  const { id, attemptId } = useParams<{ id?: string; attemptId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const publicMode = location.pathname.startsWith('/public/composite')
  const teacherMode = Boolean(id && attemptId && location.pathname.startsWith('/composite-assessments/'))
  const staffMode = teacherMode && (user?.role === 'TEACHER' || user?.role === 'ADMIN')
  const adminMode = teacherMode && user?.role === 'ADMIN'
  const selectedSnapshotId = new URLSearchParams(location.search).get('snapshotId') || undefined
  const [recoveryToken, setRecoveryToken] = useState(publicMode && attemptId ? readRecovery(attemptId) : '')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [report, setReport] = useState<CompositeReport | null>(null)
  const [snapshots, setSnapshots] = useState<CompositeSnapshotMetadata[]>([])
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<CompositeAnalysisExportFormat | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const backTo = teacherMode && id ? `/composite-assessments/${id}/results` : publicMode ? '/' : '/student'
  const legacyModules = (report as (CompositeReport & { modules?: LegacyCompositeModule[] }) | null)?.modules || []
  const unitReports = (report?.unitReports || legacyModules).filter((module) => module.type !== 'FORM') as CompositeReport['unitReports']
  const backgroundValues = report?.backgroundValues || legacyModules.filter((module) => module.type === 'FORM')
  const shouldLoadSnapshots = staffMode && Boolean(report?.packageReport || selectedSnapshotId)

  const load = useCallback(async (credential = recoveryToken, snapshotId = selectedSnapshotId) => {
    if (!attemptId) return
    setLoading(true)
    setError(null)
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
        ? await compositeApi.teacherReport(id, attemptId, snapshotId)
        : publicMode
          ? await publicCompositeApi(credential).report(attemptId)
          : await compositeApi.report(attemptId)
      if (response.code !== 0 || !response.data) throw new Error(response.message || '报告不存在')
      setReport(response.data)
    } catch (err) {
      setError((err as { message?: string }).message || '加载报告失败')
      setReport(null)
    } finally { setLoading(false) }
  }, [attemptId, id, publicMode, recoveryToken, selectedSnapshotId, teacherMode])

  const loadSnapshots = useCallback(async () => {
    if (!staffMode || !attemptId) return
    setSnapshotLoading(true)
    setSnapshotError(null)
    try {
      const response = await compositeApi.snapshots(attemptId)
      if (response.code !== 0 || !response.data) throw new Error(response.message || 'Snapshot 历史加载失败')
      setSnapshots(response.data.list)
    } catch (err) {
      setSnapshotError((err as { message?: string }).message || 'Snapshot 历史加载失败')
    } finally { setSnapshotLoading(false) }
  }, [attemptId, staffMode])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!shouldLoadSnapshots) {
      setSnapshots([])
      setSnapshotError(null)
      return
    }
    void loadSnapshots()
  }, [loadSnapshots, shouldLoadSnapshots])

  const selectSnapshot = (snapshotId: string) => {
    const params = new URLSearchParams(location.search)
    if (snapshotId) params.set('snapshotId', snapshotId)
    else params.delete('snapshotId')
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true })
  }

  const reanalyze = async () => {
    if (!adminMode || !attemptId) return
    setReanalyzing(true)
    setSnapshotError(null)
    try {
      const response = await compositeApi.reanalyze(attemptId)
      if (response.code !== 0 || !response.data) throw new Error(response.message || '重新分析失败')
      await loadSnapshots()
      selectSnapshot(response.data.id)
    } catch (err) {
      setSnapshotError((err as { message?: string }).message || '重新分析失败')
    } finally { setReanalyzing(false) }
  }

  const downloadAnalysisExport = async (format: CompositeAnalysisExportFormat) => {
    if (!staffMode || !id || !attemptId || !report?.packageReport) return
    setExportingFormat(format)
    setSnapshotError(null)
    try {
      const snapshotId = selectedSnapshotId || report.packageReport.snapshotId
      const download = await compositeApi.downloadAnalysisExport(id, attemptId, format, snapshotId)
      const objectUrl = URL.createObjectURL(download.blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = download.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setSnapshotError((err as { message?: string }).message || '分析导出失败')
    } finally { setExportingFormat(null) }
  }

  const showSnapshotControls = staffMode && (Boolean(report?.packageReport) || snapshots.length > 0)
  const snapshotControls = showSnapshotControls && <div className="card p-5" data-testid="composite-snapshot-controls">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="text-sm font-medium text-gray-700" htmlFor="composite-snapshot-select">报告版本</label>
      <select id="composite-snapshot-select" aria-label="报告版本" value={selectedSnapshotId || ''} onChange={(event) => selectSnapshot(event.target.value)} className="border rounded px-3 py-2 text-sm min-w-64">
        <option value="">完成时默认版本</option>
        {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.generationReason === 'COMPLETION' ? '完成时' : '重新分析'} · {new Date(snapshot.createdAt).toLocaleString('zh-CN')}</option>)}
      </select>
      {adminMode && <button type="button" onClick={() => void reanalyze()} disabled={reanalyzing} className="btn-primary">{reanalyzing ? '重新分析中...' : '重新分析'}</button>}
    </div>
    {snapshotLoading && <p className="text-xs text-gray-500 mt-2">加载报告历史...</p>}
    {snapshotError && <p className="text-sm text-red-600 mt-2">{snapshotError}</p>}
    {report?.packageReport && (
      <div className="mt-4 border-t pt-4" data-testid="composite-analysis-export-controls">
        <p className="text-sm font-medium text-gray-700 mb-2">当前 Snapshot 分析导出</p>
        <div className="flex flex-wrap gap-2">
          {(['json', 'zip', 'xlsx'] as CompositeAnalysisExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => void downloadAnalysisExport(format)}
              disabled={exportingFormat !== null}
              className="btn-secondary"
              aria-label={`导出 ${format.toUpperCase()}`}
            >
              {exportingFormat === format ? '导出中...' : `导出 ${format.toUpperCase()}`}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载报告中...</div>

  if (!report) {
    return (
      <ReportShell
        title="综合测评报告"
        description="无法读取当前结果记录。"
        status={{ kind: 'error', title: '报告暂时无法打开', description: error || '暂无报告' }}
        actions={<button type="button" onClick={() => navigate(backTo)} className="btn-secondary">返回</button>}
      >
        {snapshotControls}
        {publicMode && (
          <div className="card p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="composite-recovery-input">恢复凭证</label>
            <input id="composite-recovery-input" value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} className="w-full border rounded px-3 py-2 mb-3" placeholder="恢复凭证" />
            <button onClick={() => { setRecoveryToken(recoveryInput); setLoading(true); void load(recoveryInput) }} className="btn-primary">查看匿名报告</button>
          </div>
        )}
      </ReportShell>
    )
  }

  const facts = [
    ...(report.completedAt ? [{ label: '完成时间', value: new Date(report.completedAt).toLocaleString('zh-CN') }] : []),
    ...(report.totalTime != null ? [{ label: '用时', value: formatDuration(report.totalTime) }] : []),
    ...(report.anonymousCode ? [{ label: '匿名编号', value: report.anonymousCode }] : []),
  ]

  return (
    <ReportShell
      title={report.name}
      description={report.productKind === 'QUESTIONNAIRE' ? '以下按问卷顺序展示各项测评的独立结果。' : '以下按容器顺序展示各模块的独立结果。'}
      facts={facts}
      status={{ kind: 'success', title: '已提交', description: '报告读取失败不会改变已经完成的提交状态。' }}
      backAction={<button type="button" onClick={() => navigate(backTo)} className="btn-secondary">返回</button>}
    >
      {snapshotControls}
      {report.packageReport && <CompositePackageReport report={report.packageReport} />}
      {backgroundValues.length > 0 && <div className="card p-6" data-testid="composite-background-values">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">背景信息</h2>
        <div className="space-y-2">{backgroundValues.map((background) => (
          <div key={background.itemId} className="flex justify-between gap-4 text-sm">
            <span className="text-gray-500">{background.label || '背景信息'}</span>
            <span className="text-gray-800 whitespace-pre-wrap">{background.value ?? '—'}</span>
          </div>
        ))}</div>
      </div>}
      <div className="space-y-4">{unitReports.map((module) => (
        <div key={module.itemId} className="card p-6" data-testid={`composite-unit-report-${module.itemId}`}>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{module.type === 'SCALE' ? module.scaleName : module.label || module.type}</h2>
          {'decryptError' in module && module.decryptError ? (
            <p className="text-amber-700">该模块结果无法解密，分数未展示。</p>
          ) : (
            <>
              {module.type === 'SCALE' && <ScaleUnitReportCard report={module as SafeScaleUnitReport} />}
              {module.type === 'COGNITIVE' && (
                module.singleTaskReport
                  ? <CognitiveSingleTaskReportCard report={module.singleTaskReport as unknown as CognitiveSingleTaskReport} />
                  : <p className="text-gray-500">该认知任务尚未完成或没有可展示的单任务报告。</p>
              )}
              {module.type === 'SITUATIONAL' && <SituationalReportCard report={module as SituationalReportView} />}
            </>
          )}
        </div>
      ))}</div>
    </ReportShell>
  )
}

export default CompositeReportPage
