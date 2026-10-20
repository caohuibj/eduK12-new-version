import { TrainingTimingReport } from './TrainingTimingReport'
import { ReadonlyFormAnswer } from '../assessment-core/form/ReadonlyFormAnswer'
import { isTrainingHost } from '../../training/context'
import '../../training/training-form-surface.css'
import { withReportReadRecovery } from './receipt-recovery'
import { runWithCompletionRetry } from '../../services/completionRetry'
import { REPORT_AUTO_POLL_LIMIT, reportPollingDelayMs } from './report-polling'
import type { CompositeReportStatus } from './types'
import BundleReport from '../../pages/bundle/BundleReport'
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { ReportSection } from '../reporting/ReportPrimitives'

const formStateLabels: Record<string, string> = { ANSWERED: '已回答', REFUSED: '明确拒答', SHOWN_MISSING: '已显示未填写', NOT_SHOWN: '未显示' }

const readRecovery = (attemptId: string) => typeof window === 'undefined' ? '' : window.sessionStorage.getItem(`composite:recovery:attempt:${attemptId}`) || ''
const formatDuration = (ms: number) => {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

type LegacyCompositeModule = Record<string, unknown> & {
  typedValue?: string | number | string[] | Record<string,string|number|string[]> | null
  presentation?: {type:string;options:Array<{key:string;label:string}>;rows:Array<{key:string;label:string}>}
  state?: string
  rowStates?: Record<string, string>
  otherText?: string | null
  itemId: string
  type?: string
  label?: string | null
  value?: string | null
  displayValue?: string | null
}

const CompositeReportPage: React.FC = () => {
  const epoch = useRef(0)
  const { id, attemptId } = useParams<{ id?: string; attemptId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const publicMode = location.pathname.startsWith('/public/composite')
  const teacherMode = Boolean(id && attemptId && location.pathname.startsWith('/composite-assessments/'))
  const staffMode = teacherMode && (user?.role === 'TEACHER' || user?.role === 'ADMIN')
  const adminMode = teacherMode && user?.role === 'ADMIN'
  const selectedSnapshotId = staffMode ? new URLSearchParams(location.search).get('snapshotId') || undefined : undefined
  const partial = staffMode && new URLSearchParams(location.search).get('partial') === '1'
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
  const [generation, setGeneration] = useState<CompositeReportStatus | null>(null)
  const waitStartedAt = useRef(Date.now())
  const [waitSeconds, setWaitSeconds] = useState(0)
  const pollCount = useRef(0)
  useEffect(() => { waitStartedAt.current = Date.now(); setWaitSeconds(0) }, [attemptId])
  const statusAbort = useRef<AbortController | null>(null)
  const pollingProfile = generation?.feedbackPollProfile ?? (generation?.wholeSubmissionReceived ? 'QUEUED' : 'LEGACY')
  const automaticPollLimit = pollingProfile === 'LEGACY' ? 12 : REPORT_AUTO_POLL_LIMIT
  const participantFeedback = staffMode ? null : generation?.participantFeedback
  const canPollGeneration = !participantFeedback || participantFeedback.state === 'REPORT_PROCESSING'

  const studyReturn=attemptId?sessionStorage.getItem(`composite:study:return:${attemptId}`):null
  const ownStudyReturn=studyReturn && /^\/public\/studies\/[0-9a-f-]{36}$/.test(studyReturn)?studyReturn:null
  const returnCourseId = teacherMode ? new URLSearchParams(location.search).get('courseId') : null
  const backTo = publicMode && ownStudyReturn ? ownStudyReturn : teacherMode && id ? `/composite-assessments/${id}/results${returnCourseId ? '?courseId='+encodeURIComponent(returnCourseId) : ''}` : publicMode ? '/' : '/student'
  const legacyModules = (report as (CompositeReport & { modules?: LegacyCompositeModule[] }) | null)?.modules || []
  const unitReports = (report?.unitReports || legacyModules).filter((module) => module.type !== 'FORM') as CompositeReport['unitReports']
  const backgroundValues = report?.backgroundValues || legacyModules.filter((module) => module.type === 'FORM')
  const shouldLoadSnapshots = staffMode && !report?.bundleReport && Boolean(report?.packageReport || selectedSnapshotId)

  const load = useCallback(async (credential = recoveryToken, snapshotId = selectedSnapshotId, waitMs = 0) => {
    if (!attemptId) return
    const current = ++epoch.current
    statusAbort.current?.abort()
    const abort = new AbortController(); statusAbort.current = abort
    if (!waitMs) setLoading(true)
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
      if (!partial && !snapshotId) {
        const status = await runWithCompletionRetry(() => teacherMode && id
          ? compositeApi.teacherReportStatus(id, attemptId)
          : publicMode ? publicCompositeApi(credential).reportStatus(attemptId, waitMs, abort.signal) : compositeApi.reportStatus(attemptId, waitMs, abort.signal),
        { maxAttempts: 2 })
        if (current !== epoch.current) return
        if (status.code !== 0 || !status.data) throw new Error(status.message || '报告状态无法读取')
        setGeneration(status.data)
        if (status.data.reportStatus.state !== 'READY' ||
          (!staffMode && status.data.participantFeedback && status.data.participantFeedback.state !== 'AVAILABLE')) {
          setReport(null)
          return
        }
      }
      const response = await withReportReadRecovery(() => teacherMode && id
        ? partial ? compositeApi.teacherReport(id, attemptId, snapshotId, true) : compositeApi.teacherReport(id, attemptId, snapshotId)
        : publicMode
          ? publicCompositeApi(credential).report(attemptId)
          : partial ? compositeApi.partialReport(attemptId) : compositeApi.report(attemptId), abort.signal)
      if (response.code !== 0 || !response.data) throw new Error(response.message || '报告不存在')
      if (current !== epoch.current) return
      setReport(response.data)
    } catch (err) {
      if (current !== epoch.current) return
      setError((err as { message?: string }).message || '加载报告失败')
      setGeneration(previous => previous && (previous.wholeSubmissionReceived || previous.hasAcceptedSubmission) && ['PENDING', 'PROCESSING'].includes(previous.reportStatus.state) ? { ...previous } : null)
      setReport(null)
    } finally { if (current === epoch.current) setLoading(false) }
  }, [attemptId, id, publicMode, recoveryToken, selectedSnapshotId, teacherMode, staffMode, partial])

  useEffect(() => {
    if (!canPollGeneration || !(generation?.wholeSubmissionReceived || generation?.hasAcceptedSubmission) || !['PENDING', 'PROCESSING'].includes(generation.reportStatus.state)) return
    const update = () => setWaitSeconds(Math.max(0, Math.floor((Date.now() - waitStartedAt.current) / 1000)))
    update(); const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [canPollGeneration, generation?.wholeSubmissionReceived, generation?.hasAcceptedSubmission, generation?.reportStatus.state])

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

  useEffect(() => { pollCount.current = 0; void load(); return () => { epoch.current++; statusAbort.current?.abort() } }, [load])
  useEffect(() => {
    if (!canPollGeneration || !generation || report || !['PENDING', 'PROCESSING'].includes(generation.reportStatus.state) || pollCount.current >= automaticPollLimit) return
    // A bounded server wait wakes on committed readiness. When unavailable,
    // keep the existing bounded polling fallback; hidden pages stay idle.
    let waitingForVisibility = false
    const probe = () => {
      if (document.visibilityState === 'hidden') { waitingForVisibility = true; return }
      pollCount.current += 1
      void load(undefined, undefined, generation.feedbackWaitMs ?? 0)
    }
    const timer = window.setTimeout(probe, reportPollingDelayMs(pollCount.current, generation.reportStatus.retryAfterSeconds, Math.random, pollingProfile, generation.feedbackWaitMs ?? 0))
    const onVisible = () => {
      if (waitingForVisibility && document.visibilityState !== 'hidden') { waitingForVisibility = false; probe() }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [generation, load, report, pollingProfile, automaticPollLimit, canPollGeneration])
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
  const snapshotControls = showSnapshotControls && <ReportSection
    title="报告版本"
    eyebrow="Staff"
    description="切换已冻结的报告 Snapshot；重新分析会追加历史，不覆盖原报告。"
    testId="composite-snapshot-controls"
  >
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm font-medium text-gray-700" htmlFor="composite-snapshot-select">选择版本</label>
      <select id="composite-snapshot-select" aria-label="报告版本" value={selectedSnapshotId || ''} onChange={(event) => selectSnapshot(event.target.value)} className="input min-w-64 flex-1">
        <option value="">完成时默认版本</option>
        {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.generationReason === 'COMPLETION' ? '完成时' : '重新分析'} · {new Date(snapshot.createdAt).toLocaleString('zh-CN')}</option>)}
      </select>
      {adminMode && <button type="button" onClick={() => void reanalyze()} disabled={reanalyzing} className="hui-button hui-button--primary">{reanalyzing ? '重新分析中...' : '重新分析'}</button>}
    </div>
    {snapshotLoading && <p className="mt-2 text-xs text-gray-500">加载报告历史...</p>}
    {snapshotError && <p className="mt-2 text-sm text-red-600">{snapshotError}</p>}
    {report?.packageReport && (
      <div className="mt-4 border-t pt-4" data-testid="composite-analysis-export-controls">
        <p className="mb-2 text-sm font-medium text-gray-700">当前 Snapshot 分析导出</p>
        <div className="flex flex-wrap gap-2">
          {(['json', 'zip', 'xlsx'] as CompositeAnalysisExportFormat[]).map((format) => (
            <button key={format} type="button" onClick={() => void downloadAnalysisExport(format)} disabled={exportingFormat !== null} className="hui-button hui-button--secondary" aria-label={`导出 ${format.toUpperCase()}`}>
              {exportingFormat === format ? '导出中...' : `导出 ${format.toUpperCase()}`}
            </button>
          ))}
        </div>
      </div>
    )}
  </ReportSection>

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">加载报告中...</div>

  if (!report && participantFeedback && (
    participantFeedback.state === 'GENERATED_NOT_RELEASED' ||
    participantFeedback.state === 'WAITING_SUBMISSION' ||
    participantFeedback.state === 'UNAVAILABLE'
  )) {
    const waitingForSubmission = participantFeedback.state === 'WAITING_SUBMISSION'
    const scheduled = participantFeedback.state === 'GENERATED_NOT_RELEASED'
    const releaseDate = participantFeedback.releaseAt ? new Date(participantFeedback.releaseAt) : null
    const releaseLabel = releaseDate && Number.isFinite(releaseDate.getTime())
      ? releaseDate.toLocaleString('zh-CN', { timeZoneName: 'short' }) : null
    return <ReportShell
      title="综合测评报告"
      status={{ kind: 'info',
        title: waitingForSubmission ? '作答尚未全部完成' : scheduled ? '测评已完成，报告尚未开放' : '报告暂时不可用',
        description: waitingForSubmission ? '已提交单元保留在服务器，请先继续完成整份测评。'
          : scheduled ? `作答已保存，报告已生成。${releaseLabel ? `预计于 ${releaseLabel} 开放。` : '请等待教师预设的开放时间。'}到时可刷新查看，无需重新交卷。`
          : '已保存的作答不受影响，请稍后刷新或联系测评负责人。' }}
      actions={<>
        <button type="button" className="hui-button hui-button--secondary" onClick={() => { pollCount.current = 0; void load() }}>刷新开放状态</button>
        {waitingForSubmission && <button type="button" className="hui-button hui-button--primary" onClick={() => navigate(`${publicMode ? '/public' : '/student'}/composite/attempts/${attemptId}`)}>继续作答</button>}
        <button type="button" className="hui-button hui-button--secondary" onClick={() => navigate(backTo)}>返回</button>
      </>}
    />
  }

  if (!report && generation && generation.reportStatus.state !== 'READY') {
    const failed = generation.reportStatus.state === 'FAILED'
    const submissionConflict = failed && generation.reportStatus.errorCode === 'REPORT_SUBMISSION_KEY_CONFLICT'
    const waiting = generation.reportStatus.state === 'WAITING'
    const cancelled = generation.reportStatus.state === 'CANCELLED'
    return <ReportShell
      title="综合测评报告"
      status={{ kind: failed || cancelled ? 'error' : 'info',
        title: submissionConflict ? '作答已保存，报告需要处理' : failed ? '报告生成暂时失败' : waiting ? '作答尚未全部完成' : cancelled ? '报告任务已停止' : '作答记录已保存，报告生成中',
        description: submissionConflict ? '答案已安全保存，请联系测评负责人处理报告。无需再次提交答案，也请勿反复重新生成。'
          : failed ? '已保存的交卷不会丢失。可重新生成报告，无需再次提交答案。'
          : waiting ? '已提交单元保留在服务器，请先继续完成剩余作答。'
          : cancelled ? '请重新读取当前作答状态，核对测评版本。'
          : pollCount.current >= automaticPollLimit ? '报告仍在准备。已暂停自动查询，可稍后重新加载。'
          : error ? '网络暂时繁忙，正在重试读取报告；已保存的答案不受影响，无需重新交卷。'
          : waitSeconds >= 30 ? `作答已安全保存。本页已等待 ${waitSeconds} 秒，报告仍在准备；你可以离开，稍后回来查看，无需重新交卷。`
          : `作答已安全保存，报告准备中（本页已等待 ${waitSeconds} 秒）。页面会自动更新，离开不会取消报告任务。` }}
      actions={<>
        {failed && !submissionConflict && !teacherMode && <button type="button" className="hui-button hui-button--primary" onClick={() => {
          setLoading(true)
          void (publicMode ? publicCompositeApi(recoveryToken).retryReport(attemptId!) : compositeApi.retryReport(attemptId!))
            .then(response => { if (response.code !== 0) throw new Error(response.message || '报告重试失败'); pollCount.current = 0; return load() })
            .catch(cause => { setError((cause as Error).message); setGeneration(null); setLoading(false) })
        }}>重新生成报告</button>}
        <button type="button" className="hui-button hui-button--secondary" onClick={() => { pollCount.current = 0; void load() }}>重新加载报告</button>
        {waiting && !teacherMode && <button type="button" className="hui-button hui-button--primary" onClick={() => navigate(`${publicMode ? '/public' : '/student'}/composite/attempts/${attemptId}`)}>继续作答</button>}
        <button type="button" className="hui-button hui-button--secondary" onClick={() => navigate(backTo)}>返回</button>
      </>}
    />
  }

  if (!report) {
    return (
      <ReportShell
        title="综合测评报告"
        description="无法读取当前结果记录。"
        status={{ kind: 'error', title: '报告暂时无法打开', description: <><p>{error || '暂无报告'}</p><p>报告读取失败不会改变已经完成的提交状态。</p></> }}
        actions={<><button type="button" onClick={() => void load()} className="hui-button hui-button--primary">重新加载报告</button><button type="button" onClick={() => navigate(backTo)} className="hui-button hui-button--secondary">返回</button></>}
      >
        {snapshotControls}
        {publicMode && (
          <ReportSection title="匿名报告恢复" eyebrow="访问凭证">
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="composite-recovery-input">恢复凭证</label>
            <input id="composite-recovery-input" value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} className="input w-full mb-3" placeholder="恢复凭证" />
            <button onClick={() => { setRecoveryToken(recoveryInput); setLoading(true); void load(recoveryInput) }} className="hui-button hui-button--primary">查看匿名报告</button>
          </ReportSection>
        )}
      </ReportShell>
    )
  }

  const submittedNotSatisfied = report.reportState !== 'PARTIAL' && report.taskSatisfied === false
  const facts = [
    ...(report.completedAt ? [{ label: '完成时间', value: new Date(report.completedAt).toLocaleString('zh-CN') }] : []),
    ...(report.totalTime != null ? [{ label: '用时', value: formatDuration(report.totalTime) }] : []),
    ...(report.anonymousCode ? [{ label: '匿名编号', value: report.anonymousCode }] : []),
  ]

  return (
    <ReportShell
      title={report.name}
      description={report.reportState === 'PARTIAL' ? '作答尚未全部完成。这里只读展示已完成单项的冻结结果，不生成整体报告。' : report.productKind === 'ASSESSMENT_BUNDLE' ? '综合报告结合各项冻结结果，以下同时保留单项反馈。' : '以下按内容顺序展示各项测评的独立结果。'}
      facts={facts}
      status={{ kind: submittedNotSatisfied ? 'info' : 'success', title: submittedNotSatisfied ? '已交卷，任务未达成' : '已提交', description: submittedNotSatisfied ? '本次作答已保存并计入作答次数；任务条件未达成，仍可查看本次报告。' : '本次作答已提交，测评结果如下。' }}
      backAction={<button type="button" onClick={() => navigate(backTo)} className="hui-button hui-button--secondary">返回</button>}
    >
      {snapshotControls}
      {report.bundleReport && attemptId && <BundleReport report={report.bundleReport} attemptId={attemptId} staff={staffMode} recoveryToken={publicMode ? recoveryToken : undefined} reload={()=>void load()} />}
      {report.packageReport && <CompositePackageReport report={report.packageReport} />}
      {report.reportState === 'PARTIAL' && !unitReports.length && <ReportSection title="暂无已完成单项">完成单项并正式提交后，可在此查看其冻结结果。</ReportSection>}
      <ReportSection title="适用范围与解释边界" description="参考来源、适用人群与版本以各单项报告的已审批方案为准。">质量受限或没有可用参考依据时，保留相应说明；重复测验的差异不自动代表成长或能力改变。</ReportSection>
      {backgroundValues.length > 0 && <ReportSection title="表单回答" eyebrow="作答信息" testId="composite-background-values">
        <div className={`grid gap-3 sm:grid-cols-2${isTrainingHost() && !publicMode ? ' training-form-report' : ''}`}>{backgroundValues.map((background) => (
          <div key={background.itemId} className="report-metric">
            <div className="report-metric__label">{background.label || '表单回答'}</div>
            {background.state && <p className="mt-1 text-sm text-gray-600">{formStateLabels[background.state] ?? '作答状态待核对'}</p>}
            {background.presentation ? <ReadonlyFormAnswer value={background.typedValue??null} presentation={background.presentation} state={background.state} rowStates={background.rowStates} /> : <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{background.displayValue ?? background.value ?? (background.state ? '—' : isTrainingHost() && !publicMode ? '未作答' : '—')}</div>}
            {background.otherText && <p className="mt-1 whitespace-pre-wrap text-sm">其他说明：{background.otherText}</p>}
            {!background.presentation && background.rowStates && <ul className="mt-1 text-sm">{Object.entries(background.rowStates).map(([key, state]) => <li key={key}>{key}：{formStateLabels[state] ?? '作答状态待核对'}</li>)}</ul>}
          </div>
        ))}</div>
      </ReportSection>}
      {unitReports.length > 1 && (
        <ReportSection title="报告目录" eyebrow="测评内容" description="按测评内容查看本次完成时保存的结果。">
          <nav className="report-module-index" aria-label="综合报告模块目录">
            {unitReports.map((module, index) => (
              <a key={module.itemId} href={`#composite-report-unit-${index}`}>
                {index + 1}. {module.type === 'SCALE' ? module.scaleName : module.label || module.type}
              </a>
            ))}
          </nav>
        </ReportSection>
      )}
      {unitReports.map((module, index) => (
        <ReportSection
          key={module.itemId}
          id={`composite-report-unit-${index}`}
          title={module.type === 'SCALE' ? module.scaleName : module.label || module.type}
          eyebrow={`模块 ${index + 1}`}
          testId={`composite-unit-report-${module.itemId}`}
        >
          {'decryptError' in module && module.decryptError ? (
            <p className="text-amber-700">该模块结果无法解密，分数未展示。</p>
          ) : (
            <>
              {module.type === 'SCALE' && <><ScaleUnitReportCard report={module as SafeScaleUnitReport} />{staffMode && module.trainingTiming && <TrainingTimingReport value={module.trainingTiming} />}</>}
              {module.type === 'COGNITIVE' && (
                module.singleTaskReport
                  ? <CognitiveSingleTaskReportCard report={module.singleTaskReport as unknown as CognitiveSingleTaskReport} headingLevel={3} />
                  : <p className="text-gray-500">该认知任务尚未完成或没有可展示的单任务报告。</p>
              )}
              {module.type === 'SITUATIONAL' && <SituationalReportCard report={module as SituationalReportView} />}
            </>
          )}
        </ReportSection>
      ))}
    </ReportShell>
  )
}

export default CompositeReportPage
