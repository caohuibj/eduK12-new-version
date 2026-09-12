import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Loader2, Send, Sparkles } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { embeddedSituationalApi, publicEmbeddedSituationalApi, situationalApi, type SituationalRunnerClient } from '../api'
import {
  answeredResponseCount,
  ensureSituationalDraft,
  expectedResponseKeys,
  firstMissingSceneIndex,
  pruneSituationalDraftResponses,
  readSituationalDraft,
  responseKey,
  sceneIsComplete,
  situationalDraftKey,
  situationalErrorMessage,
  situationalReadyToSubmit,
  situationalResponsesFromDraft,
} from '../draft'
import { reachableSituationalScenes } from '../traversal'
import type {
  SituationalAttemptResponse,
  SituationalDraftAnswer,
  SituationalRunnerChannel,
  SituationalRunnerScene,
} from '../types'
import { finalDraftStore } from '../../../services/persistence/finalDraftStore'
import { runFinalDraftCapacityRetry } from '../../../services/persistence/finalDraftCapacityRetry'
import AssessmentImagePresentation from '../../assessment-media/AssessmentImagePresentation'
import { useAssessmentImageAssets } from '../../assessment-media/useAssessmentImageAssets'
import type { AssessmentImagePresentationItem } from '../../assessment-media/types'
import SituationalVideoPresentation from '../SituationalVideoPresentation'

const responseValueFor = (
  responses: Record<string, SituationalDraftAnswer>,
  scene: SituationalRunnerScene,
  channel: SituationalRunnerChannel,
): SituationalDraftAnswer | undefined => responses[responseKey(scene.sceneKey, channel.channelKey)]

const visualAssetsFor = (stimulus: SituationalRunnerScene['stimulus']): AssessmentImagePresentationItem[] => {
  if (stimulus.type === 'IMAGE') return [{ asset: stimulus.asset, altText: stimulus.altText, caption: stimulus.caption }]
  if (stimulus.type === 'COMIC') {
    return stimulus.panels.map((panel) => ({
      asset: panel.assetRef,
      altText: panel.altText,
      caption: panel.caption,
    }))
  }
  return []
}

const apiDataOrThrow = <T,>(response: { code: number | string; message: string; data: T }): T => {
  if (response.code !== 0) throw Object.assign(new Error(response.message || '请求失败'), { code: response.code })
  return response.data
}

const situationalFinalStatus = (error: unknown) => {
  const value = error as { code?: unknown; status?: number; statusCode?: number }
  const code = String(value?.code ?? '')
  return value?.status === 409
    || value?.statusCode === 409
    || code === '409'
    || code === 'STALE_ATTEMPT'
    || code === 'DEFINITION_MISMATCH'
    || code === 'SUBMISSION_PAYLOAD_CONFLICT'
    ? 'CONFLICT' as const
    : 'RETRY_PENDING' as const
}

const SituationalRunner: React.FC = () => {
  const { instrumentKey, attemptId } = useParams<{ instrumentKey?: string; attemptId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const publicMode = typeof window !== 'undefined' && window.location.pathname.startsWith('/public/composite/')
  const compositeAttemptId = searchParams.get('compositeAttemptId') || ''
  const compositeItemId = searchParams.get('compositeItemId') || ''
  const embedded = Boolean(attemptId)
  const recoveryToken = useMemo(() => {
    if (!publicMode || !compositeAttemptId || typeof window === 'undefined') return ''
    return window.sessionStorage.getItem(`composite:recovery:attempt:${compositeAttemptId}`) || ''
  }, [compositeAttemptId, publicMode])
  const returnTo = useMemo(() => {
    const candidate = searchParams.get('returnTo') || ''
    const prefix = publicMode ? '/public/composite/attempts/' : '/student/composite/attempts/'
    return candidate.startsWith(prefix) ? candidate : ''
  }, [publicMode, searchParams])
  const embeddedCompletionPath = returnTo || (
    embedded && compositeAttemptId
      ? `${publicMode ? '/public' : '/student'}/composite/attempts/${compositeAttemptId}`
      : ''
  )
  const client = useMemo<SituationalRunnerClient | null>(() => {
    if (embedded) {
      if (!compositeAttemptId || !compositeItemId) return null
      return publicMode
        ? publicEmbeddedSituationalApi(compositeAttemptId, compositeItemId, recoveryToken)
        : embeddedSituationalApi(compositeAttemptId, compositeItemId)
    }
    return situationalApi
  }, [compositeAttemptId, compositeItemId, embedded, publicMode, recoveryToken])
  const [data, setData] = useState<SituationalAttemptResponse | null>(null)
  const [responses, setResponses] = useState<Record<string, SituationalDraftAnswer>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [readyVideoSceneKey, setReadyVideoSceneKey] = useState<string | null>(null)
  const sceneStartedAt = useRef(Date.now())
  const submittingRef = useRef(false)

  useEffect(() => {
    sceneStartedAt.current = Date.now()
  }, [currentIndex])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!client) {
        setError('综合测评情境化槽位信息缺失，请返回后重新进入')
        setLoading(false)
        return
      }
      if (publicMode && !recoveryToken) {
        setError('请输入保存时获得的恢复凭证，才能继续这次匿名测评')
        setLoading(false)
        return
      }
      if (!attemptId && !instrumentKey) {
        setError('题包标识缺失')
        setLoading(false)
        return
      }
      try {
        const response = attemptId
          ? await client.resume(attemptId)
          : await client.start({ instrumentKey: decodeURIComponent(instrumentKey as string) })
        const next = apiDataOrThrow(response)
        if (next.attempt.status === 'COMPLETED') {
          await finalDraftStore.delete(situationalDraftKey(next.attempt.id)).catch(() => undefined)
          navigate(embeddedCompletionPath || `/student/situational/attempts/${next.attempt.id}/result`, { replace: true })
          return
        }
        const meta = await ensureSituationalDraft(next.attempt)
        const restoredResponses = await readSituationalDraft(next.attempt)
        const localResponses = meta.status === 'DRAFT'
          ? await pruneSituationalDraftResponses(next.attempt, next.instrument.definition, restoredResponses)
          : restoredResponses
        if (cancelled) return
        setData(next)
        setResponses(localResponses)
        if (meta.status !== 'DRAFT') {
          setNotice(meta.sealedSubmission
            ? '这次测评已有一份已封存提交；再次提交只会重放相同内容。'
            : '检测到旧版未确认提交；请先核对服务器结果，不能重新生成提交内容。')
        }
        const reachableScenes = reachableSituationalScenes(next.instrument.definition, localResponses)
        const missingIndex = firstMissingSceneIndex(next.instrument.definition, localResponses)
        setCurrentIndex(
          missingIndex >= 0
            ? missingIndex
            : next.instrument.definition.schemaVersion === 1
              ? 0
              : Math.max(0, reachableScenes.length - 1),
        )
      } catch (reason) {
        if (!cancelled) setError(situationalErrorMessage(reason))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [attemptId, client, embeddedCompletionPath, instrumentKey, navigate, publicMode, recoveryToken])

  const scenes = useMemo(() => (
    data ? reachableSituationalScenes(data.instrument.definition, responses) : []
  ), [data, responses])
  const currentScene = scenes[currentIndex]
  const videoSceneKey = currentScene?.stimulus.type === 'VIDEO' ? currentScene.sceneKey : ''

  useEffect(() => {
    setReadyVideoSceneKey(null)
  }, [videoSceneKey])

  const visualItems = useMemo(() => currentScene ? visualAssetsFor(currentScene.stimulus) : [], [currentScene])
  const loadVisualAsset = useCallback((assetId: string): Promise<Blob> => {
    if (!data || !client) return Promise.reject(new Error('Assessment image client is unavailable'))
    return client.loadAsset(data.attempt.id, assetId)
  }, [client, data])
  const visualState = useAssessmentImageAssets(visualItems, loadVisualAsset)
  const loadVideoSources = useCallback(async () => {
    if (!data || !client || !videoSceneKey) throw new Error('Assessment video client is unavailable')
    return apiDataOrThrow(await client.loadVideoSources(data.attempt.id, videoSceneKey))
  }, [client, data, videoSceneKey])
  const handleVideoReadyChange = useCallback((sceneKey: string, ready: boolean) => {
    setReadyVideoSceneKey((current) => {
      if (ready) return sceneKey
      return current === sceneKey ? null : current
    })
  }, [])

  const totalResponses = data ? expectedResponseKeys(data.instrument.definition, responses).length : 0
  const answeredCount = data ? answeredResponseCount(data.instrument.definition, responses) : 0
  const progress = totalResponses > 0 ? Math.round((answeredCount / totalResponses) * 100) : 0

  const sceneCompletion = useMemo(() => scenes.map((_, index) => data ? sceneIsComplete(data.instrument.definition, index, responses) : false), [data, responses, scenes])

  const persistAnswer = async (scene: SituationalRunnerScene, channel: SituationalRunnerChannel, responseValue: string | number) => {
    if (!data || submitting) return
    const key = responseKey(scene.sceneKey, channel.channelKey)
    const answer: SituationalDraftAnswer = {
      responseValue,
      responseTimeMs: Math.max(0, Date.now() - sceneStartedAt.current),
      answeredAt: new Date().toISOString(),
    }
    setSaving(true)
    try {
      await finalDraftStore.putAnswer({
        draftKey: situationalDraftKey(data.attempt.id),
        itemKey: key,
        value: answer,
        updatedAt: Date.now(),
      })
      const nextResponses = await pruneSituationalDraftResponses(
        data.attempt,
        data.instrument.definition,
        { ...responses, [key]: answer },
      )
      const nextScenes = reachableSituationalScenes(data.instrument.definition, nextResponses)
      setResponses(nextResponses)
      setCurrentIndex((index) => Math.min(index, Math.max(0, nextScenes.length - 1)))
      setNotice(null)
    } catch (reason) {
      setNotice(situationalErrorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  const recoverTerminalResult = async (): Promise<boolean> => {
    if (!data || !client) return false
    try {
      const response = await client.result(data.attempt.id)
      const next = apiDataOrThrow(response)
      if (next.attempt.status !== 'COMPLETED') return false
      await finalDraftStore.delete(situationalDraftKey(data.attempt.id)).catch(() => undefined)
      navigate(embeddedCompletionPath || `/student/situational/attempts/${data.attempt.id}/result`, { replace: true })
      return true
    } catch {
      return false
    }
  }

  const submit = async () => {
    if (!data || !client || submitting || submittingRef.current || saving) return
    const missingIndex = firstMissingSceneIndex(data.instrument.definition, responses)
    if (missingIndex >= 0) {
      setCurrentIndex(missingIndex)
      setNotice('还有必答通道未完成，请补充后再提交。')
      return
    }
    if (!situationalReadyToSubmit(data.instrument.definition, responses)) {
      setNotice('当前分支尚未到达可提交的结束节点，请完成当前决策路径。')
      return
    }
    // Lock before the first await so two clicks in the same event turn cannot
    // both pass the guard while the draft is being sealed.
    submittingRef.current = true
    setSubmitting(true)
    setNotice(null)
    const draftKey = situationalDraftKey(data.attempt.id)
    try {
      const sealed = await finalDraftStore.sealForSubmission(draftKey, (snapshot) => {
        const sealedResponses: Record<string, SituationalDraftAnswer> = {}
        snapshot.answers.forEach((answer) => {
          if (!answer.value || typeof answer.value !== 'object') return
          const value = answer.value as Partial<SituationalDraftAnswer>
          if (typeof value.responseValue !== 'string' && typeof value.responseValue !== 'number') return
          sealedResponses[answer.itemKey] = {
            responseValue: value.responseValue,
            ...(typeof value.responseTimeMs === 'number' ? { responseTimeMs: value.responseTimeMs } : {}),
            ...(typeof value.answeredAt === 'string' ? { answeredAt: value.answeredAt } : {}),
          }
        })
        if (!situationalReadyToSubmit(data.instrument.definition, sealedResponses)) {
          throw new Error('本地持久化的情境作答尚未达到可提交终点，请确认最后一次作答已经保存')
        }
        return {
          submissionId: snapshot.meta.submissionId,
          attemptEpoch: snapshot.meta.attemptEpoch,
          definitionHash: snapshot.meta.definitionHash,
          instrumentVersion: data.attempt.instrumentVersion,
          compiledRuntimeHash: data.attempt.compiledRuntimeHash,
          scoringVersion: data.attempt.scoringVersion,
          responses: situationalResponsesFromDraft(data.instrument.definition, sealedResponses),
        }
      })
      if (!sealed) throw new Error('本地作答草稿不存在，请返回后重新进入测评。')
      const response = await runFinalDraftCapacityRetry({
        onRetry: async ({ error: retryError }) => {
          await finalDraftStore.setStatus(draftKey, 'RETRY_PENDING', {
            code: String((retryError as { code?: unknown })?.code ?? 'ASSESSMENT_SUBMIT_BUSY'),
            message: situationalErrorMessage(retryError),
          }).catch(() => undefined)
          setNotice('提交繁忙，正在自动重试…')
        },
        operation: () => client.submit(data.attempt.id, sealed.payload),
      })
      const next = apiDataOrThrow(response)
      await finalDraftStore.setStatus(draftKey, 'COMPLETED')
      await finalDraftStore.delete(draftKey)
      navigate(embeddedCompletionPath || `/student/situational/attempts/${data.attempt.id}/result`, { replace: true })
      void next
    } catch (reason) {
      // A timeout may arrive after the server has committed. Terminal server
      // state always wins over local pending/conflict metadata.
      const recovered = await recoverTerminalResult()
      if (!recovered) {
        const status = situationalFinalStatus(reason)
        await finalDraftStore.setStatus(draftKey, status, {
          code: String((reason as { code?: unknown })?.code ?? 'NETWORK'),
          message: situationalErrorMessage(reason),
        }).catch(() => undefined)
        setNotice(situationalErrorMessage(reason))
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex min-h-[360px] items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载冻结题面…</div>
  if (error || !data || !currentScene) return <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700"><CircleAlert className="mx-auto mb-3 h-8 w-8" /><p role="alert">{error || '题包内容暂时无法加载'}</p><button type="button" onClick={() => navigate(embeddedCompletionPath || (publicMode ? '/' : '/student/situational'))} className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm">返回上一页</button></div>

  const visualRequired = visualItems.length > 0
  const visualBusy = visualRequired && visualState.status !== 'ready'
  const videoRequired = currentScene.stimulus.type === 'VIDEO'
  const videoBusy = videoRequired && readyVideoSceneKey !== currentScene.sceneKey
  const mediaBusy = visualBusy || videoBusy
  const renderStimulus = () => {
    const textBlock = currentScene.stimulus.text
      ? <div className="mt-5 rounded-xl bg-slate-50 p-5 text-base leading-8 text-slate-800">{currentScene.stimulus.text}</div>
      : null
    if (currentScene.stimulus.type === 'TEXT_V1') return textBlock
    if (currentScene.stimulus.type === 'VIDEO') {
      return (
        <>
          {textBlock}
          <SituationalVideoPresentation
            sceneKey={currentScene.sceneKey}
            presentation={currentScene.stimulus.presentation}
            loadSources={loadVideoSources}
            onReadyChange={handleVideoReadyChange}
          />
        </>
      )
    }
    return (
      <>
        {textBlock}
        <AssessmentImagePresentation
          items={visualItems}
          state={visualState}
          ordered={currentScene.stimulus.type === 'COMIC'}
          ariaLabel={currentScene.stimulus.type === 'COMIC' ? '漫画分镜' : '视觉内容'}
        />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><Sparkles className="h-5 w-5" /></div><div><h1 className="font-semibold text-gray-900">文字情境测评</h1><p className="text-xs text-gray-500">{data.attempt.instrumentKey} · v{data.attempt.instrumentVersion}</p></div></div>
        <div className="text-left text-sm text-gray-600 sm:text-right"><div>已完成 {answeredCount} / {totalResponses} 个必答通道</div><div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 sm:w-48"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div></div>
      </div>

      {notice && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>}

      <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-8" aria-labelledby="situational-scene-title">
        <div className="mb-5 flex items-center justify-between gap-4 text-sm text-gray-500"><span>情境 {currentIndex + 1} / {scenes.length}</span><span>{sceneIsComplete(data.instrument.definition, currentIndex, responses) ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />已完成</span> : '待完成'}</span></div>
        <h2 id="situational-scene-title" className="text-xl font-semibold text-gray-900">{currentScene.title}</h2>
        {renderStimulus()}

        <div className="mt-7 space-y-7">
          {currentScene.channels.map((channel) => {
            const answer = responseValueFor(responses, currentScene, channel)
            const fieldName = responseKey(currentScene.sceneKey, channel.channelKey)
            return (
              <fieldset key={channel.channelKey} className="space-y-3" disabled={saving || submitting || mediaBusy}>
                <legend className="text-base font-semibold text-gray-900">{channel.prompt}{channel.required === false ? <span className="ml-2 text-sm font-normal text-gray-500">（可选）</span> : null}</legend>
                {channel.responseType === 'SINGLE_CHOICE' && (channel.options ?? []).map((option) => (
                  <label key={option.optionKey} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${answer?.responseValue === option.optionKey ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-indigo-300'}`}>
                    <input type="radio" name={fieldName} value={option.optionKey} checked={answer?.responseValue === option.optionKey} onChange={() => void persistAnswer(currentScene, channel, option.optionKey)} className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500" aria-label={option.label} />
                    <span className="text-sm leading-6 text-gray-700">{option.label}</span>
                  </label>
                ))}
                {channel.responseType === 'CONTINUOUS' && channel.range && (
                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between text-sm text-gray-600"><span>当前值</span><strong className="text-indigo-700">{typeof answer?.responseValue === 'number' ? answer.responseValue : '未选择'}</strong></div>
                    <input type="range" min={channel.range.min} max={channel.range.max} step="any" value={typeof answer?.responseValue === 'number' ? answer.responseValue : channel.range.min} onChange={(event) => void persistAnswer(currentScene, channel, Number(event.target.value))} className="mt-4 w-full accent-indigo-600" aria-label={`${channel.prompt}，范围 ${channel.range.min} 到 ${channel.range.max}`} />
                    <div className="mt-2 flex justify-between text-xs text-gray-500"><span>最小值 {channel.range.min}</span><span>最大值 {channel.range.max}</span></div>
                  </div>
                )}
              </fieldset>
            )
          })}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0 || saving || submitting} className="inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeft className="h-4 w-4" />上一题</button>
        <div className="flex gap-3">
          {currentIndex < scenes.length - 1 && <button type="button" onClick={() => setCurrentIndex((index) => Math.min(scenes.length - 1, index + 1))} disabled={saving || submitting || mediaBusy} className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">下一题<ChevronRight className="h-4 w-4" /></button>}
          <button type="button" onClick={() => void submit()} disabled={saving || submitting || mediaBusy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{submitting ? '提交中…' : '提交测评'}</button>
        </div>
      </div>

      <nav aria-label="情境导航" className="rounded-xl bg-white p-4 shadow-sm"><div className="mb-3 text-sm font-medium text-gray-700">情境导航</div><div className="flex flex-wrap gap-2">{scenes.map((scene, index) => <button key={scene.sceneKey} type="button" onClick={() => setCurrentIndex(index)} disabled={saving || submitting} aria-label={`情境 ${index + 1}${sceneCompletion[index] ? '，已完成' : '，未完成'}`} aria-current={currentIndex === index ? 'step' : undefined} className={`h-9 w-9 rounded-lg text-sm font-medium transition ${currentIndex === index ? 'bg-indigo-600 text-white' : sceneCompletion[index] ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{index + 1}</button>)}</div></nav>
    </div>
  )
}

export default SituationalRunner