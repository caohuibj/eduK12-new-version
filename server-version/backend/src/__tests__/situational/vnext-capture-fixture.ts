import type { SituationDefinitionV2 } from '../../modules/situational/situation-branching'
import type { SituationalResponse } from '../../modules/situational/situation-scoring'
import type { SituationalResearchCapture } from '../../modules/situational/situation-scientific-contract'
import { deriveSituationalAssignment, assignedSituationalDefinition } from '../../modules/situational/situation-assignment'
import { hashSituationRuntimeDefinition } from '../../modules/situational/situation-runtime-definition'
import { situationalResponseHistoryIdentities } from '../../modules/situational/situation-research-capture'

export function captureFixture(source: SituationDefinitionV2, attemptId: string) {
  const definitionHash = hashSituationRuntimeDefinition(source), assignment = deriveSituationalAssignment(source, attemptId, definitionHash)
  const definition = assignedSituationalDefinition(source, assignment) as SituationDefinitionV2
  const responses: SituationalResponse[] = [], events: SituationalResearchCapture['events'] = []
  let nodeKey = definition.flow.entryNodeKey, time = 0
  while (true) {
    const node = definition.flow.nodes.find(n => n.nodeKey === nodeKey)!
    if (node.nodeType === 'TERMINAL') break
    const scene = definition.scenes.find(s => s.sceneKey === node.sceneKey)!
    const historyIdentity = situationalResponseHistoryIdentities(definition, responses).get(scene.sceneKey)!
    events.push({ type: 'NODE_EXPOSED', nodeKey, historyIdentity, relativeTimeMs: time++ })
    const stages = node.responseStages ?? [{ stageKey: 'unstaged', kind: 'CHOICE' as const, channelKeys: scene.channels.map(c => c.channelKey) }]
    for (const stage of stages) {
      if (stage.kind !== 'CHOICE') events.push({ type: 'PROBE_EXPOSED', nodeKey, stageKey: stage.stageKey, historyIdentity, relativeTimeMs: time++ })
      for (const channelKey of stage.channelKeys) {
        const channel = scene.channels.find(c => c.channelKey === channelKey)!
        if (node.channelPolicies?.find(p => p.channelKey === channelKey)?.required === false) continue
        const responseValue = channel.responseType === 'SINGLE_CHOICE' ? 'A' : 80
        const response = { sceneKey: scene.sceneKey, channelKey, responseValue, historyIdentity, responseRevision: 1, ...(node.responseStages ? { stageConfirmed: true } : {}) }
        responses.push(response)
        events.push({ type: 'RESPONSE_FIRST_COMMITTED', nodeKey, channelKey, responseValue, historyIdentity, responseRevision: 1, relativeTimeMs: time++, ...(node.responseStages ? { stageKey: stage.stageKey } : {}) })
      }
      if (node.responseStages) events.push({ type: 'STAGE_CONFIRMED', nodeKey, stageKey: stage.stageKey, historyIdentity, relativeTimeMs: time++ })
    }
    events.push({ type: 'NODE_CONFIRMED', nodeKey, historyIdentity, relativeTimeMs: time++ })
    nodeKey = node.transition.type === 'NEXT' ? node.transition.nextNodeKey : node.transition.branches.find(b => b.optionKey === 'A')!.nextNodeKey
  }
  const capture: SituationalResearchCapture = { captureVersion: 'situational-capture-v1', definitionHash, assignmentIdentity: assignment.assignmentIdentity, events }
  return { definition, definitionHash, assignment, responses, capture }
}
