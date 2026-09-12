import CognitiveCredentialReset from './CognitiveCredentialReset'
import CognitiveSessionEntry from './CognitiveSessionEntry'
import { isPublicAssessmentPath, parentReturnTo } from '../../../components/app-shell/access'
import React, { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { cognitiveApi, publicCognitiveApi } from '../api'
import { readCognitiveRecoveryCredential } from '../core/recovery-credential'
import { useCognitiveSession } from '../core/useCognitiveSession'
import { useAdministrationProvenance } from '../core/useAdministrationProvenance'
import { resolveRunner } from '../registry'
import AssessmentImagePresentation from '../../assessment-media/AssessmentImagePresentation'
import AssessmentVideoPlayer from '../../assessment-media/AssessmentVideoPlayer'
import { useAssessmentImageAssets } from '../../assessment-media/useAssessmentImageAssets'
import type { AssessmentImagePresentationItem, AssessmentVideoCapabilitySources } from '../../assessment-media/types'
import { cognitiveVideoPresentationEntries } from '../video-presentation'
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

/**
 * CognitiveRunner（Stage B v1.1 §17/§20/§21）。
 * 按状态机渲染；RECOVERY_REQUIRED 明确提示、绝不静默重跑/猜测进度。
 *
 * Cognitive image bytes and video capability URLs are prepared before START_RUN.
 * Video bytes remain native-streamed; task code owns example/stimulus timing and
 * no playback position is persisted or included in FINAL.
 */
const CognitiveRunner: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPublic = isPublicAssessmentPath(useLocation().pathname)
  const recoveryToken = sessionId && isPublic ? readCognitiveRecoveryCredential(sessionId) : ''
  const sessionApi = useMemo(
    () => (isPublic ? publicCognitiveApi(recoveryToken) : cognitiveApi),
    [isPublic, recoveryToken]
  )
  const controller = useCognitiveSession(sessionId ?? '', sessionApi)
  const { state } = controller
  const administrationProvenance = useAdministrationProvenance(state.session, state.status)
  const completeWithProvenance = () => controller.complete(administrationProvenance.snapshot() ?? undefined)
  const [restarting, setRestarting] = useState(false)
  const [restartError, setRestartError] = useState<string | null>(null)
  const [instructionVideoReady, setInstructionVideoReady] = useState<Record<string, string>>({})

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

  const imagesReady = allImageItems.length === 0 || imageState.status === 'ready'
  const videoCapabilitiesReady = videoEntries.length === 0 || videoState.status === 'ready'
  const instructionVideosReady = instructionVideoEntries.every((entry) => {
    const currentUrl = videoState.sources[entry.key]?.videoUrl
    return Boolean(currentUrl) && instructionVideoReady[entry.key] === currentUrl
  })
  const mediaReady = imagesReady && videoCapabilitiesReady && instructionVideosReady

  // 试次总数：Fake 用 trialCount，Reaction 用 totalTrials（Milestone E §28）。
  // Memory（自适应）不依赖固定总数，完成信号由其自身推进逻辑在 Session 3 处理。
  const config = (state.session?.config ?? {}) as Record<string, unknown>
  const total = (config?.trialCount ?? config?.totalTrials ?? 0) as number

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
      navigate(`${isPublic ? '/public' : '/student'}/cognitive/sessions/${next.sessionId}${suffix}`, { replace: true })
    } catch (error) {
      setRestartError((error as { message?: string })?.message || '重启失败，请稍后重试')
    } finally {
      setRestarting(false)
    }
  }

  if (state.status === 'COMPLETED') {
    if (sessionId) {
      const returnTo = searchParams.get('returnTo')
      const target = parentReturnTo(
        returnTo, isPublic,
        isPublic
          ? `/public/cognitive/sessions/${sessionId}/result?public=1`
          : `/student/cognitive/sessions/${sessionId}/result`,
      )
      navigate(target, { replace: true })
    }
    return null
  }

  if (state.status === 'LOADING' || state.status === 'COMPLETING') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    )
  }

  if (state.status === 'LEGACY_READ_ONLY') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <p className="text-xl font-semibold text-amber-700 mb-2">这是旧版进行中的认知测评</p>
        <p className="text-gray-600 mb-3">历史内容仍可读取，但旧版逐试次写入已停用。重启会保留历史记录，并创建新的整份提交测评。</p>
        <p className="text-sm text-gray-500 mb-6">当前尝试 #{state.session?.attemptNo ?? '—'}</p>
        {(restartError || state.error) && <p role="alert" className="text-red-500 text-sm mb-4">{restartError || state.error?.message}</p>}
        <button onClick={() => void handleRestart()} disabled={restarting} className="btn-primary">
          {restarting ? '重启中...' : '重启并继续作答'}
        </button>
      </div>
    )
  }

  if (state.status === 'READY') {
    return (
      <div className="card p-8 max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">准备开始</h1>
        <p className="text-gray-600 mb-2">
          本次测评共 {total || '若干'} 个试次，请按提示完成。
        </p>
        <p className="text-sm text-gray-400 mb-6">
          尝试 #{state.session?.attemptNo}（{state.session?.testType} / {state.session?.engineVersion}）
        </p>
        {isPublic && recoveryToken && (
          <p className="text-left text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 mb-6">
            匿名编号：{state.session?.anonymousCode || '匿名参与者'}；恢复凭证：<code className="break-all">{recoveryToken}</code>。请保存它，之后可在其他设备继续作答。
          </p>
        )}
        {imageState.status === 'loading' && allImageItems.length > 0 && (
          <p role="status" className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded p-3 mb-4">
            正在准备测评视觉资源…
          </p>
        )}
        {imageState.status === 'error' && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p>视觉内容加载失败，当前不能开始测评。</p>
            <button type="button" onClick={imageState.retry} className="btn-secondary mt-3">重试视觉内容</button>
          </div>
        )}
        {videoState.status === 'loading' && videoEntries.length > 0 && (
          <p role="status" className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded p-3 mb-4">
            正在准备测评视频资源…
          </p>
        )}
        {videoState.status === 'error' && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p>视频内容加载失败，当前不能开始测评。</p>
            <button type="button" onClick={videoState.retry} className="btn-secondary mt-3">重试视频内容</button>
          </div>
        )}
        {imageState.status === 'ready' && instructionItems.length > 0 && (
          <AssessmentImagePresentation
            items={instructionItems}
            state={imageState}
            ordered={instructionItems.length > 1}
            ariaLabel="认知测评说明视觉内容"
          />
        )}
        {videoState.status === 'ready' && instructionVideoEntries.map((entry) => {
          const sources = videoState.sources[entry.key]
          if (!sources) return null
          return (
            <AssessmentVideoPlayer
              key={`${entry.key}:${sources.videoUrl}`}
              presentation={entry.presentation}
              sources={sources}
              autoPlay={false}
              className="mt-4 text-left"
              onReady={() => setInstructionVideoReady((current) => ({ ...current, [entry.key]: sources.videoUrl }))}
              onError={() => setInstructionVideoReady((current) => ({ ...current, [entry.key]: '' }))}
              onRetry={async () => {
                setInstructionVideoReady((current) => ({ ...current, [entry.key]: '' }))
                await videoState.refresh(entry.key)
              }}
            />
          )
        })}
        <button onClick={controller.start} disabled={!mediaReady} className="btn-primary mt-6">
          开始测评
        </button>
      </div>
    )
  }

  if (state.status === 'UNSUPPORTED') {
    return (
      <div className="card p-8 text-center">
        <p className="text-xl font-semibold text-gray-700 mb-2">该测评类型或版本暂不支持</p>
        <p className="text-gray-500 mb-6">请联系老师处理</p>
        <button onClick={() => navigate(isPublic ? '/' : '/student/cognitive')} className="btn-secondary">
          返回列表
        </button>
      </div>
    )
  }

  if (state.status === 'RECOVERY_REQUIRED') {
    const returnTo = parentReturnTo(searchParams.get('returnTo'), isPublic, isPublic ? '/' : '/student/cognitive')
    const hasParentReturn = returnTo !== (isPublic ? '/' : '/student/cognitive')
    return (
      <div className="card p-8 text-center">
        <p className="text-xl font-semibold text-amber-600 mb-2">无法恢复测评进度</p>
        <p className="text-gray-600 mb-2">
          检测到未完成的测评，但无法确认已提交进度，请勿刷新或重复提交。本地草稿仍会保留。
        </p>
        <p className="text-gray-500 mb-6">{hasParentReturn ? '请返回上层综合测评并从那里重启。' : '可以创建新的整份提交测评。'}</p>
        {(restartError || state.error) && <p role="alert" className="text-red-500 text-sm mb-4">{restartError || state.error?.message}</p>}
        <div className="flex justify-center gap-3">
          <button onClick={() => navigate(returnTo)} className="btn-secondary">
            {hasParentReturn ? '返回上层测评' : '返回列表'}
          </button>
          {!hasParentReturn && <button onClick={() => void handleRestart()} disabled={restarting} className="btn-primary">
            {restarting ? '重启中...' : '重启并继续作答'}
          </button>}
        </div>
      </div>
    )
  }

  if (state.status === 'ERROR') {
    return (
      <div className="card p-8 text-center">
        <p className="text-xl font-semibold text-red-500 mb-2">加载失败</p>
        <p className="text-gray-500 mb-6">{state.error?.message || '请稍后重试'}</p>
        <button onClick={controller.reload} className="btn-secondary">
          重试
        </button>
        {isPublic && sessionId && <CognitiveCredentialReset sessionId={sessionId} />}
      </div>
    )
  }

  // RUNNING / SUBMITTING_TRIAL
  if (state.session && state.taskContext) {
    if (!imagesReady || !videoCapabilitiesReady) {
      return (
        <div className="card p-8 max-w-2xl text-center">
          {imageState.status === 'error' ? (
            <div role="alert" className="text-red-700">
              <p>视觉内容未就绪，测量不会继续。</p>
              <button type="button" onClick={imageState.retry} className="btn-secondary mt-4">重试视觉内容</button>
            </div>
          ) : videoState.status === 'error' ? (
            <div role="alert" className="text-red-700">
              <p>视频能力未就绪，测量不会继续。</p>
              <button type="button" onClick={videoState.retry} className="btn-secondary mt-4">重试视频内容</button>
            </div>
          ) : (
            <p role="status" className="text-gray-600">正在准备测评媒体…</p>
          )}
        </div>
      )
    }
    const entry = resolveRunner(state.session.testType, state.session.engineVersion)
    if (!entry) {
      return (
        <div className="card p-8 text-center">
          <p className="text-gray-600">该测评类型或版本暂不支持</p>
        </div>
      )
    }
    const Runner = entry.RunnerComponent
    const taskCompletes = entry.completionMode === 'task'
    const isLastTrial = state.status === 'RUNNING' && total > 0 && state.trialIndex >= total && !taskCompletes
    return (
      <div className="max-w-2xl mx-auto">
        {isPublic && recoveryToken && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
            匿名编号：{state.session?.anonymousCode || '匿名参与者'}；恢复凭证：<code className="break-all">{recoveryToken}</code>。请保存它，之后可在其他设备继续作答。
          </p>
        )}
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
        {state.error && (
          <p className="text-sm text-red-500 text-center mt-3">{state.error.message}</p>
        )}
        {isLastTrial && state.status !== 'SUBMITTING_TRIAL' && (
          <div className="text-center mt-6">
            <button onClick={() => void completeWithProvenance()} className="btn-primary">
              完成测评
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card p-8 text-center">
      <p className="text-gray-500">加载中...</p>
    </div>
  )
}

export default function CognitiveRunnerEntry() {
  return <CognitiveSessionEntry><CognitiveRunner /></CognitiveSessionEntry>
}
