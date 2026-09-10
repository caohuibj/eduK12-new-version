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
 * D keeps measurement/delivery policy on the V2 graph instead of widening the
 * published V1 scientific channel schema. Omitted policy preserves the V2-C
 * contract: channels are required and scored.
 */
export const situationalMeasurementRoleSchema = z.enum(['SCORED', 'ROUTING_ONLY'])
export type SituationalMeasurementRole = z.infer<typeof situationalMeasurementRoleSchema>

export const situationalInteractionRoleSchema = z.enum(['DECISION', 'DIAGNOSTIC'])
export type SituationalInteractionRole = z.infer<typeof situationalInteractionRoleSchema>

export const situationalBranchChannelPolicySchema = z.object({
  channelKey: situationalOpaqueKeySchema,
  measurementRole: situationalMeasurementRoleSchema.optional(),
  required: z.boolean().optional(),
}).strict()
export type SituationalBranchChannelPolicy = z.infer<typeof situationalBranchChannelPolicySchema>

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
  /** Explicit interaction semantics; omitted keeps pre-D V2 definitions valid. */
  interactionRole: situationalInteractionRoleSchema.optional(),
  /**
   * Per-channel V2 policy. Omitted entries mean SCORED + required. The policy
   * is frozen definition metadata, never a mutable server-side round state.
   */
  channelPolicies: z.array(situationalBranchChannelPolicySchema).optional(),
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
export type SituationalBranchSceneNode = z.infer<typeof situationalBranchSceneNodeSchema>

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
 * prevents V2 policy from mutating published V1 definitions or hashes.
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

const sceneNodeFor = (
  definition: SituationDefinitionV2,
  sceneKey: string,
): SituationalBranchSceneNode | undefined => definition.flow.nodes.find(
  (node): node is SituationalBranchSceneNode => node.nodeType === 'SCENE' && node.sceneKey === sceneKey,
)

export const situationalBranchChannelPolicy = (
  definition: SituationDefinitionV2,
  sceneKey: string,
  channelKey: string,
): { measurementRole: SituationalMeasurementRole; required: boolean } => {
  const node = sceneNodeFor(definition, sceneKey)
  const policy = node?.channelPolicies?.find((candidate) => candidate.channelKey === channelKey)
  return {
    measurementRole: policy?.measurementRole ?? 'SCORED',
    required: policy?.required !== false,
  }
}

/**
 * The existing V1 validator remains authoritative for the scientific scoring
 * plane. ROUTING_ONLY channels are intentionally removed only from this
 * validation/scoring projection; they remain in the frozen scene and raw FINAL.
 */
const asScoredV1Definition = (definition: SituationDefinitionV2): SituationDefinitionV1 => {
  const linear = asV1Definition(definition)
  const scoredPairs = new Set<string>()
  const scenes = linear.scenes.flatMap((scene) => {
    const channels = scene.channels.filter((channel) => {
      const scored = situationalBranchChannelPolicy(definition, scene.sceneKey, channel.channelKey).measurementRole === 'SCORED'
      if (scored) scoredPairs.add(`${scene.sceneKey}:${channel.channelKey}`)
      return scored
    })
    return channels.length > 0 ? [{ ...scene, channels }] : []
  })
  return {
    ...linear,
    scenes,
    scoring: {
      ...linear.scoring,
      choiceScores: linear.scoring.choiceScores.filter((entry) => scoredPairs.has(`${entry.sceneKey}:${entry.channelKey}`)),
    },
  }
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
 * contract. D adds only explicit interaction/channel policy checks; it does not
 * introduce a generic rule engine or a second scorer.
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
  const commonValidation = validateSituationDefinition(asScoredV1Definition(definition), options)
  const issues: DefinitionIssue[] = [...commonValidation.issues]
  const nodeIndexByKey = new Map<string, number>()
  const nodeByKey = new Map<string, SituationalBranchFlowNode>()
  const sceneNodeIndexBySceneKey = new Map<string, number>()
  const structuralStepIndex = new Map<string, number>()

  const sceneKeys = new Set<string>()
  const sceneSortOrders = new Set<number>()
  definition.scenes.forEach((scene, sceneIndex) => {
    if (sceneKeys.has(scene.sceneKey)) {
      issues.push(issue(`scenes.${sceneIndex}.sceneKey`, `场景编码不能重复：${scene.sceneKey}`))
    }
    sceneKeys.add(scene.sceneKey)
    if (sceneSortOrders.has(scene.sortOrder)) {
      issues.push(issue(`scenes.${sceneIndex}.sortOrder`, `场景 sortOrder 不能重复：${scene.sortOrder}`))
    }
    sceneSortOrders.add(scene.sortOrder)
    const declaredConstructs = new Set([scene.primaryConstruct, ...scene.secondaryConstructs])
    const channelKeys = new Set<string>()
    scene.channels.forEach((channel, channelIndex) => {
      if (channelKeys.has(channel.channelKey)) {
        issues.push(issue(`scenes.${sceneIndex}.channels.${channelIndex}.channelKey`, `同一场景内通道不能重复：${channel.channelKey}`))
      }
      channelKeys.add(channel.channelKey)
      if (!declaredConstructs.has(channel.scoredConstruct)) {
        issues.push(issue(
          `scenes.${sceneIndex}.channels.${channelIndex}.scoredConstruct`,
          `通道构念 ${channel.scoredConstruct} 未在场景 primary/secondary constructs 中声明`,
        ))
      }
      if (channel.responseType === 'SINGLE_CHOICE') {
        const optionKeys = new Set<string>()
        channel.options.forEach((option, optionIndex) => {
          if (optionKeys.has(option.optionKey)) {
            issues.push(issue(
              `scenes.${sceneIndex}.channels.${channelIndex}.options.${optionIndex}.optionKey`,
              `同一选择通道内 optionKey 不能重复：${option.optionKey}`,
            ))
          }
          optionKeys.add(option.optionKey)
        })
      } else if (channel.range.min >= channel.range.max) {
        issues.push(issue(`scenes.${sceneIndex}.channels.${channelIndex}.range`, 'CONTINUOUS 通道的 range.min 必须小于 range.max'))
      }
    })
  })

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

    if (node.interactionRole === 'DIAGNOSTIC' && node.transition.type !== 'NEXT') {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.transition`,
        `DIAGNOSTIC 节点不能驱动分支：${node.nodeKey}`,
      ))
    }
    if (node.interactionRole === 'DECISION' && node.transition.type !== 'DECISION') {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.transition`,
        `DECISION 节点必须声明 deterministic DECISION transition：${node.nodeKey}`,
      ))
    }

    const channelByKey = new Map(scene.channels.map((channel) => [channel.channelKey, channel] as const))
    const policyKeys = new Set<string>()
    node.channelPolicies?.forEach((policy, policyIndex) => {
      if (policyKeys.has(policy.channelKey)) {
        issues.push(issue(
          `flow.nodes.${nodeIndex}.channelPolicies.${policyIndex}.channelKey`,
          `同一节点的 channel policy 不能重复：${policy.channelKey}`,
        ))
      }
      policyKeys.add(policy.channelKey)
      if (!channelByKey.has(policy.channelKey)) {
        issues.push(issue(
          `flow.nodes.${nodeIndex}.channelPolicies.${policyIndex}.channelKey`,
          `channel policy 引用了不存在的场景通道：${node.sceneKey}:${policy.channelKey}`,
        ))
      }
      if (policy.measurementRole === 'ROUTING_ONLY') {
        const hasContribution = definition.scoring.choiceScores.some((entry) => (
          entry.sceneKey === node.sceneKey && entry.channelKey === policy.channelKey
        ))
        if (hasContribution) {
          issues.push(issue(
            `flow.nodes.${nodeIndex}.channelPolicies.${policyIndex}.measurementRole`,
            `ROUTING_ONLY 通道不能保留 choice scoring contribution：${node.sceneKey}:${policy.channelKey}`,
          ))
        }
      }
    })

    if (node.transition.type !== 'DECISION') return
    const transition = node.transition

    const channel = channelByKey.get(transition.channelKey)
    if (!channel) {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.transition.channelKey`,
        `Decision 引用了不存在的场景通道：${node.sceneKey}:${transition.channelKey}`,
      ))
      return
    }
    if (channel.responseType !== 'SINGLE_CHOICE') {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.transition.channelKey`,
        `Decision branching 只能绑定 SINGLE_CHOICE 通道：${node.sceneKey}:${transition.channelKey}`,
      ))
      return
    }
    if (!situationalBranchChannelPolicy(definition, node.sceneKey, transition.channelKey).required) {
      issues.push(issue(
        `flow.nodes.${nodeIndex}.channelPolicies`,
        `驱动 Decision transition 的通道必须 required：${node.sceneKey}:${transition.channelKey}`,
      ))
    }

    const validOptionKeys = new Set(channel.options.map((option) => option.optionKey))
    const branchOptionKeys = new Set<string>()
    transition.branches.forEach((branch, branchIndex) => {
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
 * needed for deterministic local traversal. MeasurementRole remains server
 * side; only required=false is exposed because the runner must know what blocks
 * local traversal. interactionRole is safe presentation metadata.
 */
export const runnerBranchingSituationDefinition = (definition: SituationDefinitionV2) => {
  const linearRunner = runnerSituationDefinition(asV1Definition(definition))
  return {
    ...linearRunner,
    schemaVersion: 2 as const,
    sampling: definition.sampling,
    scenes: linearRunner.scenes.map((scene) => ({
      ...scene,
      channels: scene.channels.map((channel) => ({
        ...channel,
        ...(situationalBranchChannelPolicy(definition, scene.sceneKey, channel.channelKey).required
          ? {}
          : { required: false as const }),
      })),
    })),
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
              ...(node.interactionRole ? { interactionRole: node.interactionRole } : {}),
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
