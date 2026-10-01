import type { SituationalAttemptResponse, SituationalDraftAnswer, SituationalRunnerBranchSceneNode } from './types'
import { finalDraftStore } from '../../services/persistence/finalDraftStore'

export interface SituationalResearchEvent {
  type: 'NODE_EXPOSED' | 'RESPONSE_FIRST_COMMITTED' | 'RESPONSE_CHANGED' | 'PROBE_EXPOSED' | 'STAGE_CONFIRMED' | 'NODE_CONFIRMED' | 'RESPONSE_INVALIDATED'
  nodeKey: string
  channelKey?: string
  responseValue?: string | number
  responseRevision?: number
  relativeTimeMs: number
  historyIdentity: string
  stageKey?: string
}
export interface SituationalResearchCapture {
  captureVersion: 'situational-capture-v1'
  definitionHash: string
  assignmentIdentity: string
  events: SituationalResearchEvent[]
}
export const RESEARCH_EVENT_LIMIT = 4096
export const researchEnabled = (data: SituationalAttemptResponse) => Boolean(data.instrument.assignment)
export const eventTime = (data: SituationalAttemptResponse, events: SituationalResearchEvent[]) => Math.max(events[events.length - 1]?.relativeTimeMs ?? 0, Date.now() - new Date(data.attempt.startedAt).getTime(), 0)
export const researchCapture = (data: SituationalAttemptResponse, events: SituationalResearchEvent[]): SituationalResearchCapture | undefined => data.instrument.assignment ? {
  captureVersion: 'situational-capture-v1', definitionHash: data.attempt.definitionHash,
  assignmentIdentity: data.instrument.assignment.assignmentIdentity, events,
} : undefined

export async function appendResearchEvents(data: SituationalAttemptResponse, events: SituationalResearchEvent[], additions: SituationalResearchEvent[]): Promise<SituationalResearchEvent[]> {
  if (!researchEnabled(data) || !additions.length) return events
  if (new TextEncoder().encode(JSON.stringify(researchCapture(data, [...events, ...additions]))).byteLength > 400 * 1024) throw new Error('本次研究记录已达到提交体积上限，请保存后联系研究负责人。')
  if (events.length + additions.length > RESEARCH_EVENT_LIMIT) throw new Error('本次研究交互记录已达到上限，请保存后联系研究负责人。')
  const draftKey = `situational:${data.attempt.id}`
  for (let i = 0; i < additions.length; i++) await finalDraftStore.putTrial({ draftKey, trialIndex: events.length + i, payload: additions[i], createdAt: Date.now() })
  return [...events, ...additions]
}

export function currentResponseStage(node: SituationalRunnerBranchSceneNode | null, historyIdentity: string, events: SituationalResearchEvent[]) {
  if (!node?.responseStages) return null
  return node.responseStages.find(s => !events.some(e => e.type === 'STAGE_CONFIRMED' && e.nodeKey === node.nodeKey && e.historyIdentity === historyIdentity && e.stageKey === s.stageKey)) ?? null
}

/** If interrupted between the local event and answer writes, recover from the journal. */
export function restoreResearchAnswers(data: SituationalAttemptResponse, stored: Record<string, SituationalDraftAnswer>, events: SituationalResearchEvent[]): Record<string, SituationalDraftAnswer> {
  if (!researchEnabled(data) || data.instrument.definition.schemaVersion !== 2) return stored
  const answers: Record<string, SituationalDraftAnswer> = {}
  for (const event of events) {
    const node: SituationalRunnerBranchSceneNode | undefined = data.instrument.definition.flow.nodes.find((n): n is SituationalRunnerBranchSceneNode => n.nodeType === 'SCENE' && n.nodeKey === event.nodeKey)
    if (node?.nodeType !== 'SCENE' || !event.channelKey) continue
    const pair = `${node.sceneKey}:${event.channelKey}`
    if (event.type === 'RESPONSE_INVALIDATED') delete answers[pair]
    if ((event.type === 'RESPONSE_FIRST_COMMITTED' || event.type === 'RESPONSE_CHANGED') && event.responseValue !== undefined) answers[pair] = {
      ...stored[pair], responseValue: event.responseValue, historyIdentity: event.historyIdentity, responseRevision: event.responseRevision,
    }
  }
  return answers
}
