import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  runnerSituationDefinition,
  situationDefinitionSchema,
  situationalOpaqueKeySchema,
  validateSituationDefinition,
  type DefinitionIssue,
  type SituationDefinitionV1,
  type SituationDefinitionValidationOptions,
} from './situation-definition'

/**
 * Situational V2 is deliberately a unit-local graph contract. It does not
 * create a new assessment runtime or server-side cursor. Each content node
 * references one existing scene, while terminal nodes carry no response
 * surface. The first version is a deterministic DAG only.
 */
const situationalNextTransitionSchema = z.object({
  type: z.literal('NEXT'),
  nextNodeKey: situationalOpaqueKeySchema,
}).strict()

const situationalDecisionBranchSchema = z.object({
  optionKey: situationalOpaqueKeySchema,
  nextNodeKey: situationalOpaqueKeySchema,
}).strict()

const situationalDecisionTransitionSchema = z.object({
  type: z.literal('DECISION'),
  channelKey: situationalOpaqueKeySchema,
  branches: z.array(situationalDecisionBranchSchema).min(1),
}).strict()

export const situationalBranchSceneNodeSchema = z.object({
  nodeType: z.literal('SCENE'),
  nodeKey: situationalOpaqueKeySchema,
  sceneKey: situationalOpaqueKeySchema,
  /** Stable content grouping only; not a server transaction/session boundary. */
  motherSceneKey: situationalOpaqueKeySchema,
  roundKey: situationalOpaqueKeySchema,
  stepKey: situationalOpaqueKeySchema,
  transition: z.union([
    situationalNextTransitionSchema,
    situationalDecisionTransitionSchema,
  ]),
}).strict()

export const situationalBranchTerminalNodeSchema = z.object({
  nodeType: z.literal('TERMINAL'),
  nodeKey: situationalOpaqueKeySchema,
}).strict()

export const situationalBranchFlowNodeSchema = z.discriminatedUnion('nodeType', [
  situationalBranchSceneNodeSchema,
  situationalBranchTerminalNodeSchema,
])
export type SituationalBranchFlowNode = z.infer<typeof situationalBranchFlowNodeSchema>

export const situationalBranchFlowSchema = z.object({
  strategy: z.literal('BRANCHING_DAG_V1'),
  entryNodeKey: situationalOpaqueKeySchema,
  nodes: z.array(situationalBranchFlowNodeSchema).min(2),
}).strict()
export type SituationalBranchFlow = z.infer<typeof situationalBranchFlowSchema>

/**
 * V1 `sampling: ALL` explicitly means every declared scene is presented.
 * Branching cannot reuse that semantic because one attempt presents only the
 * scenes reachable from its decisions. This remains deterministic traversal,
 * not matrix/random sampling.
 */
export const situationalBranchSamplingSchema = z.object({
  strategy: z.literal('BRANCH_REACHABLE'),
}).strict()

/**
 * V2 retains the complete V1 scientific/scoring plane and adds only the
 * presentation/traversal graph. Keeping V1 as a separate exported contract
 * prevents PR A from silently enabling V2 in production runtimes before the
 * client traversal and authoritative FINAL work land in later PRs.
 */
export const situationDefinitionV2Schema = situationDefinitionSchema.extend({
  schemaVersion: z.literal(2),
  sampling: situationalBranchSamplingSchema,
  flow: situationalBranchFlowSchema,
})
export type SituationDefinitionV2 = z.infer<typeof situationDefinitionV2Schema>

const asV1Definition = (definition: SituationDefinitionV2): SituationDefinitionV1 => {
  const {
    flow: _flow,
    schemaVersion: _schemaVersion,
    sampling: _sampling,
    ...rest
  } = definition
  return { ...rest, schemaVersion: 1, sampling: { strategy: 'ALL' } }
}

const outgoingNodeKeys = (node: SituationalBranchFlowNode): string[] => {
  if (node.nodeType === 'TERMINAL') return []
  if (node.transition.type === 'NEXT') return [node.transition.nextNodeKey]
  return node.transition.branches.map((branch) => branch.nextNodeKey)
}

const issue = (path: string, message: string): DefinitionIssue => ({
  path,
  message,
  severity: 'error',
})

/**
 * Validate the V2 graph on top of the already-authoritative V1 scientific
 * contract. This intentionally reuses V1 validation rather than forking the
 * scoring/report/publication rules into a second validator.
 */
export const validateBranchingSituationDefinition = (
  value: unknown,
  options: SituationDefinitionValidationOptions = {},
): { definition?: SituationDefinitionV2; issues: DefinitionIssue[] } => {
  const parsed = situationDefinitionV2Schema.safeParse(value)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((entry) => ({
        path: entry.path.join('.') || 'definition',
        message: entry.message,
        severity: 'error',
      })),
    }
  }

  const definition = parsed.data
  const commonValidation = validateSituationDefinition(asV1Definition(definition), options)
  const issues: DefinitionIssue[] = [...commonValidation.issues]
  const nodeIndexByKey = new Map<string, number>()
  const nodeByKey = new Map<string, SituationalBranchFlowNode>()
  const sceneNodeIndexBySceneKey = new Map<string, number>()
  const structuralStepIndex = new Map<string, number>()

  definition.flow.nodes.forEach((node, nodeIndex) => {
    if (nodeByKey.has(node.nodeKey)) {
      issues.push(issue(`flow.nodes.${nodeIndex}.nodeKey`, `分支节点 nodeKey 不能重复：${node.nodeKey}`))
    } else {
      nodeByKey.set(node.nodeKey, node)
      nodeIndexByKey.set(node.nodeKey, nodeIndex)
    }

    if (node.nodeType !== 'SCENE') return

    if (sceneNodeIndexBySceneKey.has(node.sceneKey)) {
      issues.push(issue(`flow.nodes.${nodeIndex}.sceneKey`, `同一场景只能绑定一个分支节点：${node.sceneKey}`))
    } else {
      sceneNodeIndexBySceneKey.set(node.sceneKey, nodeIndex)
    }

    const structuralIdentity = `${node.motherSceneKey}:${node.roundKey}:${node.stepKey}`
    if (structuralStepIndex.has(structuralIdentity)) {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.stepKey`,
        `同一 motherScene × round 内 stepKey 必须唯一：${structuralIdentity}`,
      ))
    } else {
      structuralStepIndex.set(structuralIdentity, nodeIndex)
    }
  })

  const entryNode = nodeByKey.get(definition.flow.entryNodeKey)
  if (!entryNode) {
    issues.push(issue('flow.entryNodeKey', `入口节点不存在：${definition.flow.entryNodeKey}`))
  } else if (entryNode.nodeType !== 'SCENE') {
    issues.push(issue('flow.entryNodeKey', '入口节点必须是 SCENE，不能直接指向 TERMINAL'))
  }

  const sceneByKey = new Map(definition.scenes.map((scene) => [scene.sceneKey, scene] as const))
  definition.flow.nodes.forEach((node, nodeIndex) => {
    if (node.nodeType !== 'SCENE') return

    const scene = sceneByKey.get(node.sceneKey)
    if (!scene) {
      issues.push(issue(`flow.nodes.${nodeIndex}.sceneKey`, `分支节点引用了不存在的场景：${node.sceneKey}`))
      return
    }

    if (node.transition.type !== 'DECISION') return

    const channel = scene.channels.find((candidate) => candidate.channelKey === node.transition.channelKey)
    if (!channel) {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.transition.channelKey`,
        `Decision 引用了不存在的场景通道：${node.sceneKey}:${node.transition.channelKey}`,
      ))
      return
    }
    if (channel.responseType !== 'SINGLE_CHOICE') {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.transition.channelKey`,
        `Decision branching 只能绑定 SINGLE_CHOICE 通道：${node.sceneKey}:${node.transition.channelKey}`,
      ))
      return
    }

    const validOptionKeys = new Set(channel.options.map((option) => option.optionKey))
    const branchOptionKeys = new Set<string>()
    node.transition.branches.forEach((branch, branchIndex) => {
      if (branchOptionKeys.has(branch.optionKey)) {
        issues.push(issue(
          `flow.nodes.${nodeIndex}.transition.branches.${branchIndex}.optionKey`,
          `Decision option 只能声明一条 transition：${branch.optionKey}`,
        ))
      }
      branchOptionKeys.add(branch.optionKey)
      if (!validOptionKeys.has(branch.optionKey)) {
        issues.push(issue(
          `flow.nodes.${nodeIndex}.transition.branches.${branchIndex}.optionKey`,
          `Decision transition 引用了不存在的 optionKey：${branch.optionKey}`,
        ))
      }
    })
    channel.options.forEach((option) => {
      if (!branchOptionKeys.has(option.optionKey)) {
        issues.push(issue(
          `flow.nodes.${nodeIndex}.transition.branches`,
          `Decision 必须为每个可选 option 声明 deterministic transition：${option.optionKey}`,
        ))
      }
    })
  })

  definition.scenes.forEach((scene, sceneIndex) => {
    if (!sceneNodeIndexBySceneKey.has(scene.sceneKey)) {
      issues.push(issue(
        `scenes.${sceneIndex}.sceneKey`,
        `V2 flow 必须且只能引用每个声明场景一次：${scene.sceneKey}`,
      ))
    }
  })

  definition.flow.nodes.forEach((node, nodeIndex) => {
    outgoingNodeKeys(node).forEach((targetNodeKey) => {
      if (!nodeByKey.has(targetNodeKey)) {
        issues.push(issue(
          `flow.nodes.${nodeIndex}.transition`,
          `transition target 不存在：${targetNodeKey}`,
        ))
      }
    })
  })

  if (!definition.flow.nodes.some((node) => node.nodeType === 'TERMINAL')) {
    issues.push(issue('flow.nodes', 'BRANCHING_DAG_V1 至少需要一个 TERMINAL 节点'))
  }

  // Global cycle detection: even an unreachable cycle is invalid publication
  // content and must not hide behind the entry-path reachability check.
  const visitState = new Map<string, 'visiting' | 'visited'>()
  let hasCycle = false
  const visit = (nodeKey: string): void => {
    const state = visitState.get(nodeKey)
    if (state === 'visiting') {
      hasCycle = true
      const nodeIndex = nodeIndexByKey.get(nodeKey)
      issues.push(issue(
        nodeIndex === undefined ? 'flow.nodes' : `flow.nodes.${nodeIndex}.nodeKey`,
        `BRANCHING_DAG_V1 不能包含 cycle：${nodeKey}`,
      ))
      return
    }
    if (state === 'visited') return
    const node = nodeByKey.get(nodeKey)
    if (!node) return
    visitState.set(nodeKey, 'visiting')
    outgoingNodeKeys(node).forEach((targetNodeKey) => {
      if (nodeByKey.has(targetNodeKey)) visit(targetNodeKey)
    })
    visitState.set(nodeKey, 'visited')
  }
  nodeByKey.forEach((_node, nodeKey) => visit(nodeKey))

  // Every declared node must belong to the graph rooted at entry. This rejects
  // orphan content even when the orphan itself is internally well-formed.
  const reachable = new Set<string>()
  if (entryNode) {
    const pending = [definition.flow.entryNodeKey]
    while (pending.length > 0) {
      const nodeKey = pending.pop()!
      if (reachable.has(nodeKey)) continue
      const node = nodeByKey.get(nodeKey)
      if (!node) continue
      reachable.add(nodeKey)
      outgoingNodeKeys(node).forEach((targetNodeKey) => {
        if (!reachable.has(targetNodeKey)) pending.push(targetNodeKey)
      })
    }
  }
  definition.flow.nodes.forEach((node, nodeIndex) => {
    if (!reachable.has(node.nodeKey)) {
      issues.push(issue(`flow.nodes.${nodeIndex}.nodeKey`, `分支节点不可从 entry 到达：${node.nodeKey}`))
    }
  })

  // A fixed-point proof that every outgoing branch eventually reaches a
  // terminal. For decision nodes, every option path must terminate.
  if (!hasCycle) {
    const guaranteedTerminal = new Set(
      definition.flow.nodes.filter((node) => node.nodeType === 'TERMINAL').map((node) => node.nodeKey),
    )
    let changed = true
    while (changed) {
      changed = false
      definition.flow.nodes.forEach((node) => {
        if (node.nodeType === 'TERMINAL' || guaranteedTerminal.has(node.nodeKey)) return
        const targets = outgoingNodeKeys(node)
        if (targets.length > 0 && targets.every((target) => guaranteedTerminal.has(target))) {
          guaranteedTerminal.add(node.nodeKey)
          changed = true
        }
      })
    }
    definition.flow.nodes.forEach((node, nodeIndex) => {
      if (reachable.has(node.nodeKey) && !guaranteedTerminal.has(node.nodeKey)) {
        issues.push(issue(
          `flow.nodes.${nodeIndex}.transition`,
          `从该节点存在无法到达 TERMINAL 的路径：${node.nodeKey}`,
        ))
      }
    })
  }

  return { definition, issues }
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

export const hashSituationDefinitionV2 = (definition: SituationDefinitionV2): string => (
  createHash('sha256').update(JSON.stringify(stableValue(definition))).digest('hex')
)

/**
 * Runner projection contains only presentation/response data plus the graph
 * needed for deterministic local traversal. Scoring contributions, constructs,
 * purposes, and scoring directions stay server-side.
 */
export const runnerBranchingSituationDefinition = (definition: SituationDefinitionV2) => {
  const linearRunner = runnerSituationDefinition(asV1Definition(definition))
  return {
    ...linearRunner,
    schemaVersion: 2 as const,
    sampling: definition.sampling,
    flow: {
      strategy: definition.flow.strategy,
      entryNodeKey: definition.flow.entryNodeKey,
      nodes: definition.flow.nodes.map((node) => (
        node.nodeType === 'TERMINAL'
          ? { nodeType: 'TERMINAL' as const, nodeKey: node.nodeKey }
          : {
              nodeType: 'SCENE' as const,
              nodeKey: node.nodeKey,
              sceneKey: node.sceneKey,
              motherSceneKey: node.motherSceneKey,
              roundKey: node.roundKey,
              stepKey: node.stepKey,
              transition: node.transition.type === 'NEXT'
                ? { type: 'NEXT' as const, nextNodeKey: node.transition.nextNodeKey }
                : {
                    type: 'DECISION' as const,
                    channelKey: node.transition.channelKey,
                    branches: node.transition.branches.map((branch) => ({
                      optionKey: branch.optionKey,
                      nextNodeKey: branch.nextNodeKey,
                    })),
                  },
            }
      )),
    },
  }
}
