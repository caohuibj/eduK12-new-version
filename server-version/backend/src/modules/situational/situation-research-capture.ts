import { createHash } from 'node:crypto'
import type { SituationRuntimeDefinition } from './situation-runtime-definition'
import { deriveAuthoritativeSituationalTrajectory } from './situation-trajectory'
import { createSituationalResponseValidator, type SituationalResponse } from './situation-scoring'
import { asLinearSituationDefinition } from './situation-runtime-definition'
import type { SituationalAssignmentManifest } from './situation-assignment'
import { researchCaptureSchema, type SituationalResearchCapture } from './situation-scientific-contract'

export function situationalResponseHistoryIdentities(definition: SituationRuntimeDefinition, responses: SituationalResponse[]): Map<string, string> {
  if (definition.schemaVersion === 1) return new Map()
  const trajectory = deriveAuthoritativeSituationalTrajectory(definition, responses)
  const values = new Map(responses.map(r => [`${r.sceneKey}:${r.channelKey}`, r]))
  const ancestors: Array<[string, string | number | null, number]> = [], result = new Map<string, string>()
  const nodes = new Map(definition.flow.nodes.map(n => [n.nodeKey, n])), scenes = new Map(definition.scenes.map(s => [s.sceneKey, s]))
  for (const nodeKey of trajectory.nodeKeys) {
    const node = nodes.get(nodeKey)
    if (node?.nodeType !== 'SCENE') continue
    result.set(node.sceneKey, createHash('sha256').update(JSON.stringify(ancestors)).digest('hex'))
    const choices = node.responseStages?.filter(s => s.kind === 'CHOICE').flatMap(s => s.channelKeys) ?? (node.transition.type === 'DECISION' ? [node.transition.channelKey] : scenes.get(node.sceneKey)?.channels.filter(c => node.channelPolicies?.find(p => p.channelKey === c.channelKey)?.required !== false).map(c => c.channelKey) ?? [])
    ancestors.push([node.nodeKey, null, 0])
    for (const key of choices) ancestors.push([`${node.nodeKey}:${key}`, values.get(`${node.sceneKey}:${key}`)?.responseValue ?? null, values.get(`${node.sceneKey}:${key}`)?.responseRevision ?? 0])
  }
  return result
}

/** Evidence consistency, not a claim that client telemetry is a trusted observation. */
export function validateSituationalResearchCapture(input: {
  definition: SituationRuntimeDefinition; definitionHash: string; assignment: SituationalAssignmentManifest;
  responses: SituationalResponse[]; capture?: SituationalResearchCapture;
}): SituationalResearchCapture | undefined {
  const { definition, responses } = input
  const staged = definition.schemaVersion === 2 && definition.flow.nodes.some(n => n.nodeType === 'SCENE' && n.responseStages)
  if (!input.capture) { if (staged || definition.schemaVersion === 2 && definition.researchAssignment) throw new Error('Frozen research design requires capture evidence'); return undefined }
  const capture = researchCaptureSchema.parse(input.capture)
  if (capture.definitionHash !== input.definitionHash || capture.assignmentIdentity !== input.assignment.assignmentIdentity) throw new Error('Research capture frozen identity mismatch')
  if (definition.schemaVersion !== 2) throw new Error('Research capture requires V2')
  const validator = createSituationalResponseValidator(asLinearSituationDefinition(definition))
  const current = new Map<string, SituationalResponse>(), first = new Set<string>(), exposures = new Set<string>(), confirmed = new Set<string>(), probeExposed = new Set<string>()
  let lastTime = -1
  let currentHistories = situationalResponseHistoryIdentities(definition, [])
  const nodes = new Map(definition.flow.nodes.map(n => [n.nodeKey, n]))
  for (const event of capture.events) {
    if (event.relativeTimeMs < lastTime) throw new Error('Research event time must be monotonic')
    lastTime = event.relativeTimeMs
    const node = nodes.get(event.nodeKey)
    if (node?.nodeType !== 'SCENE') throw new Error('Research event references unknown response node')
    const expected = currentHistories.get(node.sceneKey)
    const identity = `${node.nodeKey}:${event.historyIdentity}`
    const pair = `${node.sceneKey}:${event.channelKey ?? ''}`
    if (event.type !== 'RESPONSE_INVALIDATED' && expected !== event.historyIdentity) throw new Error('Research event belongs to unreachable or stale measurement history')
    if (event.type === 'NODE_EXPOSED') { exposures.add(identity); continue }
    if (!exposures.has(identity)) throw new Error('Response/probe event requires prior node exposure')
    const stage = node.responseStages?.find(s => s.stageKey === event.stageKey)
    const stageIdentity = `${identity}:${event.stageKey}`
    const priorStages = stage ? node.responseStages!.slice(0, node.responseStages!.indexOf(stage)) : []
    if (stage && priorStages.some(s => !confirmed.has(`${identity}:${s.stageKey}`))) throw new Error('Stage exposed/answered before prior stage confirmation')
    if (event.type === 'PROBE_EXPOSED') {
      if (!stage || stage.kind === 'CHOICE') throw new Error('Probe exposure requires frozen probe stage')
      probeExposed.add(stageIdentity); continue
    }
    if (event.type === 'STAGE_CONFIRMED') {
      if (!stage) throw new Error('Unknown confirmed stage')
      const scene = definition.scenes.find(s => s.sceneKey === node.sceneKey)!
      if (stage.channelKeys.some(k => node.channelPolicies?.find(p => p.channelKey === k)?.required !== false && !current.has(`${scene.sceneKey}:${k}`))) throw new Error('Confirmed stage lacks required response')
      confirmed.add(stageIdentity); continue
    }
    if (event.type === 'NODE_CONFIRMED') {
      const scene = definition.scenes.find(s => s.sceneKey === node.sceneKey)!
      if (scene.channels.some(c => node.channelPolicies?.find(p => p.channelKey === c.channelKey)?.required !== false && !current.has(`${scene.sceneKey}:${c.channelKey}`))) throw new Error('Confirmed node lacks required response')
      if (node.responseStages?.some(s => !confirmed.has(`${identity}:${s.stageKey}`))) throw new Error('Confirmed node lacks stage confirmation')
      continue
    }
    if (!event.channelKey) throw new Error('Response event requires channel identity')
    if (event.type === 'RESPONSE_INVALIDATED') {
      const old = current.get(pair)
      if (!old || old.historyIdentity !== event.historyIdentity) throw new Error('Invalidation must identify existing old evidence')
      current.delete(pair); currentHistories = situationalResponseHistoryIdentities(definition, [...current.values()]); continue
    }
    if (event.responseValue === undefined) throw new Error('Response event requires raw value')
    if (node.responseStages && (!stage || !stage.channelKeys.includes(event.channelKey))) throw new Error('Response outside frozen stage')
    if (stage && confirmed.has(stageIdentity)) throw new Error('Confirmed response stage cannot be edited')
    if (stage && stage.kind !== 'CHOICE' && !probeExposed.has(stageIdentity)) throw new Error('Probe response requires prior probe exposure')
    const response = { sceneKey: node.sceneKey, channelKey: event.channelKey, responseValue: event.responseValue, historyIdentity: event.historyIdentity, responseRevision: event.responseRevision }
    validator(response)
    if (event.responseRevision !== (current.get(pair)?.responseRevision ?? 0) + 1) throw new Error('Response revision must increment exactly once')
    const firstIdentity = `${pair}:${event.historyIdentity}`
    if (event.type === 'RESPONSE_FIRST_COMMITTED') {
      if (first.has(firstIdentity)) throw new Error('Duplicate first response for exposure history')
      first.add(firstIdentity)
    } else if (event.type === 'RESPONSE_CHANGED') {
      if (!current.has(pair)) throw new Error('Response change requires existing response')
    } else throw new Error('Unexpected research event')
    current.set(pair, response)
    // Upstream decisions invalidate every descendant, including converged nodes.
    const updated = situationalResponseHistoryIdentities(definition, [...current.values()])
    let pruned = false
    for (const [k, value] of current) if (value.historyIdentity !== updated.get(value.sceneKey)) { current.delete(k); pruned = true }
    currentHistories = pruned ? situationalResponseHistoryIdentities(definition, [...current.values()]) : updated
  }
  const histories = situationalResponseHistoryIdentities(definition, responses)
  const reasons = new Set<string>()
  for (const reason of capture.unansweredReasons ?? []) {
    const node = definition.flow.nodes.find(n => n.nodeKey === reason.nodeKey)
    if (node?.nodeType !== 'SCENE' || !histories.has(node.sceneKey) || !definition.scenes.find(s => s.sceneKey === node.sceneKey)?.channels.some(c => c.channelKey === reason.channelKey) || node.channelPolicies?.find(p => p.channelKey === reason.channelKey)?.required !== false) throw new Error('Missingness reason requires an administered optional opportunity')
    const pair = `${node.sceneKey}:${reason.channelKey}`
    if (reasons.has(pair) || responses.some(r => `${r.sceneKey}:${r.channelKey}` === pair)) throw new Error('Duplicate/answered missingness reason')
    reasons.add(pair)
  }
  for (const response of responses) {
    const pair = `${response.sceneKey}:${response.channelKey}`, recorded = current.get(pair)
    if (response.historyIdentity !== histories.get(response.sceneKey) || !recorded || recorded.responseValue !== response.responseValue || recorded.historyIdentity !== response.historyIdentity || recorded.responseRevision !== response.responseRevision) throw new Error('Final response is not bound to latest recorded exposure history')
  }
  if (current.size !== responses.length) throw new Error('Capture contains unsubmitted current responses')
  for (const node of definition.flow.nodes) if (node.nodeType === 'SCENE' && histories.has(node.sceneKey)) {
    const identity = `${node.nodeKey}:${histories.get(node.sceneKey)}`
    if (!exposures.has(identity) || node.responseStages?.some(s => !confirmed.has(`${identity}:${s.stageKey}`))) throw new Error('Final path has unexposed or unconfirmed stages')
  }
  return capture
}
