import { invalidateChangedSituationalHistory } from './history'
import {
  createFinalDraftMeta,
  finalDraftStore,
  type FinalDraftMeta,
} from '../../services/persistence/finalDraftStore'
import { checkpointId } from '../../services/persistence/checkpointTypes'
import { deriveReachableTrajectory, reachableSituationalScenes, situationalTrajectoryReachedTerminal } from './traversal'
import type {
  SituationalAttempt,
  SituationalDraftAnswer,
  SituationalResponse,
  SituationalRunnerDefinition,
} from './types'

export const situationalDraftKey = (attemptId: string): string => `situational:${attemptId}`

export const responseKey = (sceneKey: string, channelKey: string): string => `${sceneKey}:${channelKey}`

const allReachableResponseKeys = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer> = {},
): string[] => reachableSituationalScenes(definition, responses)
  .flatMap((scene) => scene.channels.map((channel) => responseKey(scene.sceneKey, channel.channelKey)))

/** Required reachable responses only; optional diagnostics do not reduce progress. */
export const expectedResponseKeys = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer> = {},
): string[] => reachableSituationalScenes(definition, responses)
  .flatMap((scene) => scene.channels.flatMap((channel) => (
    channel.required === false ? [] : [responseKey(scene.sceneKey, channel.channelKey)]
  )))

export const sceneIsComplete = (
  definition: SituationalRunnerDefinition,
  sceneIndex: number,
  responses: Record<string, SituationalDraftAnswer>,
): boolean => {
  const scene = reachableSituationalScenes(definition, responses)[sceneIndex]
  return Boolean(scene && scene.channels.every((channel) => (
    channel.required === false
    || responses[responseKey(scene.sceneKey, channel.channelKey)] !== undefined
  )))
}

export const firstMissingSceneIndex = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): number => reachableSituationalScenes(definition, responses).findIndex((scene) => (
  scene.channels.some((channel) => (
    channel.required !== false
    && responses[responseKey(scene.sceneKey, channel.channelKey)] === undefined
  ))
))

export const answeredResponseCount = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): number => expectedResponseKeys(definition, responses).filter((key) => responses[key] !== undefined).length

export const situationalReadyToSubmit = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): boolean => (
  firstMissingSceneIndex(definition, responses) === -1
  && situationalTrajectoryReachedTerminal(definition, responses)
)

export const pruneUnreachableSituationalResponses = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): { responses: Record<string, SituationalDraftAnswer>; staleKeys: string[] } => {
  if (definition.schemaVersion === 1) return { responses, staleKeys: [] }
  // Optional diagnostics are still legitimate raw evidence when answered, so
  // pruning uses every reachable response surface rather than only required keys.
  const bound = invalidateChangedSituationalHistory(definition, responses, responses)
  responses = bound.responses
  const reachableKeys = new Set(allReachableResponseKeys(definition, responses))
  const staleKeys = [...new Set([...bound.staleKeys, ...Object.keys(responses).filter((key) => !reachableKeys.has(key))])]
  if (staleKeys.length === 0) return { responses, staleKeys }
  const next = { ...responses }
  staleKeys.forEach((key) => { delete next[key] })
  return { responses: next, staleKeys }
}

export const pruneSituationalDraftResponses = async (
  attempt: SituationalAttempt,
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
  previousResponses: Record<string, SituationalDraftAnswer> = responses,
): Promise<Record<string, SituationalDraftAnswer>> => {
  const history = invalidateChangedSituationalHistory(definition, previousResponses, responses)
  const reachable = pruneUnreachableSituationalResponses(definition, history.responses)
  const pruned = { responses: reachable.responses, staleKeys: [...history.staleKeys, ...reachable.staleKeys] }
  if (pruned.staleKeys.length > 0) {
    await finalDraftStore.deleteAnswers(situationalDraftKey(attempt.id), pruned.staleKeys)
  }
  return pruned.responses
}

export const situationalResponsesFromDraft = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): SituationalResponse[] => reachableSituationalScenes(definition, responses).flatMap((scene) => scene.channels.flatMap((channel) => {
  const answer = responses[responseKey(scene.sceneKey, channel.channelKey)]
  if (!answer) return []
  return [{
    sceneKey: scene.sceneKey,
    channelKey: channel.channelKey,
    responseValue: answer.responseValue,
    ...(answer.responseTimeMs === undefined ? {} : { responseTimeMs: answer.responseTimeMs }),
    ...(answer.answeredAt === undefined ? {} : { answeredAt: answer.answeredAt }),
    ...(answer.responseRevision === undefined ? {} : { responseRevision: answer.responseRevision }),
    ...(answer.historyIdentity === undefined ? {} : { historyIdentity: answer.historyIdentity }),
    ...(answer.stageConfirmed === undefined ? {} : { stageConfirmed: answer.stageConfirmed }),
  }]
}))

export const reachableSceneKeys = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): string[] => deriveReachableTrajectory(definition, responses).sceneKeys

const isMatchingIdentity = (meta: FinalDraftMeta, attempt: SituationalAttempt): boolean => (
  meta.instrument === 'situational'
  && meta.attemptId === attempt.id
  && meta.attemptEpoch === attempt.attemptEpoch
  && meta.definitionHash === attempt.definitionHash
  && meta.instrumentKey === attempt.instrumentKey
  && meta.instrumentVersion === attempt.instrumentVersion
  && meta.compiledRuntimeHash === attempt.compiledRuntimeHash
  && meta.deliveryMode === 'final_only'
)

export const ensureSituationalDraft = async (attempt: SituationalAttempt): Promise<FinalDraftMeta> => {
  const draftKey = situationalDraftKey(attempt.id)
  const existing = await finalDraftStore.get(draftKey)
  if (existing?.status === 'COMPLETED' && isMatchingIdentity(existing, attempt)) {
    await finalDraftStore.delete(draftKey)
  }
  // A mismatching frozen identity must fail closed in finalDraftStore.ensure().
  // Deleting the old draft here would destroy recoverable evidence and could
  // silently turn a conflict into a new logical FINAL.
  return finalDraftStore.ensure(createFinalDraftMeta({
    draftKey,
    instrument: 'situational',
    attemptId: attempt.id,
    attemptEpoch: attempt.attemptEpoch,
    definitionHash: attempt.definitionHash,
    instrumentKey: attempt.instrumentKey,
    instrumentVersion: attempt.instrumentVersion,
    compiledRuntimeHash: attempt.compiledRuntimeHash,
    contextSnapshotHash: null,
    deliveryMode: 'final_only',
    submissionId: existing && isMatchingIdentity(existing, attempt) && existing.status !== 'COMPLETED'
      ? existing.submissionId
      : checkpointId(),
  }))
}

export const readSituationalDraft = async (
  attempt: SituationalAttempt,
): Promise<Record<string, SituationalDraftAnswer>> => {
  const answers = await finalDraftStore.listAnswers(situationalDraftKey(attempt.id))
  const result: Record<string, SituationalDraftAnswer> = {}
  answers.forEach((answer) => {
    if (!answer.value || typeof answer.value !== 'object') return
    const value = answer.value as Partial<SituationalDraftAnswer>
    if (typeof value.responseValue !== 'string' && typeof value.responseValue !== 'number') return
    result[answer.itemKey] = {
      responseValue: value.responseValue,
      ...(typeof value.responseTimeMs === 'number' ? { responseTimeMs: value.responseTimeMs } : {}),
      ...(typeof value.answeredAt === 'string' ? { answeredAt: value.answeredAt } : {}),
      ...(typeof value.responseRevision === 'number' ? { responseRevision: value.responseRevision } : {}),
      ...(typeof value.historyIdentity === 'string' ? { historyIdentity: value.historyIdentity } : {}),
      ...(typeof value.stageConfirmed === 'boolean' ? { stageConfirmed: value.stageConfirmed } : {}),
    }
  })
  return result
}

export const situationalErrorMessage = (error: unknown): string => {
  const value = error as { code?: unknown; message?: unknown; status?: number; statusCode?: number }
  const code = String(value?.code ?? '')
  if (code === 'INSTRUMENT_NOT_AVAILABLE') return '题包已不可用，请返回列表选择其他测评。'
  if (code === 'FINAL_DRAFT_IDENTITY_CONFLICT') return '本地草稿与当前冻结测评身份不一致；草稿已保留，请返回后重新进入并核对。'
  if (code === 'FINAL_DRAFT_PENDING_WITHOUT_SEAL') return '检测到旧版未确认提交；请先核对服务器结果，不能重新生成提交内容。'
  if (code === 'FINAL_DRAFT_NOT_WRITABLE') return '该测评已经进入提交状态，不能继续修改答案。'
  if (code === 'STALE_ATTEMPT' || code === 'DEFINITION_MISMATCH') return '测评版本已变更，请重新进入。'
  if (code === 'SUBMISSION_PAYLOAD_CONFLICT') return '这次提交与服务器已有记录不一致，请返回测评历史查看结果。'
  if (code === 'SUBMISSION_ALREADY_IN_PROGRESS') return '已有进行中的测评，正在恢复作答。'
  if (value?.status === 401 || value?.statusCode === 401) return '登录已过期，请重新登录。'
  if (typeof value?.message === 'string' && value.message.trim()) return value.message
  return '网络异常，请重试。'
}