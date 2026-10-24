import { onlineAnswerComplete } from './online'
import type { SituationalDraftAnswer, SituationalRunnerChannel, SituationalRunnerScene } from './types'

type AnswerState = 'unanswered' | 'partial' | 'answered' | 'blank' | 'refused' | 'handled'
const labels: Record<AnswerState, string> = {
  unanswered: '未作答', partial: '部分作答', answered: '已作答', blank: '已留空', refused: '已选择不回答', handled: '已处理',
}

/** Presentation is separate from readiness: optional unanswered fields may be
 * skipped, but that permission is never evidence that the user answered them. */
export function situationalSceneAnswerStatus(scene: SituationalRunnerScene | undefined, responses: Record<string, SituationalDraftAnswer>) {
  const channels = scene?.channels ?? []
  const states = channels.map(channel => channelState(channel, responses[`${scene!.sceneKey}:${channel.channelKey}`]))
  let state: AnswerState = 'unanswered'
  if (states.length && states.every(value => value === 'answered')) state = 'answered'
  else if (states.length && states.every(value => value === 'blank')) state = 'blank'
  else if (states.length && states.every(value => value === 'refused')) state = 'refused'
  else if (states.length && states.every(value => value !== 'unanswered')) state = 'handled'
  else if (states.some(value => value !== 'unanswered')) state = 'partial'
  return { state, label: labels[state], answered: state === 'answered' }
}

function channelState(channel: SituationalRunnerChannel, answer?: SituationalDraftAnswer): Exclude<AnswerState, 'partial' | 'handled'> {
  if (!answer) return 'unanswered'
  if (answer.status === 'BLANK') return channel.required === false ? 'blank' : 'unanswered'
  if (answer.status === 'REFUSED') return channel.allowRefusal === true ? 'refused' : 'unanswered'
  if (channel.online && !onlineAnswerComplete(channel, answer)) return 'unanswered'
  const value = answer.responseValue
  return (Array.isArray(value) ? value.length > 0 : typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && value.trim().length > 0) ? 'answered' : 'unanswered'
}
