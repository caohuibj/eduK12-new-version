import { situationalBasePath } from '../paths'
import { situationalHistoryIdentities, invalidateChangedSituationalHistory } from '../history'
import { researchEventsFromTrials, missingResearchExposureEvents, appendResearchEvents, currentResponseStage, eventTime, researchCapture, researchEnabled, restoreResearchAnswers, type SituationalResearchEvent } from '../research'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Loader2, Send } from 'lucide-react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AssessmentShell,
  type AssessmentInteractionReadiness,
  type AssessmentProgress,
  type AssessmentRecoveryState,
  type AssessmentSaveStatus,
  type AssessmentSubmissionStatus,
} from '../../../components/assessment-shell'
import { embeddedSituationalApi, publicEmbeddedSituationalApi, situationalApi, type SituationalRunnerClient } from '../api'
import {
  ensureSituationalDraft,
  firstMissingSceneIndex,
  pruneSituationalDraftResponses,
  pruneUnreachableSituationalResponses,
  readSituationalDraft,
  responseKey,
  sceneIsComplete,
  situationalDraftKey,
  situationalErrorMessage,
  situationalReadyToSubmit,
  situationalResponsesFromDraft,
} from '../draft'
import { deriveReachableTrajectory, reachableSituationalScenes } from '../traversal'
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
import SituationalVideoPresentation, { type SituationalVideoGateStatus } from '../SituationalVideoPresentation'
import { resolveSituationalRunnerRouteContext } from '../runner-context'

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

const TERMINAL_RECOVERED_CODE = 'FINAL_TERMINAL_RECOVERED'

type VideoGateState = {
  sceneKey: string
  status: SituationalVideoGateStatus
  message?: string
}

export interface SchoolEmbeddedSituationalProps {
  attemptId:string
  parentAttemptId:string
  compositeItemId:string
  client:SituationalRunnerClient
  onCompleted:()=>void
}
const SituationalRunner: React.FC<{campus?:SchoolEmbeddedSituationalProps}> = ({campus}) => {
  const { instrumentKey, attemptId:routeAttemptId } = useParams<{ instrumentKey?: string; attemptId?: string }>()
  const attemptId=campus?.attemptId||routeAttemptId
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const routeContext = useMemo(() => {
    const normal=resolveSituationalRunnerRouteContext({
      pathname:location.pathname,searchParams,attemptId,
    })
    if(!campus)return normal
    return {...normal,embedded:true,publicMode:false,
      compositeAttemptId:campus.parentAttemptId,
      compositeItemId:campus.compositeItemId,
      completionPath:'',returnTo:'',recoveryStorageKey:null}
  },[attemptId,location.pathname,searchParams,campus?.parentAttemptId,campus?.compositeItemId])
  const {
    publicMode,
    embedded,
    compositeAttemptId,
    compositeItemId,
    completionPath: embeddedCompletionPath,
    recoveryStorageKey,
  } = routeContext
  const recoveryToken = useMemo(() => {
    if (!recoveryStorageKey || typeof window === 'undefined') return ''
    return window.sessionStorage.getItem(recoveryStorageKey) || ''
  }, [recoveryStorageKey])
  const client = useMemo<SituationalRunnerClient | null>(() => {
    if(campus)return campus.client
    if (embedded) {
      if (!compositeAttemptId || !compositeItemId) return null
      return publicMode
        ? publicEmbeddedSituationalApi(compositeAttemptId, compositeItemId, recoveryToken)
        : embeddedSituationalApi(compositeAttemptId, compositeItemId)
    }
    return situationalApi
  }, [compositeAttemptId, compositeItemId, embedded, publicMode, recoveryToken, campus?.client])

  const [data, setData] = useState<SituationalAttemptResponse | null>(null)
  const [continuousInputs, setContinuousInputs] = useState<Record<string, number>>({})
  const [responses, setResponses] = useState<Record<string, SituationalDraftAnswer>>({})
  const responsesRef = useRef<Record<string, SituationalDraftAnswer>>({})
  const [researchEvents, setResearchEvents] = useState<SituationalResearchEvent[]>([])
  const researchEventsRef = useRef<SituationalResearchEvent[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submissionLocked, setSubmissionLocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<AssessmentSaveStatus>({ state: 'idle' })
  const [recoveryState, setRecoveryState] = useState<AssessmentRecoveryState>({ state: 'none' })
  const [videoGate, setVideoGate] = useState<VideoGateState | null>(null)
  const lastExposureRef = useRef<string | null>(null)
  const stageInputsRef = useRef<HTMLDivElement>(null)
  const focusedStageRef = useRef<string | null>(null)
  const sceneStartedAt = useRef(Date.now())
  const submittingRef = useRef(false)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSavesRef = useRef(0)

  useEffect(() => {
    responsesRef.current = responses
  }, [responses])

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
          if(campus)campus.onCompleted()
          else navigate(embeddedCompletionPath || `${situationalBasePath()}/attempts/${next.attempt.id}/result`, { replace: true })
          return
        }
        const meta = await ensureSituationalDraft(next.attempt)
        const storedResponses = await readSituationalDraft(next.attempt)
        const restoredEvents = researchEnabled(next) ? researchEventsFromTrials(await finalDraftStore.listTrials(situationalDraftKey(next.attempt.id))) : []
        const restoredResponses = restoreResearchAnswers(next, storedResponses, restoredEvents)
        researchEventsRef.current = restoredEvents
        setResearchEvents(restoredEvents)
        const locked = meta.status !== 'DRAFT' || Boolean(meta.sealedSubmission)
        const localResponses = !locked
          ? await pruneSituationalDraftResponses(next.attempt, next.instrument.definition, restoredResponses)
          : restoredResponses
        if (cancelled) return
        responsesRef.current = localResponses
        setData(next)
        setResponses(localResponses)
        setSubmissionLocked(locked)
        setSaveStatus({ state: 'idle' })
        if (locked) {
          const message = meta.sealedSubmission
            ? '这次测评已有一份已封存提交；答案已锁定，再次提交只会重放相同内容。'
            : '检测到旧版未确认提交；答案已锁定，请先核对服务器结果，不能重新生成提交内容。'
          setNotice(message)
          setRecoveryState({ state: 'blocked', message })
        } else if (Object.keys(localResponses).length > 0) {
          setRecoveryState({ state: 'resumed', message: '已从本机恢复此前确认保存的情境作答。' })
        } else {
          setRecoveryState({ state: 'none' })
        }
        const reachableScenes = reachableSituationalScenes(next.instrument.definition, localResponses)
        const missingIndex = firstMissingSceneIndex(next.instrument.definition, localResponses)
        const histories = situationalHistoryIdentities(next.instrument.definition, localResponses)
        const pendingStageIndex = next.instrument.definition.schemaVersion === 2 ? reachableScenes.findIndex(scene => {
          const node = next.instrument.definition.schemaVersion === 2 ? next.instrument.definition.flow.nodes.find(n => n.nodeType === 'SCENE' && n.sceneKey === scene.sceneKey) : undefined
          return node?.nodeType === 'SCENE' && Boolean(currentResponseStage(node, histories[scene.sceneKey] ?? '[]', restoredEvents))
        }) : -1
        setCurrentIndex(
          pendingStageIndex >= 0
            ? pendingStageIndex
            : missingIndex >= 0
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
  const trajectory = useMemo(() => (
    data ? deriveReachableTrajectory(data.instrument.definition, responses) : { nodeKeys: [], sceneKeys: [], terminalNodeKey: null }
  ), [data, responses])
  const currentScene = scenes[currentIndex]
  const responseSceneComplete = Boolean(data && currentScene && sceneIsComplete(data.instrument.definition, currentIndex, responses))
  const currentFlowNode = useMemo(() => {
    if (!data || data.instrument.definition.schemaVersion !== 2) return null
    const nodeKey = trajectory.nodeKeys[currentIndex]
    const node = data.instrument.definition.flow.nodes.find((candidate) => candidate.nodeKey === nodeKey)
    return node?.nodeType === 'SCENE' ? node : null
  }, [currentIndex, data, trajectory.nodeKeys])
  const currentHistory = data && currentScene ? situationalHistoryIdentities(data.instrument.definition, responses)[currentScene.sceneKey] ?? '[]' : '[]'
  const responseStage = currentResponseStage(currentFlowNode, currentHistory, researchEvents)
  const currentSceneComplete = responseSceneComplete && (!currentFlowNode?.responseStages || !responseStage)
  const visibleChannels = currentScene?.channels.filter(channel => !currentFlowNode?.responseStages || currentFlowNode.responseStages.some(stage => stage.channelKeys.includes(channel.channelKey) && (stage.stageKey === responseStage?.stageKey || researchEvents.some(e => e.type === 'STAGE_CONFIRMED' && e.nodeKey === currentFlowNode.nodeKey && e.stageKey === stage.stageKey && e.historyIdentity === currentHistory)))) ?? []
  const videoSceneKey = currentScene?.stimulus.type === 'VIDEO' ? currentScene.sceneKey : ''
  const videoSlotKey = currentScene?.stimulus.type === 'VIDEO'
    ? (currentFlowNode?.nodeKey || currentScene.sceneKey)
    : ''

  useEffect(() => {
    setVideoGate(videoSceneKey ? { sceneKey: videoSceneKey, status: 'checking' } : null)
  }, [videoSceneKey, videoSlotKey])

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
  const handleVideoGateChange = useCallback((sceneKey: string, status: SituationalVideoGateStatus, message?: string) => {
    setVideoGate((current) => {
      if (videoSceneKey && sceneKey !== videoSceneKey) return current
      return { sceneKey, status, message }
    })
  }, [videoSceneKey])

  const visualRequired = visualItems.length > 0
  const visualBusy = visualRequired && visualState.status !== 'ready'
  const videoRequired = currentScene?.stimulus.type === 'VIDEO'
  const currentVideoGate = videoRequired && videoGate?.sceneKey === currentScene.sceneKey ? videoGate : null
  const videoBusy = Boolean(videoRequired && currentVideoGate?.status !== 'ready')
  const mediaBusy = visualBusy || videoBusy

  useEffect(() => {
    if (!data || !currentScene || !currentFlowNode || !researchEnabled(data) || mediaBusy || submissionLocked || submittingRef.current) return
    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      const events = researchEventsRef.current
      const historyIdentity = situationalHistoryIdentities(data.instrument.definition, responsesRef.current)[currentScene.sceneKey]
      if (!historyIdentity) return // A queued presentation can become unreachable after an upstream edit.
      const additions: SituationalResearchEvent[] = []
      const exposure = `${currentFlowNode.nodeKey}:${historyIdentity}`
      if (lastExposureRef.current !== exposure) additions.push({ type: 'NODE_EXPOSED', nodeKey: currentFlowNode.nodeKey, historyIdentity, relativeTimeMs: eventTime(data, events) })
      const stage = currentResponseStage(currentFlowNode, historyIdentity, events)
      if (stage && stage.kind !== 'CHOICE' && !events.some(e => e.type === 'PROBE_EXPOSED' && e.nodeKey === currentFlowNode.nodeKey && e.historyIdentity === historyIdentity && e.stageKey === stage.stageKey)) additions.push({ type: 'PROBE_EXPOSED', nodeKey: currentFlowNode.nodeKey, historyIdentity, stageKey: stage.stageKey, relativeTimeMs: eventTime(data, events) })
      const updated = await appendResearchEvents(data, events, additions)
      researchEventsRef.current = updated
      lastExposureRef.current = exposure
      if (additions.length) setResearchEvents(updated)
    })
    saveQueueRef.current = operation.catch(reason => { setNotice(situationalErrorMessage(reason)); setSaveStatus({ state: 'error', message: situationalErrorMessage(reason) }) })
  }, [data, currentScene, currentFlowNode, currentHistory, responseStage?.stageKey, mediaBusy, submissionLocked])

  useEffect(() => {
    if (!responseStage || mediaBusy || submissionLocked || saving) return
    const identity = `${currentFlowNode?.nodeKey}:${currentHistory}:${responseStage.stageKey}`
    if (focusedStageRef.current === identity) return
    const input = stageInputsRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')
    if (input) { input.focus(); focusedStageRef.current = identity }
  }, [currentFlowNode?.nodeKey, currentHistory, responseStage?.stageKey, mediaBusy, submissionLocked, saving])

  const interactionReadiness = useMemo<AssessmentInteractionReadiness>(() => {
    if (visualRequired && visualState.status === 'error') {
      return { state: 'blocked', message: '视觉内容加载失败。请重试加载后再继续作答。' }
    }
    if (videoRequired && currentVideoGate?.status === 'error') {
      return { state: 'blocked', message: currentVideoGate.message || '视频题面暂时无法使用，请重试。' }
    }
    if (videoRequired && currentVideoGate?.status === 'blocked') {
      return { state: 'blocked', message: currentVideoGate.message || '请完整观看当前必看视频后继续。' }
    }
    if (visualBusy || (videoRequired && (!currentVideoGate || currentVideoGate.status === 'checking'))) {
      return { state: 'preparing', message: videoRequired ? '正在准备并核对当前必看视频。' : '正在准备当前视觉内容。' }
    }
    return { state: 'ready' }
  }, [currentVideoGate, videoRequired, visualBusy, visualRequired, visualState.status])

  const shellProgress = useMemo<AssessmentProgress | undefined>(() => {
    if (!data || !currentScene) return undefined
    if (data.instrument.definition.schemaVersion === 1) {
      return {
        kind: 'position',
        current: currentIndex + 1,
        total: scenes.length,
        label: '情境进度',
      }
    }
    const currentParts = [currentFlowNode?.roundKey, currentFlowNode?.stepKey, currentScene.title].filter(Boolean)
    return {
      kind: 'open-path',
      visited: currentIndex + (currentSceneComplete ? 1 : 0),
      current: currentParts.join(' · '),
      label: '当前开放路径',
    }
  }, [currentFlowNode?.roundKey, currentFlowNode?.stepKey, currentIndex, currentScene, currentSceneComplete, data, scenes.length])

  const submissionStatus = useMemo<AssessmentSubmissionStatus>(() => {
    if (submitting) return { state: 'submitting', message: '答案已锁定，正在提交同一份封存 FINAL。' }
    if (submissionLocked) return { state: 'pending', message: '答案保持锁定；再次操作只会核对或重放同一份提交。' }
    return { state: 'ready' }
  }, [submissionLocked, submitting])

  const persistAnswer = (
    scene: SituationalRunnerScene,
    channel: SituationalRunnerChannel,
    responseValue: string | number,
  ): Promise<void> => {
    if (!data || submitting || submissionLocked) return Promise.resolve()
    const currentData = data
    const key = responseKey(scene.sceneKey, channel.channelKey)
    const answeredAt = new Date().toISOString()
    const responseTimeMs = Math.max(0, Date.now() - sceneStartedAt.current)

    pendingSavesRef.current += 1
    setSaving(true)
    setSaveStatus({ state: 'saving', message: '正在把最新作答安全保存到本机。' })

    const operation = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const previous = responsesRef.current
        if (previous[key]?.responseValue === responseValue) return
        const definition = currentData.instrument.definition
        const node = definition.schemaVersion === 2 ? definition.flow.nodes.find(n => n.nodeType === 'SCENE' && n.sceneKey === scene.sceneKey) : undefined
        const historyIdentity = situationalHistoryIdentities(definition, previous)[scene.sceneKey] ?? '[]'
        const stage = node?.nodeType === 'SCENE' ? currentResponseStage(node, historyIdentity, researchEventsRef.current) : null
        if (node?.nodeType === 'SCENE' && node.responseStages && !stage?.channelKeys.includes(channel.channelKey)) throw new Error('已确认的作答不能在后续信息披露后修改。')
        const answer: SituationalDraftAnswer = {
          responseValue, responseTimeMs, answeredAt,
          ...(definition.schemaVersion === 2 ? { historyIdentity, responseRevision: (previous[key]?.responseRevision ?? 0) + 1 } : {}),
        }
        const invalidated = invalidateChangedSituationalHistory(definition, previous, { ...previous, [key]: answer })
        setContinuousInputs(current => { const updated = { ...current }; invalidated.staleKeys.forEach(k => delete updated[k]); return updated })
        if (researchEnabled(currentData) && node?.nodeType === 'SCENE') {
          const time = eventTime(currentData, researchEventsRef.current)
          const additions: SituationalResearchEvent[] = [...missingResearchExposureEvents(currentData, node, historyIdentity, researchEventsRef.current), ...invalidated.staleKeys.flatMap(staleKey => {
            const old = previous[staleKey], staleScene = staleKey.slice(0, staleKey.indexOf(':'))
            const staleNode = definition.schemaVersion === 2 ? definition.flow.nodes.find(n => n.nodeType === 'SCENE' && n.sceneKey === staleScene) : undefined
            return old && staleNode ? [{ type: 'RESPONSE_INVALIDATED' as const, nodeKey: staleNode.nodeKey, channelKey: staleKey.slice(staleKey.indexOf(':') + 1), historyIdentity: old.historyIdentity ?? '[]', relativeTimeMs: time }] : []
          })]
          additions.push({ type: previous[key] ? 'RESPONSE_CHANGED' : 'RESPONSE_FIRST_COMMITTED', nodeKey: node.nodeKey, channelKey: channel.channelKey, responseValue, responseRevision: answer.responseRevision, historyIdentity, relativeTimeMs: time, ...(stage ? { stageKey: stage.stageKey } : {}) })
          const events = await appendResearchEvents(currentData, researchEventsRef.current, additions)
          researchEventsRef.current = events; setResearchEvents(events)
          // The durable journal is authoritative even if the answer-cache write below fails.
          responsesRef.current = invalidated.responses
          setResponses(invalidated.responses)
          const nextScenes = reachableSituationalScenes(definition, invalidated.responses)
          setCurrentIndex(index => Math.min(index, Math.max(0, nextScenes.length - 1)))
        }
        await finalDraftStore.putAnswer({
          draftKey: situationalDraftKey(currentData.attempt.id),
          itemKey: key,
          value: answer,
          updatedAt: Date.now(),
        })
        const nextResponses = await pruneSituationalDraftResponses(
          currentData.attempt,
          currentData.instrument.definition,
          { ...previous, [key]: answer },
          previous,
        )
        responsesRef.current = nextResponses
        const nextScenes = reachableSituationalScenes(currentData.instrument.definition, nextResponses)
        setResponses(nextResponses)
        setCurrentIndex((index) => Math.min(index, Math.max(0, nextScenes.length - 1)))
        setNotice(null)
      })

    const tracked = operation
      .then(() => {
        if (pendingSavesRef.current === 1) {
          setSaveStatus({ state: 'saved', message: '最新作答已保存到本机。' })
        }
      })
      .catch((reason) => {
        const message = situationalErrorMessage(reason)
        setNotice(message)
        setSaveStatus({ state: 'error', message })
      })
      .finally(() => {
        pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1)
        if (pendingSavesRef.current === 0) setSaving(false)
      })

    saveQueueRef.current = tracked.catch(() => undefined)
    return tracked
  }

  const confirmStage = async () => {
    if (!data || !currentScene || !currentFlowNode || !responseStage || pendingSavesRef.current > 0 || saving || submitting || submissionLocked || mediaBusy) return
    if (responseStage.channelKeys.some(key => currentScene.channels.find(c => c.channelKey === key)?.required !== false && !responsesRef.current[responseKey(currentScene.sceneKey, key)])) { setNotice('请完成当前阶段的必答问题。'); return }
    setSaving(true)
    const operation = saveQueueRef.current.catch(() => undefined).then(async () => {
      const additions: SituationalResearchEvent[] = [...missingResearchExposureEvents(data, currentFlowNode, currentHistory, researchEventsRef.current), { type: 'STAGE_CONFIRMED', nodeKey: currentFlowNode.nodeKey, stageKey: responseStage.stageKey, historyIdentity: currentHistory, relativeTimeMs: eventTime(data, researchEventsRef.current) }]
      if (currentFlowNode.responseStages?.[currentFlowNode.responseStages.length - 1]?.stageKey === responseStage.stageKey) additions.push({ type: 'NODE_CONFIRMED', nodeKey: currentFlowNode.nodeKey, historyIdentity: currentHistory, relativeTimeMs: eventTime(data, researchEventsRef.current) })
      const updated = await appendResearchEvents(data, researchEventsRef.current, additions)
      const next = pruneUnreachableSituationalResponses(data.instrument.definition, restoreResearchAnswers(data, responsesRef.current, updated)).responses
      researchEventsRef.current = updated; setResearchEvents(updated)
      responsesRef.current = next; setResponses(next); setNotice(null)
      for (const channelKey of responseStage.channelKeys) {
        const key = responseKey(currentScene.sceneKey, channelKey)
        if (next[key]) { await finalDraftStore.putAnswer({ draftKey: situationalDraftKey(data.attempt.id), itemKey: key, value: next[key], updatedAt: Date.now() }) }
      }
    })
    saveQueueRef.current = operation.catch(reason => setNotice(situationalErrorMessage(reason))).finally(() => setSaving(false))
    await saveQueueRef.current
  }

  const recoverTerminalResult = async (): Promise<boolean> => {
    if (!data || !client) return false
    try {
      const response = await client.result(data.attempt.id)
      const next = apiDataOrThrow(response)
      if (next.attempt.status !== 'COMPLETED') return false
      await finalDraftStore.delete(situationalDraftKey(data.attempt.id)).catch(() => undefined)
      if(campus)campus.onCompleted()
      else navigate(embeddedCompletionPath || `${situationalBasePath()}/attempts/${data.attempt.id}/result`, { replace: true })
      return true
    } catch {
      return false
    }
  }

  const submit = async () => {
    if (!data || !client || submitting || submittingRef.current || saving || pendingSavesRef.current > 0 || mediaBusy) {
      if (pendingSavesRef.current > 0) setNotice('正在保存最新作答，保存完成后再提交。')
      return
    }
    const missingIndex = firstMissingSceneIndex(data.instrument.definition, responsesRef.current)
    if (missingIndex >= 0 && !submissionLocked) {
      setCurrentIndex(missingIndex)
      setNotice('还有必答通道未完成，请补充后再提交。')
      return
    }
    if (!submissionLocked && data.instrument.definition.schemaVersion === 2 && data.instrument.definition.flow.nodes.some(node => node.nodeType === 'SCENE' && node.responseStages && trajectory.nodeKeys.includes(node.nodeKey) && currentResponseStage(node, situationalHistoryIdentities(data.instrument.definition, responsesRef.current)[node.sceneKey] ?? '[]', researchEventsRef.current))) { setNotice('请先确认当前阶段的作答。'); return }
    if (!submissionLocked && !situationalReadyToSubmit(data.instrument.definition, responsesRef.current)) {
      setNotice('当前分支尚未到达可提交的结束节点，请完成当前决策路径。')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setNotice(null)
    const draftKey = situationalDraftKey(data.attempt.id)
    try {
      // Include presentation writes already queued before sealing the immutable FINAL.
      await saveQueueRef.current
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
            ...(typeof value.historyIdentity === 'string' ? { historyIdentity: value.historyIdentity } : {}),
            ...(typeof value.responseRevision === 'number' ? { responseRevision: value.responseRevision } : {}),
            ...(typeof value.stageConfirmed === 'boolean' ? { stageConfirmed: value.stageConfirmed } : {}),
          }
        })
        const events = researchEnabled(data) ? researchEventsFromTrials(snapshot.trials) : []
        const finalResponses = pruneUnreachableSituationalResponses(data.instrument.definition, restoreResearchAnswers(data, sealedResponses, events)).responses
        if (data.instrument.definition.schemaVersion === 2) {
          const histories = situationalHistoryIdentities(data.instrument.definition, finalResponses)
          for (const node of data.instrument.definition.flow.nodes) if (node.nodeType === 'SCENE' && histories[node.sceneKey] && currentResponseStage(node, histories[node.sceneKey]!, events)) throw new Error('本地阶段确认记录尚未完成，请返回并确认作答。')
        }
        if (!situationalReadyToSubmit(data.instrument.definition, finalResponses)) {
          throw new Error('本地持久化的情境作答尚未达到可提交终点，请确认最后一次作答已经保存')
        }
        return {
          submissionId: snapshot.meta.submissionId,
          attemptEpoch: snapshot.meta.attemptEpoch,
          definitionHash: snapshot.meta.definitionHash,
          instrumentVersion: data.attempt.instrumentVersion,
          compiledRuntimeHash: data.attempt.compiledRuntimeHash,
          scoringVersion: data.attempt.scoringVersion,
          ...(researchEnabled(data) ? { researchCapture: researchCapture(data, events) } : {}),
          responses: situationalResponsesFromDraft(data.instrument.definition, finalResponses),
        }
      })
      if (!sealed) throw new Error('本地作答草稿不存在，请返回后重新进入测评。')
      setSubmissionLocked(true)
      const response = await runFinalDraftCapacityRetry({
        onRetry: async ({ error: retryError }) => {
          if (await recoverTerminalResult()) {
            throw Object.assign(new Error('服务器已确认测评完成'), { code: TERMINAL_RECOVERED_CODE })
          }
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
      if(campus)campus.onCompleted()
      else navigate(embeddedCompletionPath || `${situationalBasePath()}/attempts/${data.attempt.id}/result`, { replace: true })
      void next
    } catch (reason) {
      if (String((reason as { code?: unknown })?.code ?? '') === TERMINAL_RECOVERED_CODE) return
      const recovered = await recoverTerminalResult()
      if (!recovered) {
        const currentMeta = await finalDraftStore.get(draftKey).catch(() => null)
        if (currentMeta?.sealedSubmission) setSubmissionLocked(true)
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
  if (error || !data || !currentScene) return <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700"><CircleAlert className="mx-auto mb-3 h-8 w-8" /><p role="alert">{error || '题包内容暂时无法加载'}</p><button type="button" onClick={() => campus ? campus.onCompleted() : navigate(embeddedCompletionPath || (publicMode ? '/' : situationalBasePath()))} className="mt-5 min-h-11 rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm">返回上一页</button></div>

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
            draftKey={situationalDraftKey(data.attempt.id)}
            sceneKey={currentScene.sceneKey}
            slotKey={videoSlotKey}
            presentation={currentScene.stimulus.presentation}
            loadSources={loadVideoSources}
            onGateChange={handleVideoGateChange}
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

  const actions = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
        disabled={currentIndex === 0 || saving || submitting}
        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft className="h-4 w-4" />上一题
      </button>
      <div className="flex flex-col gap-3 sm:flex-row">
        {currentIndex < scenes.length - 1 ? (
          <button
            type="button"
            onClick={() => setCurrentIndex((index) => Math.min(scenes.length - 1, index + 1))}
            disabled={saving || submitting || mediaBusy || !currentSceneComplete}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            下一题<ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || submitting || mediaBusy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />{submitting ? '提交中…' : submissionLocked ? '重新核对提交' : '提交测评'}
        </button>
      </div>
    </div>
  )

  const navigation = (
    <nav aria-label="情境导航" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="mb-3 text-sm font-medium text-gray-700">可达情境</div>
      <div className="flex flex-wrap gap-2">
        {scenes.map((scene, index) => (
          <button
            key={`${scene.sceneKey}:${index}`}
            type="button"
            onClick={() => setCurrentIndex(index)}
            disabled={saving || submitting || (Boolean(responseStage) && index > currentIndex)}
            aria-label={`情境 ${index + 1}${sceneIsComplete(data.instrument.definition, index, responses) ? '，已完成' : '，未完成'}`}
            aria-current={currentIndex === index ? 'step' : undefined}
            className={`min-h-11 min-w-11 rounded-lg px-3 text-sm font-medium transition ${currentIndex === index ? 'bg-indigo-600 text-white' : sceneIsComplete(data.instrument.definition, index, responses) ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </nav>
  )

  return (
    <AssessmentShell
      title={currentScene.title}
      eyebrow={embedded ? '综合测评 · 情境单元' : '情境化测评'}
      instructions={`冻结版本 ${data.attempt.instrumentVersion}。请根据当前可达情境完成作答；分支变化时，只保留当前路径上仍有效的答案。`}
      progress={shellProgress}
      saveStatus={saveStatus}
      submissionStatus={submissionStatus}
      recoveryState={recoveryState}
      interactionReadiness={interactionReadiness}
      actions={actions}
      navigation={navigation}
    >
      {notice ? <div role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div> : null}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-8" aria-labelledby="situational-scene-content-title">
        <div className="mb-5 flex items-center justify-between gap-4 text-sm text-gray-500">
          <span>{data.instrument.definition.schemaVersion === 1 ? `情境 ${currentIndex + 1} / ${scenes.length}` : '开放路径中的当前情境'}</span>
          <span>{currentSceneComplete ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />已完成</span> : '待完成'}</span>
        </div>
        <h2 id="situational-scene-content-title" className="text-base font-semibold text-gray-900">情境内容</h2>
        {renderStimulus()}

        {responseStage ? <p role="status" className="mt-5 text-sm text-gray-600">{responseStage.kind === 'CHOICE' ? '确认行动选择后，将展示后续问题。确认后的行动选择将锁定。' : '请根据已看到的信息回答本阶段问题。'}</p> : null}
        <div ref={stageInputsRef} className="mt-7 space-y-7">
          {visibleChannels.map((channel) => {
            const answer = responseValueFor(responses, currentScene, channel)
            const fieldName = responseKey(currentScene.sceneKey, channel.channelKey)
            return (
              <fieldset key={fieldName} className="space-y-3" disabled={submitting || mediaBusy || submissionLocked || Boolean(currentFlowNode?.responseStages?.some(stage => stage.channelKeys.includes(channel.channelKey) && stage.stageKey !== responseStage?.stageKey))}>
                <legend className="text-base font-semibold text-gray-900">{channel.prompt}{channel.required === false ? <span className="ml-2 text-sm font-normal text-gray-500">（可选）</span> : null}</legend>
                {channel.responseType === 'SINGLE_CHOICE' && (channel.options ?? []).map((option) => (
                  <label key={option.optionKey} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${answer?.responseValue === option.optionKey ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-indigo-300'}`}>
                    <input type="radio" name={fieldName} value={option.optionKey} checked={answer?.responseValue === option.optionKey} onChange={() => void persistAnswer(currentScene, channel, option.optionKey)} className="mt-1 h-5 w-5 text-indigo-600 focus:ring-indigo-500" aria-label={option.label} />
                    <span className="text-sm leading-6 text-gray-700">{option.label}</span>
                  </label>
                ))}
                {channel.responseType === 'FREE_TEXT' ? <textarea aria-label={channel.prompt} maxLength={channel.maxLength} defaultValue={typeof answer?.responseValue === 'string' ? answer.responseValue : ''} onBlur={event => { void persistAnswer(currentScene, channel, event.currentTarget.value) }} className="min-h-24 w-full rounded-lg border p-3" /> : null}
                {channel.responseType === 'CONTINUOUS' && channel.range ? (
                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between text-sm text-gray-600"><span>当前值</span><strong className="text-indigo-700">{typeof answer?.responseValue === 'number' ? answer.responseValue : '未选择'}</strong></div>
                    <input type="range" min={channel.range.min} max={channel.range.max} step="any" value={researchEnabled(data) ? continuousInputs[fieldName] ?? (typeof answer?.responseValue === 'number' ? answer.responseValue : channel.range.min) : typeof answer?.responseValue === 'number' ? answer.responseValue : channel.range.min} onChange={(event) => { const value = Number(event.target.value); if (researchEnabled(data)) setContinuousInputs(current => ({ ...current, [fieldName]: value })); else void persistAnswer(currentScene, channel, value) }} onPointerUp={(event) => { if (researchEnabled(data)) void persistAnswer(currentScene, channel, Number(event.currentTarget.value)) }} onBlur={(event) => { if (researchEnabled(data) && continuousInputs[fieldName] !== undefined) void persistAnswer(currentScene, channel, Number(event.currentTarget.value)) }} onKeyUp={(event) => { if (researchEnabled(data) && event.key === 'Enter') void persistAnswer(currentScene, channel, Number(event.currentTarget.value)) }} className="mt-4 min-h-11 w-full accent-indigo-600" aria-label={`${channel.prompt}，范围 ${channel.range.min} 到 ${channel.range.max}`} />
                    <div className="mt-2 flex justify-between text-xs text-gray-500"><span>最小值 {channel.range.min}</span><span>最大值 {channel.range.max}</span></div>
                  </div>
                ) : null}
              </fieldset>
            )
          })}
        </div>
        {responseStage ? <button type="button" onClick={() => void confirmStage()} disabled={saving || submitting || mediaBusy || submissionLocked} className="mt-6 min-h-11 rounded-lg bg-indigo-600 px-5 py-2 text-white disabled:opacity-50">{responseStage.kind === 'CHOICE' ? '确认行动选择' : '确认本阶段作答'}</button> : null}
      </section>
    </AssessmentShell>
  )
}

export default SituationalRunner
