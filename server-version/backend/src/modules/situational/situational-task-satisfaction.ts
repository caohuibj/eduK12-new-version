import type { CanonicalUnitResultCoreV1 } from '../assessment-runtime/unit-result'
import type { SituationRuntimeDefinition } from './situation-runtime-definition'
import type { SituationalResponse } from './situation-scoring'

export const SJT_ONLINE_PROTOCOL_FLAG = 'sjt_online_response_v1'
export const SJT_ONLINE_UNSATISFIED_FLAG = 'sjt_online_task_not_satisfied'

/** Completion and task qualification are distinct. Optional refusal does not
 * block qualification, but required refusal and an entirely empty submission do. */
export function onlineSituationalTaskSatisfied(definition: SituationRuntimeDefinition, responses: SituationalResponse[], requiredQuestionKeys: string[]): boolean {
  const byPair = new Map(responses.map(response => [`${response.sceneKey}:${response.channelKey}`, response]))
  const required = new Set(requiredQuestionKeys)
  let substantive = false
  let requiredSatisfied = true
  for (const scene of definition.scenes) for (const channel of scene.channels) {
    const response = byPair.get(`${scene.sceneKey}:${channel.channelKey}`)
    const nonanswer = channel.responseType === 'SINGLE_CHOICE'
      && channel.options.some(option => option.optionKey === response?.responseValue && option.nonanswerReason)
    const answered = Boolean(response && !nonanswer)
    substantive ||= answered
    if (required.has(channel.channelKey) && !answered) requiredSatisfied = false
  }
  return substantive && requiredSatisfied
}

/** Only the new server-owned protocol marker activates this qualification. */
export function onlineSituationalCanonicalTaskSatisfaction(core: Pick<CanonicalUnitResultCoreV1, 'unitType' | 'quality'>): 'SATISFIED' | 'NOT_SATISFIED' | null {
  if (core.unitType !== 'SITUATIONAL' || !core.quality.flags.includes(SJT_ONLINE_PROTOCOL_FLAG)) return null
  return core.quality.flags.includes(SJT_ONLINE_UNSATISFIED_FLAG) ? 'NOT_SATISFIED' : 'SATISFIED'
}

export function mergeSituationalTaskSatisfaction(form: string | null, cores: Array<Pick<CanonicalUnitResultCoreV1, 'unitType' | 'quality'>>): 'SATISFIED' | 'NOT_SATISFIED' | null {
  const states = cores.map(onlineSituationalCanonicalTaskSatisfaction).filter(state => state !== null)
  if (form === 'NOT_SATISFIED' || states.includes('NOT_SATISFIED')) return 'NOT_SATISFIED'
  return form === 'SATISFIED' || states.length ? 'SATISFIED' : null
}

/** Optional units may finish without qualifying; they cannot block a parent task. */
export function mergeRequiredSituationalTaskSatisfaction(
  form: string | null,
  slots: Array<{ slotKey: string; required: boolean }>,
  payloads: Array<{ header: { slotKey: string }; envelope?: { core: Pick<CanonicalUnitResultCoreV1, 'unitType' | 'quality'> } }>,
): 'SATISFIED' | 'NOT_SATISFIED' | null {
  const required = new Set(slots.filter(slot => slot.required).map(slot => slot.slotKey))
  return mergeSituationalTaskSatisfaction(form, payloads.flatMap(payload =>
    required.has(payload.header.slotKey) && payload.envelope ? [payload.envelope.core] : []))
}
