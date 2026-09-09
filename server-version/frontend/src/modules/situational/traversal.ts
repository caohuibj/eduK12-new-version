import type {
  SituationalDraftAnswer,
  SituationalRunnerDefinition,
  SituationalRunnerScene,
} from './types'

const responseKey = (sceneKey: string, channelKey: string): string => `${sceneKey}:${channelKey}`

const sceneIsAnswered = (
  scene: SituationalRunnerScene,
  responses: Record<string, SituationalDraftAnswer>,
): boolean => scene.channels.every((channel) => responses[responseKey(scene.sceneKey, channel.channelKey)] !== undefined)

export interface SituationalReachableTrajectory {
  nodeKeys: string[]
  sceneKeys: string[]
  terminalNodeKey: string | null
}

/**
 * Derive the client-visible trajectory from the frozen runner definition and
 * raw local answers. No active-node cursor is stored separately. V1 keeps its
 * historical linear presentation semantics; V2 advances only after the
 * current scene is complete, then follows the frozen deterministic graph.
 */
export const deriveReachableTrajectory = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): SituationalReachableTrajectory => {
  if (definition.schemaVersion === 1) {
    return {
      nodeKeys: [],
      sceneKeys: definition.scenes.map((scene) => scene.sceneKey),
      terminalNodeKey: null,
    }
  }

  const nodeByKey = new Map(definition.flow.nodes.map((node) => [node.nodeKey, node] as const))
  const sceneByKey = new Map(definition.scenes.map((scene) => [scene.sceneKey, scene] as const))
  const visited = new Set<string>()
  const nodeKeys: string[] = []
  const sceneKeys: string[] = []
  let currentNodeKey: string | null = definition.flow.entryNodeKey
  let terminalNodeKey: string | null = null

  while (currentNodeKey) {
    if (visited.has(currentNodeKey)) break
    visited.add(currentNodeKey)

    const node = nodeByKey.get(currentNodeKey)
    if (!node) break
    nodeKeys.push(node.nodeKey)

    if (node.nodeType === 'TERMINAL') {
      terminalNodeKey = node.nodeKey
      break
    }

    const scene = sceneByKey.get(node.sceneKey)
    if (!scene) break
    sceneKeys.push(scene.sceneKey)

    // A branching scene may expose more than the routing channel. The entire
    // scene must be complete before traversal can advance to the next node.
    if (!sceneIsAnswered(scene, responses)) break

    if (node.transition.type === 'NEXT') {
      currentNodeKey = node.transition.nextNodeKey
      continue
    }

    const answer = responses[responseKey(scene.sceneKey, node.transition.channelKey)]
    if (!answer || typeof answer.responseValue !== 'string') break
    const branch = node.transition.branches.find((candidate) => candidate.optionKey === answer.responseValue)
    if (!branch) break
    currentNodeKey = branch.nextNodeKey
  }

  return { nodeKeys, sceneKeys, terminalNodeKey }
}

export const reachableSituationalScenes = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): SituationalRunnerScene[] => {
  if (definition.schemaVersion === 1) return definition.scenes
  const reachable = new Set(deriveReachableTrajectory(definition, responses).sceneKeys)
  const sceneByKey = new Map(definition.scenes.map((scene) => [scene.sceneKey, scene] as const))
  return deriveReachableTrajectory(definition, responses).sceneKeys.flatMap((sceneKey) => {
    const scene = sceneByKey.get(sceneKey)
    return scene ? [scene] : []
  }).filter((scene) => reachable.has(scene.sceneKey))
}

export const situationalTrajectoryReachedTerminal = (
  definition: SituationalRunnerDefinition,
  responses: Record<string, SituationalDraftAnswer>,
): boolean => definition.schemaVersion === 1 || deriveReachableTrajectory(definition, responses).terminalNodeKey !== null
