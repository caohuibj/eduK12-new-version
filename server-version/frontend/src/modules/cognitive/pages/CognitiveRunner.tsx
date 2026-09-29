import CognitiveCredentialReset from './CognitiveCredentialReset'
import CognitiveSessionEntry from './CognitiveSessionEntry'
import { isPublicAssessmentPath, parentReturnTo } from '../../../components/app-shell/access'
import { AssessmentShell, type AssessmentInteractionReadiness, type AssessmentProgress } from '../../../components/assessment-shell'
import React, { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { cognitiveApi, publicCognitiveApi } from '../api'
import { readCognitiveRecoveryCredential } from '../core/recovery-credential'
import { cognitiveInputNotice, resolveCognitiveReadinessProfile } from '../core/readiness'
import { useCognitiveSession } from '../core/useCognitiveSession'
import { useAdministrationProvenance } from '../core/useAdministrationProvenance'
import { resolveRunner } from '../registry'
import AssessmentImagePresentation from '../../assessment-media/AssessmentImagePresentation'
import AssessmentVideoPlayer from '../../assessment-media/AssessmentVideoPlayer'
import { useAssessmentImageAssets } from '../../assessment-media/useAssessmentImageAssets'
import type { AssessmentImagePresentationItem, AssessmentVideoCapabilitySources } from '../../assessment-media/types'
import { cognitiveVideoPresentationEntries } from '../video-presentation'
import { useCognitiveInstructionVideoCompletion } from '../useCognitiveInstructionVideoCompletion'
import { useCognitiveVideoSources } from '../useCognitiveVideoSources'

const presentationItems = (
  presentation: NonNullable<import('../types').CognitiveSession['presentation']> | undefined,
): AssessmentImagePresentationItem[] => presentation
  ? [
      ...(presentation.instruction ?? []),
      ...(presentation.example ?? []),
      ...(presentation.stimulus ?? []),
    ]
  : []

const LoadingContent = ({ message }: { message: string }) => (
  <div className="flex min-h-40 items-center justify-center" role="status">
    <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-action" />
    <span className="ml-3 text-slate-600">{message}</span>
  </div>
)

/**
 * CognitiveRunner（Stage B v1.1 §17/§20/§21）。
 *
 * FE-07A projects product state into AssessmentShell only. Task reducers,
 * exact-version runner selection, timed stimuli, media disclosure, local trial
 * persistence and FINAL construction remain Cognitive-owned.
 */
const CognitiveRunner: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const isPublic = isPublicAssessmentPath(location.pathname)
  const relationalMode = location.pathname.startsWith('/relational/cognitive/')
  const recoveryToken = sessionId && isPublic ? readCognitiveRecoveryCredential(sessionId) : ''
  const sessionApi = useMemo(
    () => (isPublic ? publicCognitiveApi(recoveryToken) : cognitiveApi),
    [isPublic, recoveryToken]
  )
  const controller = useCognitiveSession(sessionId ?? '', sessionApi, { aggregateOnly: relationalMode })
  const { state } = controller
  const administrationProvenance = useAdministrationProvenance(state.session, state.status)
  const completeWithProvenance = () => controller.complete(administrationProvenance.snapshot() ?? undefined)
  const [restarting, setRestarting] = useState(false)
  const [restartError, setRestartError] = useState<string | null>(null)
  const [instructionVideoReady, setInstructionVideoReady] = useState<Record<string, string>>({})

  const resolvedEntry = useMemo(() => (
    state.session ? resolveRunner(state.session.testType, state.session.engineVersion) : undefined
  ), [state.session])
  const readinessProfile = useMemo(() => (
    state.session
      ? resolveCognitiveReadinessProfile(state.session.testType, state.session.engineVersion)
      : undefined
  ), [state.session])
  const title = resolvedEntry?.name ?? '认知测评'

  const frozenPresentation = state.session?.presentation
  const instructionItems = useMemo(
    () => frozenPresentation?.instruction ?? [],
    [frozenPresentation],
  )
  const allImageItems = useMemo(
    () => presentationItems(frozenPresentation),
    [frozenPresentation],
  )
  const videoEntries = useMemo(
    () => cognitiveVideoPresentationEntries(frozenPresentation),
    [frozenPresentation],
  )
  const instructionVideoEntries = useMemo(
    () => videoEntries.filter((entry) => entry.slot === 'instruction'),
    [videoEntries],
  )
  const loadPresentationAsset = useCallback((assetId: string): Promise<Blob> => {
    if (!state.session || !sessionApi.loadAsset) {
      return Promise.reject(new Error('Cognitive image session is unavailable'))
    }
    return sessionApi.loadAsset(state.session.sessionId, assetId)
  }, [sessionApi, state.session])
  const issueVideoSources = useCallback(async (videoKey: string): Promise<AssessmentVideoCapabilitySources> => {
    if (!state.session || !sessionApi.issueVideoCapabilities) {
      throw new Error('Cognitive video session is unavailable')
    }
    const response = await sessionApi.issueVideoCapabilities(state.session.sessionId, videoKey)
    return response.data
  }, [sessionApi, state.session])
  const imageState = useAssessmentImageAssets(allImageItems, loadPresentationAsset)
  const videoState = useCognitiveVideoSources(videoEntries, issueVideoSources)
  const instructionVideoCompletion = useCognitiveInstructionVideoCompletion(
    state.session,
    instructionVideoEntries,
  )

  const imagesReady = allImageItems.length === 0 || imageState.status === 'ready'
  const videoCapabilitiesReady = videoEntries.length === 0 || videoState.status === 'ready'
  const instructionVideosReady = instructionVideoEntries.every((entry) => {
    const currentUrl = videoState.sources[entry.key]?.videoUrl
    return Boolean(currentUrl) && instructionVideoReady[entry.key] === currentUrl
  })
  const mediaReady = imagesReady
    && videoCapabilitiesReady
    && instructionVideosReady
    && instructionVideoCompletion.allComplete
    && !instructionVideoCompletion.loading
    && !instructionVideoCompletion.error

  // Fixed-trial tasks may expose a real denominator. Adaptive/task-complete
  // runners deliberately use phase progress instead of inventing a percentage.
  const config = (state.session?.config ?? {}) as Record<string, unknown>
  const totalValue = config?.trialCount ?? config?.totalTrials ?? 0
  const total = typeof totalValue === 'number' && Number.isFinite(totalValue) ? totalValue : 0

  const handleRestart = async () => {
    setRestarting(true)
    setRestartError(null)
    try {
      const next = await controller.restart()
      if (!next) throw new Error('重启响应缺少新测评记录')
      const query = new URLSearchParams()
      if (isPublic) query.set('public', '1')
      const returnTo = searchParams.get('returnTo')
      if (returnTo) query.set('returnTo', returnTo)
      const suffix = query.toString() ? `?${query.toString()}` : ''
      navigate(`${isPublic ? '/public' : relationalMode ? '/relational' : '/student'}/cognitive/sessions/${next.sessionId}${suffix}`, { replace: true })
    } catch (error) {
      setRestartError((error as { message?: string })?.message || '重启失败，请稍后重试')
    } finally {
      setRestarting(false)
    }
  }

  const cognitiveFallback = isPublic ? '/' : relationalMode ? '/relational/tasks' : '/student/cognitive'
  const parentTarget = parentReturnTo(
    searchParams.get('returnTo'),
    isPublic,
    cognitiveFallback,
  )
  const hasParentReturn = parentTarget !== cognitiveFallback
  const recoveryActions = (
    <div className="flex flex-wrap justify-center gap-3">
      <button onClick={() => navigate(parentTarget)} className="btn-secondary">
        {hasParentReturn ? '返回上层测评' : '返回列表'}
      </button>
      {!hasParentReturn ? (
        <button onClick={() => void handleRestart()} disabled={restarting} className="btn-primary">
          {restarting ? '重启中...' : '重启并继续作答'}
        </button>
      ) : null}
    </div>
  )

  const publicCredentialNotice = isPublic && recoveryToken ? (
    <p className="text-left text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
      匿名编号：{state.session?.anonymousCode || '匿名参与者'}；恢复凭证：<code className="break-all">{recoveryToken}</code>。请保存它，之后可在其他设备继续作答。
    </p>
  ) : null

  if (state.status === 'COMPLETED') {
    if (sessionId) {
      const returnTo = searchParams.get('returnTo')
      const target = parentReturnTo(
        returnTo, isPublic,
        isPublic
          ? `/public/cognitive/sessions/${sessionId}/result?public=1`
          : relationalMode
            ? '/relational/tasks'
            : `/student/cognitive/sessions/${sessionId}/result`,
      )
      navigate(target, { replace: true })
    }
    return null
  }

  if (state.status === 'LOADING') {
    return (
      <AssessmentShell
        title="认知测评"
        interactionReadiness={{ state: 'preparing', message: '正在读取冻结测评与本机恢复状态。' }}
      >
        <LoadingContent message="加载中..." />
      </AssessmentShell>
    )
  }

  if (state.status === 'COMPLETING') {
    return (
      <AssessmentShell
        title={title}
        submissionStatus={{ state: 'submitting', title: '正在提交认知测评', message: '试次已锁定，正在封存并提交同一份 FINAL。' }}
      >
        <LoadingContent message="正在提交并确认结果..." />
      </AssessmentShell>
    )
  }

  if (state.status === 'LEGACY_READ_ONLY') {
    return (
      <AssessmentShell
        title={title}
        recoveryState={{ state: 'blocked', message: '这是旧版进行中的认知测评。旧版逐试次写入已停用，不能继续原路径。' }}
        actions={recoveryActions}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-slate-700">历史内容仍可读取；重启会保留历史记录，并创建新的整份提交测评。</p>
          <p className="mt-2 text-sm text-slate-500">当前尝试 #{state.session?.attemptNo ?? '—'}</p>
          {(restartError || state.error) ? <p role="alert" className="mt-3 text-sm text-red-600">{restartError || state.error?.message}</p> : null}
        </div>
      </AssessmentShell>
    )
  }

  if (state.status === 'READY') {
    if (!resolvedEntry || !readinessProfile) {
      return (
        <AssessmentShell
          title="认知测评"
          interactionReadiness={{ state: 'blocked', message: '该冻结任务类型或 engineVersion 没有可用的前端支持契约。' }}
          actions={<button onClick={() => navigate(cognitiveFallback)} className="btn-secondary">返回列表</button>}
        >
          <p className="text-center text-slate-600">该测评类型或版本暂不支持，请联系老师处理。</p>
        </AssessmentShell>
      )
    }

    const unsafeLocalResume = state.session?.deliveryMode === 'FINAL_ONLY'
      && state.trialIndex > 0
      && readinessProfile.resumeDisposition !== 'trial-boundary-safe'
    if (unsafeLocalResume) {
      return (
        <AssessmentShell
          title={title}
          progress={{ kind: 'phase', phase: '需要恢复处理', detail: `本机已保存 ${state.trialIndex} 个试次；不会仅按最大 trialIndex 自动重挂任务。` }}
          recoveryState={{ state: 'blocked', message: readinessProfile.resumeReason }}
          actions={recoveryActions}
        >
          {publicCredentialNotice}
          <p className="text-center text-slate-600">本地草稿保持不变；请选择返回或创建新的整份提交测评。</p>
          {restartError ? <p role="alert" className="mt-3 text-center text-sm text-red-600">{restartError}</p> : null}
        </AssessmentShell>
      )
    }

    let interactionReadiness: AssessmentInteractionReadiness = { state: 'ready' }
    if (imageState.status === 'error') {
      interactionReadiness = { state: 'blocked', message: '视觉内容加载失败，当前不能开始测评。' }
    } else if (videoState.status === 'error') {
      interactionReadiness = { state: 'blocked', message: '视频内容加载失败，当前不能开始测评。' }
    } else if (instructionVideoCompletion.error) {
      interactionReadiness = { state: 'blocked', message: instructionVideoCompletion.error }
    } else if (
      imageState.status === 'loading'
      || videoState.status === 'loading'
      || instructionVideoCompletion.loading
      || !instructionVideosReady
    ) {
      interactionReadiness = { state: 'preparing', message: '正在准备本次任务的冻结媒体。' }
    } else if (!instructionVideoCompletion.allComplete) {
      interactionReadiness = { state: 'blocked', message: '开始前需要完整观看说明视频。' }
    }

    const instructions = (
      <div className="space-y-1">
        <p>本次测评共 {total || '若干'} 个试次，请按任务提示完成。</p>
        <p>尝试 #{state.session?.attemptNo}（{state.session?.testType} / {state.session?.engineVersion}）</p>
        {cognitiveInputNotice(state.session!.testType, state.session!.engineVersion) ? (
          <p>{cognitiveInputNotice(state.session!.testType, state.session!.engineVersion)}</p>
        ) : null}
      </div>
    )

    return (
      <AssessmentShell
        title={title}
        instructions={instructions}
        progress={{ kind: 'phase', phase: '准备开始', detail: '任务启动后，刺激与计时仍由具体 Cognitive task 自己管理。' }}
        interactionReadiness={interactionReadiness}
        actions={(
          <div className="text-center">
            <button onClick={controller.start} disabled={!mediaReady} className="btn-primary">
              开始测评
            </button>
          </div>
        )}
      >
        {publicCredentialNotice}
        {imageState.status === 'error' ? (
          <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>视觉内容加载失败，当前不能开始测评。</p>
            <button type="button" onClick={imageState.retry} className="btn-secondary mt-3">重试视觉内容</button>
          </div>
        ) : null}
        {videoState.status === 'error' ? (
          <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>视频内容加载失败，当前不能开始测评。</p>
            <button type="button" onClick={videoState.retry} className="btn-secondary mt-3">重试视频内容</button>
          </div>
        ) : null}
        {instructionVideoCompletion.error ? (
          <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{instructionVideoCompletion.error}</p>
        ) : null}
        {imageState.status === 'ready' && instructionItems.length > 0 ? (
          <AssessmentImagePresentation
            items={instructionItems}
            state={imageState}
            ordered={instructionItems.length > 1}
            ariaLabel="认知测评说明视觉内容"
          />
        ) : null}
        {videoState.status === 'ready' ? instructionVideoEntries.map((entry) => {
          const sources = videoState.sources[entry.key]
          if (!sources) return null
          return (
            <AssessmentVideoPlayer
              key={`${entry.key}:${sources.videoUrl}`}
              presentation={entry.presentation}
              sources={sources}
              autoPlay={false}
              requiredViewing={instructionVideoCompletion.required}
              viewingComplete={instructionVideoCompletion.isComplete(entry)}
              onViewingComplete={() => instructionVideoCompletion.markComplete(entry)}
              className="mt-4 text-left"
              onReady={() => setInstructionVideoReady((current) => ({ ...current, [entry.key]: sources.videoUrl }))}
              onError={() => setInstructionVideoReady((current) => ({ ...current, [entry.key]: '' }))}
              onRetry={async () => {
                setInstructionVideoReady((current) => ({ ...current, [entry.key]: '' }))
                await videoState.refresh(entry.key)
              }}
            />
          )
        }) : null}
      </AssessmentShell>
    )
  }

  if (state.status === 'UNSUPPORTED') {
    return (
      <AssessmentShell
        title="认知测评"
        interactionReadiness={{ state: 'blocked', message: '该测评类型或版本暂不支持。' }}
        actions={<button onClick={() => navigate(isPublic ? '/' : '/student/cognitive')} className="btn-secondary">返回列表</button>}
      >
        <p className="text-center text-slate-600">请联系老师处理。</p>
      </AssessmentShell>
    )
  }

  if (state.status === 'RECOVERY_REQUIRED') {
    return (
      <AssessmentShell
        title={title}
        recoveryState={{ state: 'blocked', message: state.error?.message || '检测到未完成的测评，但无法证明安全恢复点。本地草稿仍会保留。' }}
        actions={recoveryActions}
      >
        <p className="text-center text-slate-600">{hasParentReturn ? '请返回上层综合测评并从那里处理恢复。' : '可以创建新的整份提交测评。'}</p>
        {restartError ? <p role="alert" className="mt-3 text-center text-sm text-red-600">{restartError}</p> : null}
      </AssessmentShell>
    )
  }

  if (state.status === 'ERROR') {
    const pendingFinal = state.error?.code === 'FINAL_SUBMISSION_PENDING'
      || state.error?.code === 'FINAL_DRAFT_PENDING_WITHOUT_SEAL'
    return (
      <AssessmentShell
        title={title}
        submissionStatus={pendingFinal ? { state: 'pending', title: '提交状态尚未确认', message: state.error?.message } : { state: 'idle' }}
        recoveryState={!pendingFinal ? { state: 'error', message: state.error?.message || '请稍后重试' } : { state: 'blocked', message: '不会重建或重新生成另一份 FINAL；重试仅重新读取/核对当前状态。' }}
        actions={<button onClick={controller.reload} className="btn-secondary">重试</button>}
      >
        {isPublic && sessionId ? <CognitiveCredentialReset sessionId={sessionId} /> : null}
      </AssessmentShell>
    )
  }

  // RUNNING / SUBMITTING_TRIAL. Keep this branch structurally stable so a Shell
  // status update cannot remount the task component and re-expose a stimulus.
  if (state.session && state.taskContext) {
    const entry = resolvedEntry
    if (!entry) {
      return (
        <AssessmentShell
          title="认知测评"
          interactionReadiness={{ state: 'blocked', message: '该测评类型或版本暂不支持。' }}
        >
          <p className="text-center text-slate-600">请联系老师处理。</p>
        </AssessmentShell>
      )
    }

    if (!imagesReady || !videoCapabilitiesReady) {
      const mediaError = imageState.status === 'error' || videoState.status === 'error'
      return (
        <AssessmentShell
          title={entry.name}
          progress={{ kind: 'phase', phase: '媒体恢复', detail: '任务不会在媒体未就绪时继续。' }}
          interactionReadiness={mediaError
            ? { state: 'blocked', message: '测评媒体未就绪；不会自动重跑已暴露的刺激。' }
            : { state: 'preparing', message: '正在准备测评媒体。' }}
        >
          {imageState.status === 'error' ? (
            <div role="alert" className="text-center text-red-700">
              <p>视觉内容未就绪，测量不会继续。</p>
              <button type="button" onClick={imageState.retry} className="btn-secondary mt-4">重试视觉内容</button>
            </div>
          ) : videoState.status === 'error' ? (
            <div role="alert" className="text-center text-red-700">
              <p>视频能力未就绪，测量不会继续。</p>
              <button type="button" onClick={videoState.retry} className="btn-secondary mt-4">重试视频内容</button>
            </div>
          ) : <LoadingContent message="正在准备测评媒体..." />}
        </AssessmentShell>
      )
    }

    const Runner = entry.RunnerComponent
    const taskCompletes = entry.completionMode === 'task'
    const isLastTrial = state.status === 'RUNNING' && total > 0 && state.trialIndex >= total && !taskCompletes
    const progress: AssessmentProgress = total > 0 && !taskCompletes
      ? { kind: 'position', current: Math.min(state.trialIndex + 1, total), total, label: '试次进度' }
      : { kind: 'phase', phase: '任务进行中', detail: `已记录 ${state.trialIndex} 个试次；完成点由当前任务契约决定。`, label: '任务进度' }

    return (
      <AssessmentShell
        title={entry.name}
        progress={progress}
        saveStatus={state.status === 'SUBMITTING_TRIAL' && state.session.deliveryMode === 'FINAL_ONLY'
          ? { state: 'saving', message: '正在把当前试次写入同一份本机草稿。' }
          : { state: 'idle' }}
        actions={isLastTrial && state.status !== 'SUBMITTING_TRIAL' ? (
          <div className="text-center">
            <button onClick={() => void completeWithProvenance()} className="btn-primary">完成测评</button>
          </div>
        ) : undefined}
      >
        {publicCredentialNotice}
        <div data-cognitive-task-root="true">
          <Runner
            taskContext={state.taskContext}
            imageAssetUrls={imageState.urls}
            videoSources={videoState.sources}
            refreshVideoSource={videoState.refresh}
            trialIndex={state.trialIndex}
            onTrialComplete={controller.appendTrial}
            onTaskComplete={taskCompletes ? completeWithProvenance : undefined}
          />
        </div>
        {state.error ? <p className="mt-3 text-center text-sm text-red-600">{state.error.message}</p> : null}
      </AssessmentShell>
    )
  }

  return (
    <AssessmentShell title="认知测评" interactionReadiness={{ state: 'preparing' }}>
      <LoadingContent message="加载中..." />
    </AssessmentShell>
  )
}

export default function CognitiveRunnerEntry() {
  return <CognitiveSessionEntry><CognitiveRunner /></CognitiveSessionEntry>
}
