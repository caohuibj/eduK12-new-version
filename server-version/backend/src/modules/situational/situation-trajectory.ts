import type { SituationDefinitionV1 } from './situation-definition'
import {
  situationalBranchChannelPolicy,
} from './situation-branching'
import type { SituationalResponse } from './situation-scoring'
import {
  asLinearSituationDefinition,
  isBranchingSituationDefinition,
  type SituationRuntimeDefinition,
} from './situation-runtime-definition'

const responseKey = (sceneKey: string, channelKey: string): string => `${sceneKey}:${channelKey}`

export interface AuthoritativeSituationalTrajectory {
  nodeKeys: string[]
  sceneKeys: string[]
  terminalNodeKey: string | null
  reachedTerminal: boolean
}

const responseMap = (
  responses: ReadonlyArray<Pick<SituationalResponse, 'sceneKey' | 'channelKey' | 'responseValue'>>,
): Map<string, Pick<SituationalResponse, 'responseValue'>> => new Map(
  responses.map((response) => [responseKey(response.sceneKey, response.channelKey), response]),
)

/**
 * Rebuild the path from the frozen definition and raw answers. There is no
 * separately persisted active-node cursor. Frozen graph validation owns DAG
 * integrity; this helper still fails closed if a malformed graph is observed.
 * Optional diagnostic channels do not block traversal; a DECISION routing
 * channel is publication-gated as required.
 */
export const deriveAuthoritativeSituationalTrajectory = (
  definition: SituationRuntimeDefinition,
  responses: ReadonlyArray<Pick<SituationalResponse, 'sceneKey' | 'channelKey' | 'responseValue'>>,
): AuthoritativeSituationalTrajectory => {
  if (!isBranchingSituationDefinition(definition)) {
    return {
      nodeKeys: [],
      sceneKeys: definition.scenes
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((scene) => scene.sceneKey),
      terminalNodeKey: null,
      reachedTerminal: true,
    }
  }

  const answers = responseMap(responses)
  const nodeByKey = new Map(definition.flow.nodes.map((node) => [node.nodeKey, node] as const))
  const sceneByKey = new Map(definition.scenes.map((scene) => [scene.sceneKey, scene] as const))
  const visited = new Set<string>()
  const nodeKeys: string[] = []
  const sceneKeys: string[] = []
  let currentNodeKey: string | null = definition.flow.entryNodeKey
  let terminalNodeKey: string | null = null

  while (currentNodeKey) {
    if (visited.has(currentNodeKey)) throw new Error(`Frozen Situational branching graph contains a cycle: ${currentNodeKey}`)
    visited.add(currentNodeKey)

    const node = nodeByKey.get(currentNodeKey)
    if (!node) throw new Error(`Frozen Situational branching target is missing: ${currentNodeKey}`)
    nodeKeys.push(node.nodeKey)

    if (node.nodeType === 'TERMINAL') {
      terminalNodeKey = node.nodeKey
      break
    }

    const scene = sceneByKey.get(node.sceneKey)
    if (!scene) throw new Error(`Frozen Situational branching scene is missing: ${node.sceneKey}`)
    sceneKeys.push(scene.sceneKey)

    const complete = scene.channels.every((channel) => (
      !situationalBranchChannelPolicy(definition, scene.sceneKey, channel.channelKey).required
      || answers.has(responseKey(scene.sceneKey, channel.channelKey))
    ))
    if (!complete) break

    if (node.transition.type === 'NEXT') {
      currentNodeKey = node.transition.nextNodeKey
      continue
    }

    const routingAnswer = answers.get(responseKey(scene.sceneKey, node.transition.channelKey))
    if (!routingAnswer || typeof routingAnswer.responseValue !== 'string') break
    const branch = node.transition.branches.find((candidate) => candidate.optionKey === routingAnswer.responseValue)
    if (!branch) break
    currentNodeKey = branch.nextNodeKey
  }

  return {
    nodeKeys,
    sceneKeys,
    terminalNodeKey,
    reachedTerminal: terminalNodeKey !== null,
  }
}

/** All response surfaces on the authoritative path, including optional diagnostics. */
export const reachableSituationalResponseKeys = (
  definition: SituationRuntimeDefinition,
  trajectory: AuthoritativeSituationalTrajectory,
): string[] => {
  const linear = asLinearSituationDefinition(definition)
  const sceneByKey = new Map(linear.scenes.map((scene) => [scene.sceneKey, scene] as const))
  return trajectory.sceneKeys.flatMap((sceneKey) => {
    const scene = sceneByKey.get(sceneKey)
    if (!scene) throw new Error(`Frozen Situational trajectory scene is missing: ${sceneKey}`)
    return scene.channels.map((channel) => responseKey(scene.sceneKey, channel.channelKey))
  })
}

/** Response surfaces that must be present for authoritative FINAL acceptance. */
export const requiredReachableSituationalResponseKeys = (
  definition: SituationRuntimeDefinition,
  trajectory: AuthoritativeSituationalTrajectory,
): string[] => {
  const linear = asLinearSituationDefinition(definition)
  const sceneByKey = new Map(linear.scenes.map((scene) => [scene.sceneKey, scene] as const))
  return trajectory.sceneKeys.flatMap((sceneKey) => {
    const scene = sceneByKey.get(sceneKey)
    if (!scene) throw new Error(`Frozen Situational trajectory scene is missing: ${sceneKey}`)
    return scene.channels.flatMap((channel) => {
      if (
        isBranchingSituationDefinition(definition)
        && !situationalBranchChannelPolicy(definition, scene.sceneKey, channel.channelKey).required
      ) return []
      return [responseKey(scene.sceneKey, channel.channelKey)]
    })
  })
}

/**
 * Produce the scientific plane consumed by the existing scorer. V1 is
 * unchanged. V2 keeps only reachable SCORED channels and their choice
 * contributions. ROUTING_ONLY answers stay in encrypted raw FINAL evidence but
 * never enter metric calculation. No second scorer is introduced.
 */
export const projectReachableSituationDefinitionForScoring = (
  definition: SituationRuntimeDefinition,
  trajectory: AuthoritativeSituationalTrajectory,
): SituationDefinitionV1 => {
  const linear = asLinearSituationDefinition(definition)
  if (!isBranchingSituationDefinition(definition)) return linear

  const sceneByKey = new Map(linear.scenes.map((scene) => [scene.sceneKey, scene] as const))
  const scoredPairs = new Set<string>()
  const scenes = trajectory.sceneKeys.flatMap((sceneKey) => {
    const scene = sceneByKey.get(sceneKey)
    if (!scene) throw new Error(`Frozen Situational trajectory scene is missing: ${sceneKey}`)
    const channels = scene.channels.filter((channel) => {
      const scored = situationalBranchChannelPolicy(definition, scene.sceneKey, channel.channelKey).measurementRole === 'SCORED'
      if (scored) scoredPairs.add(responseKey(scene.sceneKey, channel.channelKey))
      return scored
    })
    return channels.length > 0 ? [{ ...scene, channels }] : []
  })

  return {
    ...linear,
    scenes,
    scoring: {
      ...linear.scoring,
      choiceScores: linear.scoring.choiceScores.filter((entry) => scoredPairs.has(responseKey(entry.sceneKey, entry.channelKey))),
    },
  }
}
