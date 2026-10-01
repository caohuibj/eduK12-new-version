import { createHash } from 'node:crypto'
import type { SituationRuntimeDefinition } from './situation-runtime-definition'
import { runnerSituationRuntimeDefinition } from './situation-runtime-definition'

export interface SituationalAssignmentManifest {
  assignmentVersion: string
  assignmentIdentity: string
  seedIdentity: string
  selections: Array<{ groupKey: string; nodeKey: string; eligibleSet: string[]; assignedVariant: string; probability: number; omittedChannelKeys: string[]; probeTiming: 'DEFINED' | 'PRE_CHOICE' | 'POST_CHOICE'; stimulusVariantKey?: string }>
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Frozen contract + immutable attempt identity. Never depends on user PII or RNG state. */
export function deriveSituationalAssignment(definition: SituationRuntimeDefinition, attemptId: string, definitionHash: string): SituationalAssignmentManifest {
  const contract = definition.schemaVersion === 2 ? definition.researchAssignment : undefined
  const seedIdentity = hash(`situational-assignment-v1:${attemptId}:${definitionHash}`)
  const selections = (contract?.groups ?? []).map(group => {
    const total = group.variants.reduce((sum, v) => sum + v.weight, 0)
    const draw = parseInt(hash(`${seedIdentity}:${group.groupKey}`).slice(0, 13), 16) / 0x10000000000000 * total
    let cumulative = 0
    const selected = group.variants.find(v => { cumulative += v.weight; return draw < cumulative }) ?? group.variants[group.variants.length - 1]!
    return { groupKey: group.groupKey, nodeKey: group.nodeKey, eligibleSet: group.variants.map(v => v.variantKey), assignedVariant: selected.variantKey, probability: selected.weight / total, omittedChannelKeys: selected.omittedChannelKeys, probeTiming: selected.probeTiming, ...(selected.stimulusVariantKey ? { stimulusVariantKey: selected.stimulusVariantKey } : {}) }
  })
  const assignmentVersion = contract?.assignmentVersion ?? 'all-administered-v1'
  return { assignmentVersion, seedIdentity, selections, assignmentIdentity: hash(JSON.stringify({ assignmentVersion, seedIdentity, selections })) }
}

export function assignedSituationalDefinition(definition: SituationRuntimeDefinition, manifest: SituationalAssignmentManifest): SituationRuntimeDefinition {
  if (definition.schemaVersion === 1 || !manifest.selections.length) return definition
  const byNode = new Map(manifest.selections.map(s => [s.nodeKey, s]))
  const sceneNodes = definition.flow.nodes.filter(n => n.nodeType === 'SCENE')
  return { ...definition,
    scenes: definition.scenes.map(scene => {
      const node = sceneNodes.find(n => n.sceneKey === scene.sceneKey), assignment = node && byNode.get(node.nodeKey)
      if (!node || !assignment) return scene
      const stimulus = node.stimulusVariants?.find(v => v.variantKey === assignment.stimulusVariantKey)?.stimulus ?? scene.stimulus
      return { ...scene, stimulus, channels: scene.channels.filter(c => !assignment.omittedChannelKeys.includes(c.channelKey)) }
    }),
    flow: { ...definition.flow, nodes: definition.flow.nodes.map(node => {
      if (node.nodeType !== 'SCENE') return node
      const assignment = byNode.get(node.nodeKey)
      if (!assignment) return node
      let stages = node.responseStages?.map(s => ({ ...s, channelKeys: s.channelKeys.filter(k => !assignment.omittedChannelKeys.includes(k)) })).filter(s => s.channelKeys.length)
      if (stages && assignment.probeTiming !== 'DEFINED') {
        const choice = stages.filter(s => s.kind === 'CHOICE'), probes = stages.filter(s => s.kind !== 'CHOICE').map(s => ({ ...s, kind: assignment.probeTiming === 'PRE_CHOICE' ? 'PRE_CHOICE_PROBE' as const : 'POST_CHOICE_PROBE' as const }))
        stages = assignment.probeTiming === 'PRE_CHOICE' ? [...probes, ...choice] : [...choice, ...probes]
      }
      return { ...node, ...(stages ? { responseStages: stages } : {}) }
    }) },
  }
}

export const assignedSituationalRunnerDefinition = (definition: SituationRuntimeDefinition, manifest: SituationalAssignmentManifest) => runnerSituationRuntimeDefinition(assignedSituationalDefinition(definition, manifest))
