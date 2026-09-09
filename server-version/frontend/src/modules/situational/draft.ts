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

export const expectedResponseKeys = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer> = {},
): string[] => reachableSituationalScenes(definition, responses)
  .flatMap((scene) => scene.channels.map((channel) => responseKey(scene.sceneKey, channel.channelKey)))

export const sceneIsComplete = (
  definition: SituationalRunnerDefinition,
  sceneIndex: number,
  responses: Record<string, SituationalDraftAnswer>,
): boolean => {
  const scene = reachableSituationalScenes(definition, responses)[sceneIndex]
  return Boolean(scene && scene.channels.every((channel) => responses[responseKey(scene.sceneKey, channel.channelKey)] !== undefined))
}

export const firstMissingSceneIndex = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): number => reachableSituationalScenes(definition, responses).findIndex((scene) => (
  scene.channels.some((channel) => responses[responseKey(scene.sceneKey, channel.channelKey)] === undefined)
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
  const reachableKeys = new Set(expectedResponseKeys(definition, responses))
  const staleKeys = Object.keys(responses).filter((key) => !reachableKeys.has(key))
  if (staleKeys.length === 0) return { responses, staleKeys }
  const next = { ...responses }
  staleKeys.forEach((key) => { delete next[key] })
  return { responses: next, staleKeys }
}

export const pruneSituationalDraftResponses = async (
  attempt: SituationalAttempt,
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): Promise<Record<string, SituationalDraftAnswer>> => {
  const pruned = pruneUnreachableSituationalResponses(definition, responses)
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
  if (existing && !isMatchingIdentity(existing, attempt)) {
    await finalDraftStore.delete(draftKey)
  }
  if (existing?.status === 'COMPLETED' && isMatchingIdentity(existing, attempt)) {
    await finalDraftStore.delete(draftKey)
  }
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
    }
  })
  return result
}

export const situationalErrorMessage = (error: unknown): string => {
  const value = error as { code?: unknown; message?: unknown; status?: number; statusCode?: number }
  const code = String(value?.code ?? '')
  if (code === 'INSTRUMENT_NOT_AVAILABLE') return '题包已不可用，请返回列表选择其他测评。'
  if (code === 'STALE_ATTEMPT' || code === 'DEFINITION_MISMATCH') return '测评版本已变更，请重新进入。'
  if (code === 'SUBMISSION_PAYLOAD_CONFLICT') return '这次提交与服务器已有记录不一致，请返回测评历史查看结果。'
  if (code === 'SUBMISSION_ALREADY_IN_PROGRESS') return '已有进行中的测评，正在恢复作答。'
  if (value?.status === 401 || value?.statusCode === 401) return '登录已过期，请重新登录。'
  if (typeof value?.message === 'string' && value.message.trim()) return value.message
  return '网络异常，请重试。'
}
